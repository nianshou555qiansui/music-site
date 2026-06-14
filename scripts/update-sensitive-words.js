#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const OWNER = 'konsheng';
const REPO = 'Sensitive-lexicon';
const BRANCH = process.env.SENSITIVE_LEXICON_BRANCH || 'main';
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const WORDS_PATH = path.join(DATA_DIR, 'sensitive-words.txt');
const META_PATH = path.join(DATA_DIR, 'sensitive-meta.json');
const TREE_URL = `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`;
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

function requestText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'music-site-sensitive-updater',
        'Accept': 'application/vnd.github+json, text/plain;q=0.9'
      },
      timeout: 30000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        requestText(new URL(res.headers.location, url).toString()).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
  });
}

function normalizeWord(value) {
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

function parseLines(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
}

function shouldUseFile(filePath) {
  if (!filePath.endsWith('.txt')) return false;
  return filePath.startsWith('Vocabulary/') || filePath.startsWith('Organized/');
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const treeText = await requestText(TREE_URL);
  const tree = JSON.parse(treeText);
  const files = (tree.tree || [])
    .filter(item => item.type === 'blob' && shouldUseFile(item.path))
    .map(item => item.path)
    .sort();

  if (files.length === 0) throw new Error('No sensitive lexicon txt files found from repository tree');

  const words = new Map();
  let fetchedFiles = 0;

  for (const file of files) {
    try {
      const text = await requestText(`${RAW_BASE}/${encodeURI(file).replace(/%2F/g, '/')}`);
      fetchedFiles += 1;
      for (const line of parseLines(text)) {
        const normalized = normalizeWord(line);
        if (!shouldKeepWord(normalized)) continue;
        if (!words.has(normalized)) words.set(normalized, line.trim());
      }
    } catch (e) {
      console.error(`skip ${file}: ${e.message}`);
    }
  }

  if (words.size === 0) {
    if (fs.existsSync(WORDS_PATH)) {
      console.error('No words fetched; keeping existing sensitive word cache.');
      return;
    }
    throw new Error('No words fetched and no existing cache is available');
  }

  const output = [...words.values()].sort((a, b) => a.localeCompare(b, 'zh-CN')).join('\n') + '\n';
  const meta = {
    source: `https://github.com/${OWNER}/${REPO}`,
    license: 'MIT',
    branch: BRANCH,
    treeUrl: TREE_URL,
    rawBase: RAW_BASE,
    updatedAt: new Date().toISOString(),
    selectedFiles: files.length,
    fetchedFiles,
    words: words.size
  };

  fs.writeFileSync(`${WORDS_PATH}.tmp`, output);
  fs.renameSync(`${WORDS_PATH}.tmp`, WORDS_PATH);
  fs.writeFileSync(`${META_PATH}.tmp`, JSON.stringify(meta, null, 2) + '\n');
  fs.renameSync(`${META_PATH}.tmp`, META_PATH);

  console.log(`Sensitive lexicon updated: ${words.size} words from ${fetchedFiles}/${files.length} files.`);
}

main().catch(err => {
  console.error(`Sensitive lexicon update failed: ${err.message}`);
  process.exitCode = 1;
});
