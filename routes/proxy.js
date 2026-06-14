const express = require('express');
const https = require('https');
const http = require('http');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
const PROVIDERS = new Set(['netease', 'qqmusic', 'kugou']);
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// 主接口配置：未配置 API Key 时默认跳过，避免失效网关拖慢主流程
const KARPOV_BASE = process.env.KARPOV_BASE_URL || '';
const KARPOV_KEY = process.env.KARPOV_API_KEY || '';
let karpovDisabledUntil = 0;

// 备用接口 fallback：无需密钥，默认启用；失败时继续走后续 fallback。
const GDSTUDIO_BASE = process.env.GDSTUDIO_BASE_URL || '';
const GDSTUDIO_ENABLED = process.env.GDSTUDIO_ENABLED !== 'false';
let gdstudioDisabledUntil = 0;

// 音乐搜索、播放、歌词和榜单会消耗第三方接口与服务器资源，统一要求登录后使用。
router.use(authRequired);

// 按用户限流：防止单账号脚本化刷接口，保护服务器和上游接口配额。
// 正常听歌一首最多触发 search+url+lyric 几次请求，100次/分钟对真人足够宽松，对脚本是有效闸门。
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 100;
const rateBuckets = new Map();

router.use((req, res, next) => {
  const now = Date.now();
  const key = String(req.user?.id || 'anonymous');
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + RATE_WINDOW_MS };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets.entries()) {
      if (v.resetAt <= now) rateBuckets.delete(k);
    }
  }

  if (bucket.count > RATE_MAX) {
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    return res.status(429).json({ code: 429, message: '请求过于频繁，请稍后再试' });
  }
  next();
});

function normalizeProvider(value) {
  return PROVIDERS.has(value) ? value : 'netease';
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function normalizeSong(song, provider) {
  const artist = typeof song.artist === 'string'
    ? song.artist
    : (song.artists || []).map(a => a.name).join(', ');
  return {
    id: song.id,
    name: song.title || song.name || '',
    artist,
    album: song.album?.title || song.album?.name || '',
    cover: song.album?.cover || song.album?.picUrl || '',
    duration: song.durationSeconds || Math.round((song.duration || 0) / 1000),
    provider: song.provider || provider,
    isVipOnly: !!song.isVipOnly,
    playable: song.playable !== false,
    source: 'karpov'
  };
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s\-_/()（）【】\[\]·.。]/g, '');
}

function scoreKarpovSong(song, query, index) {
  const keyword = normalizeSearchText(query);
  const name = normalizeSearchText(song.title || song.name || '');
  const artist = normalizeSearchText(typeof song.artist === 'string' ? song.artist : (song.artists || []).map(a => a.name).join(','));
  const album = normalizeSearchText(song.album?.title || song.album?.name || '');
  const rawName = String(song.title || song.name || '').toLowerCase();
  let score = 0;

  // 搜索结果通常已按相关度排序；这里主要惩罚翻唱/Live/伴奏等非原版。
  score += Math.max(0, 50 - index);
  if (name && keyword.includes(name)) score += 30;
  if (name && name === keyword) score += 50;
  if (artist && keyword.includes(artist)) score += 25;
  if (album && keyword.includes(album)) score += 8;
  if (song.album?.title || song.album?.name) score += 12;
  if (song.isVipOnly) score += 10; // 官方录音常常是 VIP；不要因为 VIP 被排到二创后面
  if (song.playable === false) score += 4; // 可播放标记不可靠，URL 接口可能仍可返回临时直链

  const unofficialPatterns = ['翻唱', 'cover', 'remix', '伴奏', '纯音乐', 'live', '现场', 'dj', '加速', '降调', '升调', '片段', '铃声', '二创'];
  if (unofficialPatterns.some(word => rawName.includes(word))) score -= 40;

  return score;
}

function sortKarpovSongs(items, q) {
  return [...items].sort((a, b) => scoreKarpovSong(b, q, items.indexOf(b)) - scoreKarpovSong(a, q, items.indexOf(a)));
}

// 通用 HTTP 请求
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

async function karpovGet(apiPath) {
  if (!KARPOV_BASE || !KARPOV_KEY) return { code: -1, message: 'karpov disabled' };
  if (Date.now() < karpovDisabledUntil) return { code: -1, message: 'karpov temporarily disabled' };

  try {
    const result = await httpGet(`${KARPOV_BASE}${apiPath}`, { 'x-api-key': KARPOV_KEY, 'Accept': 'application/json' });
    const data = JSON.parse(result.data);
    if (result.status === 401 || result.status === 403 || data.code === 40100 || data.code === 401 || data.code === 403) {
      karpovDisabledUntil = Date.now() + 5 * 60 * 1000;
    }
    return data;
  } catch (e) {
    return { code: -1, message: e.message };
  }
}

