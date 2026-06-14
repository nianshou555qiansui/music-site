const express = require('express');
const { queryOne, queryAll, run, transaction } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

// 获取播放历史
router.get('/', authRequired, (req, res) => {
  try {
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isSafeInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const history = queryAll('SELECT * FROM play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?', [req.user.id, limit]);
    res.json({ code: 0, data: history });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 记录播放
router.post('/', authRequired, (req, res) => {
  try {
    const songId = normalizeText(req.body.song_id, 128);
    const songName = normalizeText(req.body.song_name, 200);
    const songArtist = normalizeText(req.body.song_artist, 200);
    const songCover = normalizeText(req.body.song_cover, 500);
    const provider = ['netease', 'qqmusic', 'kugou'].includes(req.body.provider) ? req.body.provider : 'netease';
    if (!songId) return res.status(400).json({ code: 400, message: '歌曲ID不能为空' });

    transaction(() => {
      run('DELETE FROM play_history WHERE user_id = ? AND song_id = ?', [req.user.id, songId]);
      run('INSERT INTO play_history (user_id, song_id, song_name, song_artist, song_cover, provider) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, songId, songName, songArtist, songCover, provider]);

      // 限制历史记录数量
      const count = queryOne('SELECT COUNT(*) as cnt FROM play_history WHERE user_id = ?', [req.user.id]);
      if (count && count.cnt > 200) {
        run('DELETE FROM play_history WHERE user_id = ? AND id NOT IN (SELECT id FROM play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 200)', [req.user.id, req.user.id]);
      }
    });

    res.json({ code: 0, message: '已记录' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 清空历史
router.delete('/', authRequired, (req, res) => {
  try {
    run('DELETE FROM play_history WHERE user_id = ?', [req.user.id]);
    res.json({ code: 0, message: '已清空' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

module.exports = router;
