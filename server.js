try {
  require('dotenv').config();
} catch (e) {}

const express = require('express');
const path = require('path');
const { initDB, flushDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = (process.env.CORS_ORIGIN || (isProduction ? '' : '*'))
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
let dbReady = false;

if (isProduction && configuredOrigins.length === 0) {
  throw new Error('CORS_ORIGIN must be set in production');
}

function applySecurityHeaders(req, res, next) {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.header('X-Frame-Options', 'SAMEORIGIN');
  res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: http: https:; media-src 'self' http: https: blob:; connect-src 'self' http: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
  );
  next();
}

function applyCors(req, res, next) {
  const requestOrigin = req.headers.origin;
  const allowAll = configuredOrigins.includes('*');

  if (allowAll && !isProduction) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (requestOrigin && configuredOrigins.includes(requestOrigin)) {
    res.header('Access-Control-Allow-Origin', requestOrigin);
    res.header('Vary', 'Origin');
  } else if (!requestOrigin && !isProduction) {
    res.header('Access-Control-Allow-Origin', configuredOrigins[0] || '*');
  }

  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
}

// 中间件
app.use(applySecurityHeaders);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(applyCors);

// 静态文件
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ code: 0, status: 'ok', dbReady });
});

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/favorites', require('./routes/favorites'));
app.use('/api/history', require('./routes/history'));
app.use('/api', require('./routes/proxy'));

// 未匹配的 API 路由返回 404 JSON，避免回退到 SPA 的 index.html 而返回一段 HTML。
app.use('/api', (req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 初始化数据库并启动服务器
initDB().then(() => {
  dbReady = true;
  const server = app.listen(PORT, HOST, () => {
    console.log(`Music site running at http://${HOST}:${PORT}`);
  });

  // 退出前把节流延迟的数据库写入落盘，避免重启丢失最近的写入。
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    flushDB();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
