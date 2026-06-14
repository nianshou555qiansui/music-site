const express = require('express');
const { queryOne, queryAll, run, transaction } = require('../db');
const { authRequired } = require('../middleware/auth');
const { resolveBestSongVersion } = require('../utils/musicResolver');

const router = express.Router();

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeSongIds(values, max = 100) {
  const items = Array.isArray(values) ? values : String(values || '').split(',');
  return [...new Set(items.map(id => normalizeText(id, 128)).filter(Boolean))].slice(0, max);
}

function getFavoriteRow(userId, songId) {
  return queryOne('SELECT * FROM favorites WHERE user_id = ? AND song_id = ?', [userId, songId]);
}

function favoriteResponse(row) {
  return row ? { ...row } : null;
}

async function resolveFavoriteRow(userId, row) {
  if (!row) return { status: 'not_found' };
  const best = await resolveBestSongVersion(row.song_name, row.song_artist, row.provider || 'netease');
  if (!best || !best.id) return { status: 'failed', favorite: row, message: '未找到更好的音源' };
  if (String(best.id) === String(row.song_id)) {
    const nextRow = getFavoriteRow(userId, row.song_id);
    return { status: 'skipped', favorite: favoriteResponse(nextRow || row) };
  }

  const existing = getFavoriteRow(userId, String(best.id));
  if (existing && existing.id !== row.id) {
    run('DELETE FROM favorites WHERE id = ?', [row.id]);
    return { status: 'merged', favorite: favoriteResponse(existing), mergedFrom: row.song_id, mergedTo: existing.song_id };
  }

  run(
    'UPDATE favorites SET song_id = ?, song_name = ?, song_artist = ?, song_cover = ?, provider = ? WHERE id = ?',
    [String(best.id), best.name || row.song_name, best.artist || row.song_artist, best.cover || row.song_cover || '', best.provider || row.provider || 'netease', row.id]
  );
  return { status: 'updated', favorite: favoriteResponse(getFavoriteRow(userId, String(best.id))) };
}

// 获取收藏列表
router.get('/', authRequired, (req, res) => {
  try {
    const favorites = queryAll('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json({ code: 0, data: favorites });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 批量检查收藏状态
router.get('/check', authRequired, (req, res) => {
  try {
    const ids = normalizeSongIds(req.query.ids, 100);
    if (ids.length === 0) return res.json({ code: 0, data: {} });

    const placeholders = ids.map(() => '?').join(',');
    const rows = queryAll(`SELECT song_id FROM favorites WHERE user_id = ? AND song_id IN (${placeholders})`, [req.user.id, ...ids]);
    const result = {};
    ids.forEach(id => { result[id] = false; });
    rows.forEach(row => { result[row.song_id] = true; });
    res.json({ code: 0, data: result });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 收藏歌曲
router.post('/', authRequired, (req, res) => {
  try {
    const songId = normalizeText(req.body.song_id, 128);
    const songName = normalizeText(req.body.song_name, 200);
    const songArtist = normalizeText(req.body.song_artist, 200);
    const songCover = normalizeText(req.body.song_cover, 500);
    const provider = ['netease', 'qqmusic', 'kugou'].includes(req.body.provider) ? req.body.provider : 'netease';
    if (!songId) return res.status(400).json({ code: 400, message: '歌曲ID不能为空' });

    const exists = queryOne('SELECT id FROM favorites WHERE user_id = ? AND song_id = ?', [req.user.id, songId]);
    if (exists) return res.status(409).json({ code: 409, message: '已收藏' });

    run('INSERT INTO favorites (user_id, song_id, song_name, song_artist, song_cover, provider) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, songId, songName, songArtist, songCover, provider]);
    res.json({ code: 0, message: '收藏成功' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 批量取消收藏
router.delete('/', authRequired, (req, res) => {
  try {
    const songIds = normalizeSongIds(req.body.song_ids || req.body.ids || [], 100);
    if (songIds.length === 0) return res.status(400).json({ code: 400, message: '请选择要取消收藏的歌曲' });

    transaction(() => {
      for (const songId of songIds) {
        run('DELETE FROM favorites WHERE user_id = ? AND song_id = ?', [req.user.id, songId]);
      }
    });

    res.json({ code: 0, message: '已取消收藏', data: { removed: songIds.length, songIds } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 取消收藏
router.delete('/:songId', authRequired, (req, res) => {
  try {
    const songId = normalizeText(req.params.songId, 128);
    run('DELETE FROM favorites WHERE user_id = ? AND song_id = ?', [req.user.id, songId]);
    res.json({ code: 0, message: '已取消收藏', data: { songId } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 检查是否已收藏
router.get('/check/:songId', authRequired, (req, res) => {
  try {
    const exists = queryOne('SELECT id FROM favorites WHERE user_id = ? AND song_id = ?', [req.user.id, normalizeText(req.params.songId, 128)]);
    res.json({ code: 0, data: { favorited: !!exists } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 修复单首收藏音源
router.post('/:songId/resolve', authRequired, async (req, res) => {
  try {
    const songId = normalizeText(req.params.songId, 128);
    const row = getFavoriteRow(req.user.id, songId);
    if (!row) return res.status(404).json({ code: 404, message: '收藏不存在' });

    const result = await resolveFavoriteRow(req.user.id, row);
    if (result.status === 'failed') {
      return res.status(404).json({ code: 404, message: result.message || '未找到更好的音源' });
    }
    res.json({ code: 0, message: '已修复音源', data: result });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 批量修复收藏音源
router.post('/resolve', authRequired, async (req, res) => {
  try {
    const songIds = normalizeSongIds(req.body.song_ids || req.body.ids || [], 30);
    if (songIds.length === 0) return res.status(400).json({ code: 400, message: '请选择要修复的歌曲' });

    const results = [];
    for (const songId of songIds) {
      const row = getFavoriteRow(req.user.id, songId);
      if (!row) {
        results.push({ songId, status: 'not_found' });
        continue;
      }
      const result = await resolveFavoriteRow(req.user.id, row);
      results.push({ songId, ...result });
    }

    res.json({ code: 0, message: '批量修复完成', data: { results } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

module.exports = router;
