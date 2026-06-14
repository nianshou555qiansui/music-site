const express = require('express');
const { queryOne, queryAll, run, transaction } = require('../db');
const { authRequired, authOptional } = require('../middleware/auth');

const router = express.Router();

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function canReadPlaylist(playlist, user) {
  return !!playlist && (playlist.is_public === 1 || playlist.is_public === true || playlist.user_id === user?.id);
}

// 获取用户的歌单列表
router.get('/', authRequired, (req, res) => {
  try {
    const playlists = queryAll('SELECT * FROM playlists WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    const result = playlists.map(pl => {
      const count = queryOne('SELECT COUNT(*) as count FROM playlist_songs WHERE playlist_id = ?', [pl.id]);
      return { ...pl, songCount: count?.count || 0 };
    });
    res.json({ code: 0, data: result });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 创建歌单
router.post('/', authRequired, (req, res) => {
  try {
    const name = normalizeText(req.body.name, 60);
    const description = normalizeText(req.body.description, 300);
    const isPublic = req.body.is_public !== undefined ? (req.body.is_public ? 1 : 0) : 1;
    if (!name) return res.status(400).json({ code: 400, message: '歌单名称不能为空' });

    const result = run('INSERT INTO playlists (user_id, name, description, is_public) VALUES (?, ?, ?, ?)', [req.user.id, name, description, isPublic]);
    const playlist = queryOne('SELECT * FROM playlists WHERE id = ?', [result.lastInsertRowid]);
    res.json({ code: 0, data: playlist });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 获取歌单详情：公开歌单可访问，私密歌单仅创建者可访问
router.get('/:id', authOptional, (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ code: 400, message: '歌单ID不正确' });

    const playlist = queryOne('SELECT p.*, u.nickname as creator_name FROM playlists p LEFT JOIN users u ON p.user_id = u.id WHERE p.id = ?', [id]);
    if (!playlist) return res.status(404).json({ code: 404, message: '歌单不存在' });
    if (!canReadPlaylist(playlist, req.user)) return res.status(403).json({ code: 403, message: '无权访问该歌单' });

    const songs = queryAll('SELECT * FROM playlist_songs WHERE playlist_id = ? ORDER BY sort_order ASC, added_at ASC', [id]);
    res.json({ code: 0, data: { ...playlist, songs, canEdit: playlist.user_id === req.user?.id } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 修改歌单
router.put('/:id', authRequired, (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ code: 400, message: '歌单ID不正确' });

    const playlist = queryOne('SELECT * FROM playlists WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!playlist) return res.status(404).json({ code: 404, message: '歌单不存在或无权限' });

    const name = req.body.name !== undefined ? normalizeText(req.body.name, 60) : undefined;
    const description = req.body.description !== undefined ? normalizeText(req.body.description, 300) : undefined;
    const isPublic = req.body.is_public !== undefined ? (req.body.is_public ? 1 : 0) : undefined;
    if (name !== undefined && !name) return res.status(400).json({ code: 400, message: '歌单名称不能为空' });

    transaction(() => {
      if (name !== undefined) run('UPDATE playlists SET name = ? WHERE id = ?', [name, id]);
      if (description !== undefined) run('UPDATE playlists SET description = ? WHERE id = ?', [description, id]);
      if (isPublic !== undefined) run('UPDATE playlists SET is_public = ? WHERE id = ?', [isPublic, id]);
    });

    res.json({ code: 0, data: queryOne('SELECT * FROM playlists WHERE id = ?', [id]) });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 删除歌单
router.delete('/:id', authRequired, (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ code: 400, message: '歌单ID不正确' });

    const playlist = queryOne('SELECT * FROM playlists WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!playlist) return res.status(404).json({ code: 404, message: '歌单不存在或无权限' });

    transaction(() => {
      run('DELETE FROM playlist_songs WHERE playlist_id = ?', [id]);
      run('DELETE FROM playlists WHERE id = ?', [id]);
    });
    res.json({ code: 0, message: '已删除' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 添加歌曲到歌单
router.post('/:id/songs', authRequired, (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ code: 400, message: '歌单ID不正确' });

    const playlist = queryOne('SELECT * FROM playlists WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!playlist) return res.status(404).json({ code: 404, message: '歌单不存在或无权限' });

    const songId = normalizeText(req.body.song_id, 128);
    const songName = normalizeText(req.body.song_name, 200);
    const songArtist = normalizeText(req.body.song_artist, 200);
    const songCover = normalizeText(req.body.song_cover, 500);
    const provider = ['netease', 'qqmusic', 'kugou'].includes(req.body.provider) ? req.body.provider : 'netease';
    if (!songId) return res.status(400).json({ code: 400, message: '歌曲ID不能为空' });

    const exists = queryOne('SELECT id FROM playlist_songs WHERE playlist_id = ? AND song_id = ?', [id, songId]);
    if (exists) return res.status(409).json({ code: 409, message: '歌曲已在歌单中' });

    const maxOrder = queryOne('SELECT MAX(sort_order) as max_order FROM playlist_songs WHERE playlist_id = ?', [id]);
    run('INSERT INTO playlist_songs (playlist_id, song_id, song_name, song_artist, song_cover, provider, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, songId, songName, songArtist, songCover, provider, (maxOrder?.max_order || 0) + 1]);
    res.json({ code: 0, message: '已添加' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 从歌单移除歌曲
router.delete('/:id/songs/:songId', authRequired, (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ code: 400, message: '歌单ID不正确' });

    const playlist = queryOne('SELECT * FROM playlists WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!playlist) return res.status(404).json({ code: 404, message: '歌单不存在或无权限' });

    run('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?', [id, req.params.songId]);
    res.json({ code: 0, message: '已移除' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

module.exports = router;
