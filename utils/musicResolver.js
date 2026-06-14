const https = require('https');
const http = require('http');

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const GDSTUDIO_BASE = process.env.GDSTUDIO_BASE_URL || '';
const GDSTUDIO_ENABLED = process.env.GDSTUDIO_ENABLED !== 'false';
let gdstudioDisabledUntil = 0;

function httpGet(url, headers = {}, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...headers },
      timeout: 15000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) {
          res.resume();
          reject(new Error('too many redirects'));
          return;
        }
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        httpGet(nextUrl, headers, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }

      let data = '';
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy(new Error('response too large'));
          return;
        }
        data += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\-_/()（）【】\[\]·.。]/g, '');
}

function normalizeArtistText(value) {
  return normalizeSearchText(String(value || '').replace(/[、，/&|]/g, ','));
}

function mapProviderToGDStudio(provider) {
  return provider === 'kuwo' ? 'kuwo' : 'netease';
}

async function gdstudioGet(params) {
  if (!GDSTUDIO_ENABLED || !GDSTUDIO_BASE) return null;
  if (Date.now() < gdstudioDisabledUntil) return null;

  try {
    const url = new URL(GDSTUDIO_BASE);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    }
    const result = await httpGet(url.toString(), { 'Accept': 'application/json' });
    const data = JSON.parse(result.data);
    if (result.status === 429 || data?.code === 429) {
      gdstudioDisabledUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }
    if (result.status >= 500) {
      gdstudioDisabledUntil = Date.now() + 60 * 1000;
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

async function neteaseSearch(q, limit = 10) {
  try {
    const result = await httpGet(`https://music.163.com/api/search/get/web?s=${encodeURIComponent(q)}&type=1&limit=${limit}`, { 'Referer': 'https://music.163.com/' });
    const data = JSON.parse(result.data);
    return (data.result?.songs || []).map(s => ({
      id: String(s.id),
      name: s.name || '',
      artist: (s.artists || []).map(a => a.name).join(', '),
      album: s.album?.name || '',
      cover: s.album?.picUrl || '',
      provider: 'netease',
      source: 'netease'
    }));
  } catch (e) { return []; }
}

function normalizeGDStudioSong(item, provider) {
  const artist = Array.isArray(item.artist) ? item.artist.join(', ') : String(item.artist || '');
  return {
    id: String(item.id || ''),
    name: item.name || '',
    artist,
    album: item.album || '',
    cover: '',
    provider: item.source || mapProviderToGDStudio(provider),
    source: 'gdstudio'
  };
}

function scoreSongCandidate(candidate, target, index) {
  const targetName = normalizeSearchText(target.name);
  const targetArtist = normalizeArtistText(target.artist);
  const name = normalizeSearchText(candidate.name);
  const artist = normalizeArtistText(candidate.artist);
  const album = normalizeSearchText(candidate.album);
  const rawName = String(candidate.name || '').toLowerCase();
  const rawAlbum = String(candidate.album || '').toLowerCase();

  if (!targetName || !name) return -999;

  let score = Math.max(0, 50 - index * 2);
  if (name === targetName) score += 120;
  else if (name.includes(targetName) || targetName.includes(name)) score += 55;
  else return -200;

  if (targetArtist && artist) {
    if (artist === targetArtist) score += 80;
    else if (artist.includes(targetArtist) || targetArtist.includes(artist)) score += 45;
    else score -= 180;
  }

  if (targetArtist && name.includes(targetArtist) && artist && !artist.includes(targetArtist)) score -= 80;

  if (album && (album.includes(targetName) || targetName.includes(album))) score += 5;
  if (candidate.source === 'gdstudio') score += 8;
  if (candidate.provider === 'netease') score += 5;

  const badPatterns = ['翻唱', 'cover', 'remix', '伴奏', '纯音乐', 'live', '现场', 'dj', '加速', '降调', '升调', '片段', '铃声', '二创', 'karaoke', 'instrumental', '伴唱', '消音', '剪辑'];
  if (badPatterns.some(word => rawName.includes(word) || rawAlbum.includes(word))) score -= 90;

  const goodPatterns = ['原版', '录音室', 'studio', '专辑版'];
  if (goodPatterns.some(word => rawName.includes(word) || rawAlbum.includes(word))) score += 15;

  return score;
}

async function searchGDStudioCandidates(name, artist, preferredProvider) {
  const query = `${name || ''} ${artist || ''}`.trim();
  if (!query) return [];

  const sources = [...new Set([mapProviderToGDStudio(preferredProvider), 'netease', 'kuwo'])];
  const candidates = [];
  for (const source of sources) {
    const data = await gdstudioGet({ types: 'search', source, name: query, count: 10, pages: 1 });
    if (Array.isArray(data)) candidates.push(...data.map(item => normalizeGDStudioSong(item, source)));
    if (candidates.length >= 10) break;
  }
  return candidates;
}

async function resolveBestSongVersion(name, artist, preferredProvider = 'netease') {
  const target = { name, artist };
  const candidates = [
    ...await searchGDStudioCandidates(name, artist, preferredProvider),
    ...await neteaseSearch(`${name || ''} ${artist || ''}`.trim(), 10)
  ].filter(song => song.id && song.name);

  if (!candidates.length) return null;

  const ranked = candidates
    .map((song, index) => ({ song, score: scoreSongCandidate(song, target, index) }))
    .filter(item => item.score > -100)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.song || null;
}

module.exports = {
  resolveBestSongVersion,
  scoreSongCandidate
};
