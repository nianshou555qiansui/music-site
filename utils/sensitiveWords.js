const fs = require('fs');
const path = require('path');

const WORDS_PATH = path.join(__dirname, '..', 'data', 'sensitive-words.txt');

const RESERVED_USERNAME_EXACT = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'staff', 'moderator', 'owner', 'official',
  'api', 'www', 'music', 'null', 'undefined', 'test'
]);

const FALLBACK_SENSITIVE_WORDS = [
  '毛泽东', '刘少奇', '周恩来', '朱德', '邓小平', '陈云', '叶剑英', '华国锋', '胡耀邦', '赵紫阳',
  '江泽民', '李鹏', '朱镕基', '胡锦涛', '温家宝', '习近平', '李克强', '李强', '栗战书', '赵乐际',
  '王沪宁', '韩正', '蔡奇', '丁薛祥', '李希', '王岐山', '张德江', '俞正声', '贾庆林', '吴邦国',
  '曾庆红', '宋平', '国家主席', '总书记', '国务院总理', '中央军委', '政治局常委', '人大委员长', '政协主席',
  'maozedong', 'dengxiaoping', 'jiangzemin', 'hujintao', 'xijinping', 'likeqiang', 'wenjiabao'
];

let cachedWords = null;
let cachedMtime = 0;

function normalizeUsernameForPolicy(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_.\-·。．,，、/\\|()[\]{}<>《》【】"'“”‘’!！?？:：;；~～`^]/g, '');
}

function isAsciiLike(value) {
  return /^[a-z0-9]+$/.test(value);
}

function shouldKeepWord(normalized) {
  if (!normalized || normalized.length > 64) return false;
  return isAsciiLike(normalized) ? normalized.length >= 4 : normalized.length >= 2;
}

function parseWordFile(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
}

function loadSensitiveWords() {
  let mtime = 0;
  try {
    mtime = fs.statSync(WORDS_PATH).mtimeMs;
  } catch (e) {}

  if (cachedWords && cachedMtime === mtime) return cachedWords;

  const words = new Set(FALLBACK_SENSITIVE_WORDS.map(normalizeUsernameForPolicy).filter(Boolean));
  if (mtime > 0) {
    const text = fs.readFileSync(WORDS_PATH, 'utf8');
    for (const word of parseWordFile(text)) {
      const normalized = normalizeUsernameForPolicy(word);
      if (shouldKeepWord(normalized)) words.add(normalized);
    }
  }

  cachedWords = [...words];
  cachedMtime = mtime;
  return cachedWords;
}

function isBlockedUsername(username) {
  const normalized = normalizeUsernameForPolicy(username);
  if (!normalized) return false;
  if (RESERVED_USERNAME_EXACT.has(normalized)) return true;
  return loadSensitiveWords().some(word => word && normalized.includes(word));
}

module.exports = {
  isBlockedUsername,
  normalizeUsernameForPolicy,
  loadSensitiveWords
};
