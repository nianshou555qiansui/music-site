const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne, queryAll, run, transaction } = require('../db');
const { authRequired, JWT_SECRET } = require('../middleware/auth');
const { isBlockedUsername } = require('../utils/sensitiveWords');

const router = express.Router();
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('music-site-dummy-password', 10);
const INVITE_MESSAGE = '邀请码不正确，请通过站内联系管理员获取邀请码';

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function isInviteUsable(invite) {
  if (!invite || invite.is_active !== 1) return false;
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) return false;
  return invite.max_uses === 0 || invite.used_count < invite.max_uses;
}

function createRateLimiter({ windowMs, max, message }) {
  const buckets = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${normalizeText(req.body.email || req.body.username || req.body.account || '', 128).toLowerCase()}`;
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 1000) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    if (bucket.count > max) {
      return res.status(429).json({ code: 429, message });
    }

    next();
  };
}

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: '操作过于频繁，请稍后再试'
});

// 账户找回流程公开可访问，限流比登录更严，防止暴力猜安全问题答案。
const recoverLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: '尝试次数过多，请15分钟后再试'
});

// 安全问题答案统一规范化：去首尾空格、转小写、去除所有空白，降低大小写/空格导致的误判。
function normalizeAnswer(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

// 注册
router.post('/register', authLimiter, (req, res) => {
  try {
    const username = normalizeText(req.body.username, 32);
    const email = normalizeText(req.body.email, 128).toLowerCase();
    const password = String(req.body.password || '');
    const inviteCode = normalizeText(req.body.invite_code || req.body.inviteCode, 64);

    if (!username || !email || !password) {
      return res.status(400).json({ code: 400, message: '用户名、邮箱和密码不能为空' });
    }
    if (!/^[\w一-龥.-]{2,32}$/.test(username)) {
      return res.status(400).json({ code: 400, message: '用户名仅支持2-32位中文、字母、数字、下划线、点和短横线' });
    }
    if (isBlockedUsername(username)) {
      return res.status(400).json({ code: 400, message: '该用户名不可注册' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ code: 400, message: '邮箱格式不正确' });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ code: 400, message: '密码长度需为6-128位' });
    }
    if (!inviteCode) {
      return res.status(403).json({ code: 403, message: INVITE_MESSAGE });
    }

    const invite = queryOne('SELECT * FROM invite_codes WHERE code = ?', [inviteCode]);
    if (!isInviteUsable(invite)) {
      return res.status(403).json({ code: 403, message: INVITE_MESSAGE });
    }

    const existing = queryOne('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing) {
      return res.status(409).json({ code: 409, message: '用户名或邮箱已被注册' });
    }

    const password_hash = bcrypt.hashSync(password, 10);
    const userId = transaction(() => {
      const latestInvite = queryOne('SELECT * FROM invite_codes WHERE id = ?', [invite.id]);
      if (!isInviteUsable(latestInvite)) {
        const err = new Error(INVITE_MESSAGE);
        err.statusCode = 403;
        throw err;
      }

      const result = run('INSERT INTO users (username, email, password_hash, nickname) VALUES (?, ?, ?, ?)', [username, email, password_hash, username]);
      const insertedUserId = result.lastInsertRowid;
      run('INSERT INTO playlists (user_id, name, description, is_public) VALUES (?, ?, ?, ?)', [insertedUserId, '我喜欢的音乐', '默认收藏歌单', 0]);
      run('UPDATE invite_codes SET used_count = used_count + 1, used_at = CURRENT_TIMESTAMP WHERE id = ?', [latestInvite.id]);
      run('INSERT INTO invite_redemptions (invite_code_id, user_id) VALUES (?, ?)', [latestInvite.id, insertedUserId]);
      return insertedUserId;
    });

    const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ code: 0, data: { token, user: { id: userId, username, email, nickname: username, role: 'user' } } });
  } catch (e) {
    res.status(e.statusCode || 500).json({ code: e.statusCode || 500, message: e.message });
  }
});

// 登录
router.post('/login', authLimiter, (req, res) => {
  try {
    const email = normalizeText(req.body.email, 128).toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ code: 400, message: '账号和密码不能为空' });
    }

    const user = queryOne('SELECT * FROM users WHERE email = ? OR username = ?', [email, email]);
    const hashToCheck = user?.password_hash || DUMMY_PASSWORD_HASH;
    const passwordOk = bcrypt.compareSync(password, hashToCheck);

    if (!user || !passwordOk) {
      return res.status(401).json({ code: 401, message: '账号或密码错误' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      code: 0,
      data: {
        token,
        user: { id: user.id, username: user.username, email: user.email, nickname: user.nickname, avatar_url: user.avatar_url, bio: user.bio, role: user.role || 'user' }
      }
    });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 获取当前用户信息
router.get('/me', authRequired, (req, res) => {
  try {
    const user = queryOne('SELECT id, username, email, nickname, avatar_url, bio, role, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
    res.json({ code: 0, data: user });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 修改个人资料。昵称是整站显示的身份，需与用户名同等校验敏感词/保留名，防止冒充。
router.put('/profile', authRequired, (req, res) => {
  try {
    const nickname = req.body.nickname !== undefined ? normalizeText(req.body.nickname, 32) : undefined;
    const bio = req.body.bio !== undefined ? normalizeText(req.body.bio, 200) : undefined;

    if (nickname !== undefined && nickname && isBlockedUsername(nickname)) {
      return res.status(400).json({ code: 400, message: '该昵称不可使用' });
    }

    transaction(() => {
      if (nickname !== undefined) run('UPDATE users SET nickname = ? WHERE id = ?', [nickname, req.user.id]);
      if (bio !== undefined) run('UPDATE users SET bio = ? WHERE id = ?', [bio, req.user.id]);
    });

    const user = queryOne('SELECT id, username, email, nickname, avatar_url, bio FROM users WHERE id = ?', [req.user.id]);
    res.json({ code: 0, data: user });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 修改用户名（需当前密码确认，校验格式/敏感词/唯一性，并重发 token）
router.put('/username', authRequired, (req, res) => {
  try {
    const currentPassword = String(req.body.current_password || req.body.password || '');
    const username = normalizeText(req.body.username, 32);

    const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ code: 401, message: '当前密码错误' });
    }
    if (!/^[\w一-龥.-]{2,32}$/.test(username)) {
      return res.status(400).json({ code: 400, message: '用户名仅支持2-32位中文、字母、数字、下划线、点和短横线' });
    }
    if (isBlockedUsername(username)) {
      return res.status(400).json({ code: 400, message: '该用户名不可使用' });
    }
    if (username === user.username) {
      return res.status(400).json({ code: 400, message: '新用户名与当前用户名相同' });
    }
    const existing = queryOne('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.user.id]);
    if (existing) return res.status(409).json({ code: 409, message: '该用户名已被占用' });

    run('UPDATE users SET username = ? WHERE id = ?', [username, req.user.id]);
    const token = jwt.sign({ id: req.user.id, username }, JWT_SECRET, { expiresIn: '7d' });
    const updated = queryOne('SELECT id, username, email, nickname, avatar_url, bio, role FROM users WHERE id = ?', [req.user.id]);
    res.json({ code: 0, message: '用户名已修改', data: { token, user: updated } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 修改密码（需验证当前密码）
router.put('/password', authRequired, (req, res) => {
  try {
    const currentPassword = String(req.body.current_password || '');
    const newPassword = String(req.body.new_password || '');

    const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ code: 401, message: '当前密码错误' });
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      return res.status(400).json({ code: 400, message: '新密码长度需为6-128位' });
    }

    run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), req.user.id]);
    res.json({ code: 0, message: '密码已修改' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 修改邮箱（需当前密码确认，校验格式与唯一性。邮箱仅作登录标识与找回字段，不发验证邮件）
router.put('/email', authRequired, (req, res) => {
  try {
    const currentPassword = String(req.body.current_password || req.body.password || '');
    const email = normalizeText(req.body.email, 128).toLowerCase();

    const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ code: 401, message: '当前密码错误' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ code: 400, message: '邮箱格式不正确' });
    }
    const existing = queryOne('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id]);
    if (existing) return res.status(409).json({ code: 409, message: '该邮箱已被使用' });

    run('UPDATE users SET email = ? WHERE id = ?', [email, req.user.id]);
    res.json({ code: 0, message: '邮箱已修改', data: { email } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 获取当前用户已设置的安全问题（不含答案）
router.get('/security-questions', authRequired, (req, res) => {
  try {
    const rows = queryAll('SELECT id, question, sort_order FROM security_questions WHERE user_id = ? ORDER BY sort_order ASC, id ASC', [req.user.id]);
    res.json({ code: 0, data: rows });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 设置安全问题（需当前密码确认，1-3 个，答案做哈希存储，整组覆盖）
router.put('/security-questions', authRequired, (req, res) => {
  try {
    const currentPassword = String(req.body.current_password || req.body.password || '');
    const items = Array.isArray(req.body.questions) ? req.body.questions : [];

    const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ code: 401, message: '当前密码错误' });
    }

    const normalized = [];
    for (const item of items.slice(0, 3)) {
      const question = normalizeText(item?.question, 100);
      const answerRaw = normalizeAnswer(item?.answer);
      if (!question || !answerRaw) continue;
      if (answerRaw.length < 1) continue;
      normalized.push({ question, answerRaw });
    }
    if (normalized.length === 0) {
      return res.status(400).json({ code: 400, message: '请至少设置一个有效的安全问题和答案' });
    }

    transaction(() => {
      run('DELETE FROM security_questions WHERE user_id = ?', [req.user.id]);
      normalized.forEach((item, index) => {
        run('INSERT INTO security_questions (user_id, question, answer_hash, sort_order) VALUES (?, ?, ?, ?)',
          [req.user.id, item.question, bcrypt.hashSync(item.answerRaw, 10), index]);
      });
    });

    const rows = queryAll('SELECT id, question, sort_order FROM security_questions WHERE user_id = ? ORDER BY sort_order ASC, id ASC', [req.user.id]);
    res.json({ code: 0, message: '安全问题已设置', data: rows });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 找回：按账号返回其安全问题（不含答案）。公开接口，强限流。
router.post('/recover/questions', recoverLimiter, (req, res) => {
  try {
    const account = normalizeText(req.body.account, 128).toLowerCase();
    if (!account) return res.status(400).json({ code: 400, message: '请输入账号' });

    const user = queryOne('SELECT id FROM users WHERE email = ? OR username = ?', [account, account]);
    if (!user) {
      return res.status(404).json({ code: 404, message: '该账号不存在或未设置安全问题' });
    }
    const rows = queryAll('SELECT id, question FROM security_questions WHERE user_id = ? ORDER BY sort_order ASC, id ASC', [user.id]);
    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: '该账号未设置安全问题，无法通过此方式找回' });
    }
    res.json({ code: 0, data: { questions: rows } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// 找回：校验全部安全问题答案后重置密码。公开接口，强限流。
router.post('/recover/reset', recoverLimiter, (req, res) => {
  try {
    const account = normalizeText(req.body.account, 128).toLowerCase();
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const newPassword = String(req.body.new_password || '');

    if (!account) return res.status(400).json({ code: 400, message: '请输入账号' });
    if (newPassword.length < 6 || newPassword.length > 128) {
      return res.status(400).json({ code: 400, message: '新密码长度需为6-128位' });
    }

    const user = queryOne('SELECT id FROM users WHERE email = ? OR username = ?', [account, account]);
    if (!user) return res.status(400).json({ code: 400, message: '账号或安全问题答案不正确' });

    const rows = queryAll('SELECT id, answer_hash FROM security_questions WHERE user_id = ?', [user.id]);
    if (rows.length === 0) return res.status(400).json({ code: 400, message: '该账号未设置安全问题' });

    const answerById = new Map(answers.map(a => [Number(a?.id), normalizeAnswer(a?.answer)]));
    const allCorrect = rows.every(row => {
      const provided = answerById.get(row.id);
      return provided !== undefined && provided.length > 0 && bcrypt.compareSync(provided, row.answer_hash);
    });
    if (!allCorrect) {
      return res.status(400).json({ code: 400, message: '账号或安全问题答案不正确' });
    }

    run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(newPassword, 10), user.id]);
    res.json({ code: 0, message: '密码已重置，请用新密码登录' });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

module.exports = router;
