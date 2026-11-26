'use strict';

/**
 * File System Agent — real file/folder operations.
 * Paths accept `~` for the user's home directory.
 */

const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const HOME = os.homedir();

function expand(p) {
  if (!p) return HOME;
  let s = String(p).trim().replace(/^"|"$/g, '');
  if (s === '~') return HOME;
  if (s.startsWith('~/') || s.startsWith('~\\')) s = path.join(HOME, s.slice(2));
  return path.resolve(s);
}

async function listDir({ dir = '~' } = {}) {
  const target = expand(dir);
  const entries = await fsp.readdir(target, { withFileTypes: true });
  const items = [];
  for (const e of entries) {
    let size = null;
    let mtime = null;
    try {
      const st = await fsp.stat(path.join(target, e.name));
      size = st.size;
      mtime = st.mtime.toISOString();
    } catch {
      /* skip unreadable */
    }
    items.push({ name: e.name, type: e.isDirectory() ? 'dir' : 'file', size, mtime });
  }
  items.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1
  );
  return { dir: target, count: items.length, items: items.slice(0, 300) };
}

async function search({ dir = '~', pattern = '', ext = '', modifiedAfter = null, limit = 100 } = {}) {
  const root = expand(dir);
  const results = [];
  const re = pattern ? new RegExp(pattern, 'i') : null;
  const exts = ext
    ? String(ext)
        .split(',')
        .map((e) => e.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean)
    : null;
  const afterTs = modifiedAfter ? new Date(modifiedAfter).getTime() : null;
  const max = Math.min(Number(limit) || 100, 500);

  async function walk(current, depth) {
    if (results.length >= max || depth > 6) return;
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (results.length >= max) return;
      const full = path.join(current, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        await walk(full, depth + 1);
      } else {
        const extOk = !exts || exts.includes(path.extname(e.name).toLowerCase().replace(/^\./, ''));
        const nameOk = !re || re.test(e.name);
        if (!extOk || !nameOk) continue;
        try {
          const st = await fsp.stat(full);
          if (afterTs && st.mtime.getTime() < afterTs) continue;
          results.push({ path: full, name: e.name, size: st.size, mtime: st.mtime.toISOString() });
        } catch {
          /* skip */
        }
      }
    }
  }

  await walk(root, 0);
  results.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  return { root, count: results.length, results };
}

const TEXT_EXTS = new Set([
  '.txt', '.md', '.json', '.csv', '.log', '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx',
  '.py', '.html', '.css', '.xml', '.yml', '.yaml', '.ini', '.env', '.sql', '.sh', '.bat', '.ps1',
]);

async function readFile({ file, maxChars = 20000 } = {}) {
  if (!file) throw new Error('file is required');
  const target = expand(file);
  const st = await fsp.stat(target);
  if (st.isDirectory()) throw new Error(`${target} is a directory`);
  const ext = path.extname(target).toLowerCase();
  if (TEXT_EXTS.has(ext) || st.size < 200000) {
    const buf = await fsp.readFile(target);
    let text = buf.toString('utf8');
    const truncated = text.length > maxChars;
    if (truncated) text = text.slice(0, maxChars);
    return { file: target, size: st.size, truncated, content: text };
  }
  return { file: target, size: st.size, truncated: false, content: `[binary file, ${st.size} bytes, type ${ext || 'unknown'}]` };
}

async function stat({ target } = {}) {
  if (!target) throw new Error('target is required');
  const p = expand(target);
  const st = await fsp.stat(p);
  return { path: p, type: st.isDirectory() ? 'dir' : 'file', size: st.size, mtime: st.mtime.toISOString() };
}

async function createDir({ dir } = {}) {
  if (!dir) throw new Error('dir is required');
  const p = expand(dir);
  await fsp.mkdir(p, { recursive: true });
  return { created: p };
}

async function writeFile({ file, content = '', append = false } = {}) {
  if (!file) throw new Error('file is required');
  const p = expand(file);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  if (append) await fsp.appendFile(p, content, 'utf8');
  else await fsp.writeFile(p, content, 'utf8');
  return { written: p, bytes: Buffer.byteLength(String(content)) };
}

async function rename({ from, to } = {}) {
  if (!from || !to) throw new Error('from and to are required');
  const a = expand(from);
  const b = expand(to);
  await fsp.rename(a, b);
  return { renamed: { from: a, to: b } };
}

async function copy({ from, to } = {}) {
  if (!from || !to) throw new Error('from and to are required');
  const a = expand(from);
  const b = expand(to);
  await fsp.cp(a, b, { recursive: true });
  return { copied: { from: a, to: b } };
}

async function move({ from, to } = {}) {
  return rename({ from, to });
}

async function remove({ target, recursive = false } = {}) {
  if (!target) throw new Error('target is required');
  const p = expand(target);
  await fsp.rm(p, { recursive: !!recursive, force: false });
  return { deleted: p };
}

module.exports = {
  listDir,
  search,
  readFile,
  stat,
  createDir,
  writeFile,
  rename,
  copy,
  move,
  remove,
  expand,
  HOME,
};
