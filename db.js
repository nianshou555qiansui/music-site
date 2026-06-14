const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'music.db');

let db = null;
let transactionDepth = 0;
let pendingSave = false;
let saveTimer = null;
let lastSaveAt = 0;
let exitHandlerRegistered = false;
const SAVE_THROTTLE_MS = 1000;

// 初始化数据库
async function initDB() {
  const SQL = await initSqlJs();

  // 如果已有数据库文件，加载它
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // sql.js 默认不强制外键，显式开启，避免孤儿数据
  db.run('PRAGMA foreign_keys = ON');

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const userColumns = db.exec('PRAGMA table_info(users)')[0]?.values.map(row => row[1]) || [];
  if (!userColumns.includes('role')) {
    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
    // 仅在首次新增 role 字段时迁移已有 admin 账号，之后不再按用户名自动提权。
    db.run("UPDATE users SET role = 'admin' WHERE username = 'admin'");
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      is_public INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS playlist_songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      song_id TEXT NOT NULL,
      song_name TEXT DEFAULT '',
      song_artist TEXT DEFAULT '',
      song_cover TEXT DEFAULT '',
      provider TEXT DEFAULT 'netease',
      sort_order INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      UNIQUE(playlist_id, song_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      song_id TEXT NOT NULL,
      song_name TEXT DEFAULT '',
      song_artist TEXT DEFAULT '',
      song_cover TEXT DEFAULT '',
      provider TEXT DEFAULT 'netease',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, song_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS play_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      song_id TEXT NOT NULL,
      song_name TEXT DEFAULT '',
      song_artist TEXT DEFAULT '',
      song_cover TEXT DEFAULT '',
      provider TEXT DEFAULT 'netease',
      played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      note TEXT DEFAULT '',
      max_uses INTEGER DEFAULT 1,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      expires_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME DEFAULT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invite_redemptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invite_code_id INTEGER NOT NULL,
      user_id INTEGER,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invite_code_id) REFERENCES invite_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS security_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer_hash TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  const legacyInviteCode = String(process.env.REGISTER_INVITE_CODE || '').trim();
  const inviteCount = db.exec('SELECT COUNT(*) FROM invite_codes')[0]?.values[0]?.[0] || 0;
  if (legacyInviteCode && inviteCount === 0) {
    db.run('INSERT OR IGNORE INTO invite_codes (code, note, max_uses) VALUES (?, ?, ?)', [legacyInviteCode, 'legacy-env', 0]);
  }

  saveDB();

  // 进程退出（含脚本跑完直接退出、process.exit()）时同步落盘，
  // 避免节流延迟的写入因定时器未触发而丢失。仅注册一次。
  if (!exitHandlerRegistered) {
    exitHandlerRegistered = true;
    process.on('exit', () => { if (saveTimer) saveDB(); });
  }

  return db;
}

// 保存数据库到文件。先写临时文件再 rename，降低写一半导致数据库损坏的概率。
function saveDB() {
  if (!db) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, DB_PATH);
  lastSaveAt = Date.now();
}

// 节流保存：空闲时（距上次落盘已超过节流窗口）立即写，确保单次写入即时持久化；
// 高频连续写入（如播放历史）则合并到一次延迟落盘，避免每次都全量 export 整个数据库。
function scheduleSave() {
  if (!db) return;
  const elapsed = Date.now() - lastSaveAt;
  if (elapsed >= SAVE_THROTTLE_MS) {
    saveDB();
  } else if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveDB();
    }, SAVE_THROTTLE_MS - elapsed);
  }
}

// 进程退出前把挂起的延迟写入立即落盘，避免重启丢失最近一秒的写入。
function flushDB() {
  if (saveTimer) saveDB();
}

// 获取数据库实例
function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

// 查询辅助函数 - 返回多行
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    return results;
  } finally {
    stmt.free();
  }
}

// 查询辅助函数 - 返回单行
function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params);
    if (stmt.step()) {
      return stmt.getAsObject();
    }
    return null;
  } finally {
    stmt.free();
  }
}

// 执行SQL（INSERT/UPDATE/DELETE）
function run(sql, params = []) {
  db.run(sql, params);
  const lastInsertRowid = db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] || 0;
  if (transactionDepth > 0) {
    pendingSave = true;
  } else {
    scheduleSave();
  }
  return { lastInsertRowid };
}

function transaction(fn) {
  const outermost = transactionDepth === 0;
  if (outermost) db.run('BEGIN TRANSACTION');
  transactionDepth += 1;

  try {
    const result = fn();
    transactionDepth -= 1;
    if (outermost) {
      db.run('COMMIT');
      if (pendingSave) scheduleSave();
      pendingSave = false;
    }
    return result;
  } catch (e) {
    transactionDepth -= 1;
    if (outermost) {
      db.run('ROLLBACK');
      pendingSave = false;
    }
    throw e;
  }
}

module.exports = { initDB, getDB, queryAll, queryOne, run, saveDB, flushDB, transaction };