// 备用接口仅支持部分源，所有 provider 统一退回默认源；不支持的歌靠后续「按歌名搜索」兜底。
function mapProviderToGDStudio() {
  return 'netease';
}

function mapQualityToGDStudio(quality) {
  if (quality === 'MP3_128') return '128';
  if (quality === 'FLAC') return '999';
  return '320';
}

function gdstudioQualityLabel(br) {
  const value = Number.parseInt(br, 10);
  if (!Number.isFinite(value)) return '';
  if (value >= 1400) return 'Hi-Res 无损';
  if (value >= 700) return '无损';
  return `${value}k`;
}

function normalizeGDStudioSong(item, provider) {
  const artist = Array.isArray(item.artist) ? item.artist.join(', ') : String(item.artist || '');
  const sourceProvider = item.source || mapProviderToGDStudio(provider);
  return {
    id: item.id,
    name: item.name || '',
    artist,
    album: item.album || '',
    cover: '',
    duration: 0,
    provider: sourceProvider,
    source: 'gdstudio',
    picId: item.pic_id || '',
    urlId: item.url_id || item.id || '',
    lyricId: item.lyric_id || item.id || ''
  };
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

async function neteaseSearch(q, limit = 20) {
  try {
    const result = await httpGet(`https://music.163.com/api/search/get/web?s=${encodeURIComponent(q)}&type=1&limit=${limit}`, { 'Referer': 'https://music.163.com/' });
    const data = JSON.parse(result.data);
    return (data.result?.songs || []).map(s => ({
      id: s.id, name: s.name,
      artist: (s.artists || []).map(a => a.name).join(', '),
      album: s.album?.name || '', cover: s.album?.picUrl || '',
      duration: Math.round((s.duration || 0) / 1000), provider: 'netease', source: 'netease'
    }));
  } catch (e) { return []; }
}

async function kuwoSearchRid(name, artist) {
  try {
    const keyword = encodeURIComponent(`${name} ${artist}`.trim());
    const result = await httpGet(`https://search.kuwo.cn/r.s?all=${keyword}&ft=music&itemset=web_2013&client=kt&pn=0&rn=5&rformat=json&encoding=utf8`, { 'User-Agent': 'opai.xyz' });
    const match = result.data.match(/'MUSIC_(\d+)'/);
    return match ? match[1] : null;
  } catch (e) { return null; }
}

async function kuwoGetUrl(rid) {
  try {
    const result = await httpGet(`https://antiserver.kuwo.cn/anti.s?type=convert_url3&rid=${rid}&format=mp3&response=url`);
    const data = JSON.parse(result.data);
    return data.code === 200 ? data.url : null;
  } catch (e) { return null; }
}

async function neteaseLyric(id) {
  try {
    const result = await httpGet(`https://music.163.com/api/song/lyric?id=${encodeURIComponent(id)}&lv=1`, { 'Referer': 'https://music.163.com/' });
    const data = JSON.parse(result.data);
    return { lyric: data.lrc?.lyric || '', tlyric: data.tlyric?.lyric || '' };
  } catch (e) { return { lyric: '', tlyric: '' }; }
}

// 跨源兜底：当原 provider 拿不到歌词时，用歌名+歌手搜索同一首歌再取词。
async function crossProviderNeteaseLyric(name, artist) {
  try {
    if (!name) return { lyric: '', tlyric: '' };
    const candidates = await neteaseSearch(`${name} ${artist}`.trim(), 10);
    if (!candidates.length) return { lyric: '', tlyric: '' };

    const targetName = normalizeSearchText(name);
    const targetArtist = normalizeSearchText(artist);
    let best = null;
    let bestScore = -1;
    candidates.forEach((c, i) => {
      const cName = normalizeSearchText(c.name);
      const cArtist = normalizeSearchText(c.artist);
      if (!cName || !targetName) return;
      let score = Math.max(0, 10 - i);
      if (cName === targetName) score += 100;
      else if (cName.includes(targetName) || targetName.includes(cName)) score += 40;
      else return; // 歌名必须有重叠，否则跳过
      if (targetArtist && cArtist) {
        if (cArtist === targetArtist) score += 60;
        else if (cArtist.includes(targetArtist) || targetArtist.includes(cArtist)) score += 30;
        else score -= 50;
      }
      if (score > bestScore) { bestScore = score; best = c; }
    });

    if (!best || bestScore < 40) return { lyric: '', tlyric: '' };
    return await neteaseLyric(best.id);
  } catch (e) { return { lyric: '', tlyric: '' }; }
}

async function neteasePlaylist(id) {
  try {
    const result = await httpGet(`https://music.163.com/api/playlist/detail?id=${encodeURIComponent(id)}`, { 'Referer': 'https://music.163.com/' });
    const data = JSON.parse(result.data);
    const pl = data.result || {};
    return {
      id: pl.id, name: pl.name || '', cover: pl.coverImgUrl || '',
      playCount: pl.playCount || 0, trackCount: pl.trackCount || 0,
      songs: (pl.tracks || []).map(t => ({
        id: t.id, name: t.name,
        artist: (t.artists || []).map(a => a.name).join(', '),
        album: t.album?.name || '', cover: t.album?.picUrl || '',
        duration: Math.round((t.duration || 0) / 1000), provider: 'netease', source: 'netease'
      }))
    };
  } catch (e) { return null; }
}

// 搜索歌曲
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const provider = normalizeProvider(req.query.provider || 'netease');
    const limit = clampInt(req.query.page_size, 20, 1, 50);
    if (!q) return res.json({ code: 0, data: [], total: 0 });

    // 优先主接口
    const karpovResult = await karpovGet(`/v1/${provider}/search/songs?q=${encodeURIComponent(q)}&page=1&page_size=${limit}`);
    if (karpovResult.code === 200 && karpovResult.data?.items) {
      const songs = sortKarpovSongs(karpovResult.data.items, q).map(item => normalizeSong(item, provider));
      return res.json({ code: 0, data: songs, total: karpovResult.data.total || 0 });
    }

    // 备用接口 fallback
    const gdstudioProvider = mapProviderToGDStudio(provider);
    const gdstudioSearch = await gdstudioGet({ types: 'search', source: gdstudioProvider, name: q, count: limit, pages: 1 });
    if (Array.isArray(gdstudioSearch) && gdstudioSearch.length > 0) {
      const songs = gdstudioSearch.map(item => normalizeGDStudioSong(item, provider));
      return res.json({ code: 0, data: songs, total: songs.length });
    }

    // 备用：直接搜索
    const songs = await neteaseSearch(q, limit);
    res.json({ code: 0, data: songs, total: songs.length });
  } catch (e) { res.status(500).json({ code: -1, message: e.message, data: [] }); }
});

