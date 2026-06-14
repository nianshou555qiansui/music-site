const jwt = require('jsonwebtoken');
const { queryOne } = require('../db');

const DEFAULT_JWT_SECRET = 'music-site-secret-key-2026';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const isPublicDeploy = process.env.NODE_ENV === 'production' || process.env.PUBLIC_DEPLOY === 'true';

if (isPublicDeploy && JWT_SECRET === DEFAULT_JWT_SECRET) {
  throw new Error('JWT_SECRET must be set for public deployment');
}

// 验证 JWT token 的中间件
function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '请先登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    try {
      const user = queryOne('SELECT id, username, role FROM users WHERE id = ?', [req.user.id]);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ code: 403, message: '无管理员权限' });
      }
      req.admin = user;
      next();
    } catch (e) {
      return res.status(500).json({ code: 500, message: e.message });
    }
  });
}

// 可选认证：有 token 就解析，没有也放行
function authOptional(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {}
  }
  next();
}

module.exports = { authRequired, authOptional, adminRequired, JWT_SECRET };
