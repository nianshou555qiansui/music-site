#!/usr/bin/env node
try {
  require('dotenv').config();
} catch (e) {}

const crypto = require('crypto');
const { initDB, queryAll, queryOne, run, transaction } = require('../db');

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_LENGTH = 16;

function usage() {
  console.log(`邀请码管理

用法：
  node scripts/invite.js create [count] [maxUses] [note]
  node scripts/invite.js list
  node scripts/invite.js disable <code>
  node scripts/invite.js enable <code>

示例：
  npm run invite -- create 5 1 "QQ申请批次"
  npm run invite -- create 1 0 "长期自用码"
  npm run invite -- list
  npm run invite -- disable AbCd1234EfGh5678

说明：
  maxUses 默认 1，表示一次性邀请码；0 表示不限次数。
  生成/启用/禁用后请重启线上服务：sudo systemctl restart music-site
`);
}

function randomCode(length = DEFAULT_LENGTH) {
  let code = '';
  while (code.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < 248) code += CHARS[byte % CHARS.length];
  }
  return code;
}

function parsePositiveInt(value, fallback, min, max) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function formatDate(value) {
  return value || '-';
}

function formatInvite(invite) {
  const status = invite.is_active === 1 ? '启用' : '停用';
  const usage = invite.max_uses === 0 ? `${invite.used_count}/不限` : `${invite.used_count}/${invite.max_uses}`;
  return `${invite.code.padEnd(18)} ${status.padEnd(4)} ${usage.padEnd(8)} ${formatDate(invite.created_at).padEnd(19)} ${formatDate(invite.used_at).padEnd(19)} ${invite.note || ''}`;
}

async function createInvites(args) {
  const count = parsePositiveInt(args[0], 1, 1, 100);
  const maxUses = parsePositiveInt(args[1], 1, 0, 1000000);
  const note = String(args.slice(2).join(' ') || '').trim().slice(0, 200);
  const created = [];

  transaction(() => {
    for (let i = 0; i < count; i += 1) {
      let code = randomCode();
      while (queryOne('SELECT id FROM invite_codes WHERE code = ?', [code])) {
        code = randomCode();
      }
      run('INSERT INTO invite_codes (code, note, max_uses) VALUES (?, ?, ?)', [code, note, maxUses]);
      created.push(code);
    }
  });

  console.log(`已生成 ${created.length} 个邀请码（maxUses=${maxUses}）：`);
  created.forEach(code => console.log(code));
  console.log('\n提示：如果线上服务正在运行，请执行 sudo systemctl restart music-site 后生效。');
}

function listInvites() {
  const invites = queryAll('SELECT * FROM invite_codes ORDER BY created_at DESC, id DESC');
  if (invites.length === 0) {
    console.log('暂无邀请码。使用 npm run invite -- create 1 1 "备注" 生成。');
    return;
  }

  console.log('CODE               状态   使用次数   创建时间              最近使用时间          备注');
  console.log('--------------------------------------------------------------------------------');
  invites.forEach(invite => console.log(formatInvite(invite)));
}

function setInviteActive(code, active) {
  const normalized = String(code || '').trim();
  if (!normalized) {
    usage();
    process.exitCode = 1;
    return;
  }

  const invite = queryOne('SELECT id FROM invite_codes WHERE code = ?', [normalized]);
  if (!invite) {
    console.error('未找到邀请码。');
    process.exitCode = 1;
    return;
  }

  run('UPDATE invite_codes SET is_active = ? WHERE id = ?', [active ? 1 : 0, invite.id]);
  console.log(`${active ? '已启用' : '已停用'}邀请码：${normalized}`);
  console.log('提示：如果线上服务正在运行，请执行 sudo systemctl restart music-site 后生效。');
}

async function main() {
  await initDB();
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'create':
      await createInvites(args);
      break;
    case 'list':
      listInvites();
      break;
    case 'disable':
      setInviteActive(args[0], false);
      break;
    case 'enable':
      setInviteActive(args[0], true);
      break;
    default:
      usage();
      process.exitCode = command ? 1 : 0;
  }
}

main().catch(err => {
  console.error(err.message || err);
  process.exitCode = 1;
});