// 获取播放链接
router.get('/song/url', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim().slice(0, 128);
    const provider = normalizeProvider(req.query.provider || 'netease');
    const name = String(req.query.name || '').trim().slice(0, 200);
    const artist = String(req.query.artist || '').trim().slice(0, 200);
    const quality = ['MP3_128', 'MP3_320', 'FLAC'].includes(req.query.quality) ? req.query.quality : 'MP3_320';

    // 优先主接口
    if (id) {
      const karpovResult = await karpovGet(`/v1/${provider}/songs/${encodeURIComponent(id)}/url?quality=${quality}`);
      if (karpovResult.code === 200) {
        const url = karpovResult.data?.url || karpovResult.data?.audio?.url || '';
        if (url) {
          return res.json({
            code: 0,
            data: {
              url,
              source: 'karpov',
              quality: karpovResult.data?.audio?.quality || quality,
              qualityLabel: karpovResult.data?.audio?.qualityLabel || '',
              expiresInSeconds: karpovResult.data?.audio?.expiresInSeconds || 0
            }
          });
        }
      }
    }

    // 备用接口 fallback
    if (id) {
      const gdstudioProvider = mapProviderToGDStudio(provider);
      const brChain = quality === 'FLAC' ? ['999', '740', '320'] : [mapQualityToGDStudio(quality)];
      let gdstudioResult = null;
      for (const br of brChain) {
        gdstudioResult = await gdstudioGet({ types: 'url', source: gdstudioProvider, id, br });
        if (gdstudioResult?.url) break;
      }
      if (gdstudioResult?.url) {
        const br = gdstudioResult.br || mapQualityToGDStudio(quality);
        return res.json({
          code: 0,
          data: {
            url: gdstudioResult.url,
            source: 'gdstudio',
            quality,
            qualityLabel: gdstudioQualityLabel(br),
            size: gdstudioResult.size || 0
          }
        });
      }
    }

    // 备用直链。主接口和备用接口都没返回时使用。
    if (name && artist) {
      const rid = await kuwoSearchRid(name, artist);
      if (rid) {
        const url = await kuwoGetUrl(rid);
        if (url) return res.json({ code: 0, data: { url, source: 'kuwo', rid } });
      }
    }

    res.status(404).json({ code: -1, message: '无法获取播放链接' });
  } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
});

