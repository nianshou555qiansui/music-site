const express = require('express');
const crypto = require('crypto');
const { adminRequired } = require('../middleware/auth');
const { queryAll, queryOne, run, transaction } = require('../db');

const router = express.Router();
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_LENGTH = 16;

router.use(adminRequired);

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function randomCode(length = DEFAULT_LENGTH) {
  let code = '';
  while (code.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < 248) code += CHARS[byte % CHARS.length];
  }
  return code;
}

function listInvites() {
  return queryAll(`
    SELECT id, code, note, max_uses, used_count, is_active, expires_at, created_at, used_at
    FROM invite_codes
    ORDER BY created_at DESC, id DESC
  `);
}

// 邀请码列表
router.get('/invites', (req, res) => {
  try {
    res.json({ code: 0, data: listInvites() });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 生成邀请码
router.post('/invites', (req, res) => {
  try {
    const count = clampInt(req.body.count, 1, 1, 50);
    const maxUses = clampInt(req.body.max_uses ?? req.body.maxUses, 1, 0, 1000000);
    const note = normalizeText(req.body.note, 200);
    const created = [];

    transaction(() => {
      for (let i = 0; i < count; i += 1) {
        let code = randomCode();
        while (queryOne('SELECT id FROM invite_codes WHERE code = ?', [code])) {
          code = randomCode();
        }
        const result = run('INSERT INTO invite_codes (code, note, max_uses) VALUES (?, ?, ?)', [code, note, maxUses]);
        created.push({ id: result.lastInsertRowid, code, note, max_uses: maxUses, used_count: 0, is_active: 1 });
      }
    });

    res.status(201).json({ code: 0, data: { created, invites: listInvites() } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 更新邀请码
router.put('/invites/:id', (req, res) => {
  try {
    const id = clampInt(req.params.id, 0, 1, Number.MAX_SAFE_INTEGER);
    const invite = queryOne('SELECT * FROM invite_codes WHERE id = ?', [id]);
    if (!invite) return res.status(404).json({ code: 404, message: '邀请码不存在' });

    const updates = [];
    const params = [];

    if (req.body.note !== undefined) {
      updates.push('note = ?');
      params.push(normalizeText(req.body.note, 200));
    }
    if (req.body.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(req.body.is_active ? 1 : 0);
    }
    if (req.body.max_uses !== undefined || req.body.maxUses !== undefined) {
      const maxUses = clampInt(req.body.max_uses ?? req.body.maxUses, invite.max_uses, 0, 1000000);
      if (maxUses !== 0 && maxUses < invite.used_count) {
        return res.status(400).json({ code: 400, message: '最大使用次数不能小于已使用次数' });
      }
      updates.push('max_uses = ?');
      params.push(maxUses);
    }

    if (updates.length === 0) {
      return res.json({ code: 0, data: invite });
    }

    params.push(id);
    run(`UPDATE invite_codes SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = queryOne('SELECT id, code, note, max_uses, used_count, is_active, expires_at, created_at, used_at FROM invite_codes WHERE id = ?', [id]);
    res.json({ code: 0, data: updated });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

module.exports = router;