// 获取歌词
router.get('/lyric', async (req, res) => {
  try {
    const id = String(req.query.id || '').trim().slice(0, 128);
    const provider = normalizeProvider(req.query.provider || 'netease');
    const name = String(req.query.name || '').trim().slice(0, 200);
    const artist = String(req.query.artist || '').trim().slice(0, 200);
    if (!id) return res.status(400).json({ code: -1, message: '缺少歌曲ID', data: { lyric: '', tlyric: '' } });

    // 优先主接口。歌词嵌在 data.lyric.lrc / data.lyric.trans；也兼容扁平结构。
    const karpovResult = await karpovGet(`/v1/${provider}/songs/${encodeURIComponent(id)}/lyric`);
    if (karpovResult.code === 200 && karpovResult.data) {
      const kd = karpovResult.data;
      const lyric = kd.lyric?.lrc || kd.lrc?.lyric || (typeof kd.lyric === 'string' ? kd.lyric : '') || kd.lrc || '';
      const tlyric = kd.lyric?.trans || kd.trans?.lyric || (typeof kd.trans === 'string' ? kd.trans : '') || kd.tlyric || '';
      // 主接口偶尔返回 200 但歌词全空，此时继续走 fallback。
      if (lyric) {
        return res.json({ code: 0, data: { lyric, tlyric } });
      }
    }

    // 备用接口 fallback
    const gdstudioProvider = mapProviderToGDStudio(provider);
    const gdstudioLyric = await gdstudioGet({ types: 'lyric', source: gdstudioProvider, id });
    if (gdstudioLyric && (gdstudioLyric.lyric || gdstudioLyric.tlyric)) {
      return res.json({ code: 0, data: { lyric: gdstudioLyric.lyric || '', tlyric: gdstudioLyric.tlyric || '' } });
    }

    // 备用：直接搜索（仅当 id 本身是数字 id 时才有意义）
    if (provider === 'netease') {
      const neteaseResult = await neteaseLyric(id);
      if (neteaseResult.lyric) {
        return res.json({ code: 0, data: { lyric: neteaseResult.lyric, tlyric: neteaseResult.tlyric || '' } });
      }
    }

    // 最终兜底：用歌名+歌手跨源搜索同一首歌的歌词
    const cross = await crossProviderNeteaseLyric(name, artist);
    return res.json({ code: 0, data: { lyric: cross.lyric || '', tlyric: cross.tlyric || '' } });
  } catch (e) { res.status(500).json({ code: -1, message: e.message, data: { lyric: '', tlyric: '' } }); }
});

// 获取歌单详情
router.get('/playlist/:provider/:id', async (req, res) => {
  try {
    const provider = normalizeProvider(req.params.provider || 'netease');
    const id = String(req.params.id || '').trim().slice(0, 128);
    if (!id) return res.status(400).json({ code: -1, message: '缺少歌单ID' });

    // 优先主接口
    const karpovResult = await karpovGet(`/v1/${provider}/playlists/${encodeURIComponent(id)}`);
    if (karpovResult.code === 200 && karpovResult.data) {
      const pl = karpovResult.data;
      return res.json({ code: 0, data: {
        id: pl.id, name: pl.name || pl.title || '', cover: pl.cover || pl.picUrl || '', creator: pl.creator || '',
        songs: (pl.songs || []).map(s => ({
          id: s.id, name: s.title || s.name || '',
          artist: typeof s.artist === 'string' ? s.artist : (s.artists || []).map(a => a.name).join(', '),
          album: s.album?.title || s.album?.name || '', cover: s.album?.cover || s.album?.picUrl || pl.cover || pl.picUrl || '',
          duration: s.durationSeconds || Math.round((s.duration || 0) / 1000), provider: s.provider || provider, source: 'karpov',
          isVipOnly: !!s.isVipOnly, playable: s.playable !== false
        }))
      }});
    }

    // 备用：直接搜索
    if (provider === 'netease') {
      const pl = await neteasePlaylist(id);
      if (pl) return res.json({ code: 0, data: pl });
    }

    res.status(404).json({ code: -1, message: '获取歌单失败' });
  } catch (e) { res.status(500).json({ code: -1, message: e.message }); }
});

// 排行榜列表
router.get('/charts', async (req, res) => {
  try {
    const result = await httpGet('https://music.163.com/api/toplist', { 'Referer': 'https://music.163.com/' });
    const data = JSON.parse(result.data);
    const charts = (data.list || []).slice(0, 15).map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      cover: c.coverImgUrl || '',
      playCount: c.playCount || 0,
      updateFrequency: c.updateFrequency || ''
    }));
    res.json({ code: 0, data: charts });
  } catch (e) {
    res.status(500).json({ code: -1, message: e.message, data: [] });
  }
});

// 推荐歌单
router.get('/recommend', async (req, res) => {
  try {
    const playlistIds = [3778678, 2884035, 3779629];
    const results = [];
    for (const id of playlistIds) {
      const pl = await neteasePlaylist(id);
      if (pl) results.push(pl);
    }
    res.json({ code: 0, data: results });
  } catch (e) { res.status(500).json({ code: -1, message: e.message, data: [] }); }
});

module.exports = router;
