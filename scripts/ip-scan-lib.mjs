// Core of the IP-denylist scan. Pure functions plus a synchronous file walker,
// so tests can call it directly and the CLI (scripts/ip-scan.mjs) stays thin.
//
// What it checks, for every path it is given:
//   - file and directory NAMES (every file type)
//   - file CONTENTS for text files (source, HTML, CSS, JS, JSON, SVG, ...)
//   - text METADATA inside PNG (tEXt/iTXt/zTXt/eXIf), JPEG (APPn/COM) and
//     WebP (EXIF/XMP) images; other binaries (AVIF, fonts, PDF) by name only
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { inflateSync } from 'node:zlib';

/** Directory names never walked into (unless one is the explicit scan root). */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'factory',
  '.claude',
  '.astro',
  '.vercel',
  '.lighthouseci',
  'test-results',
  'playwright-report',
  'blob-report',
  'coverage',
]);

/** Files never scanned: the denylist is the one place the terms are allowed. */
const SKIP_FILES = new Set(['ip-denylist.txt']);

/** Fixture folder with intentional hits; skipped unless the scan root is inside it. */
const FIXTURE_SEGMENT = ['tests', 'fixtures', 'ip-scan'].join(sep);

const METADATA_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const BINARY_EXTS = new Set([
  ...METADATA_EXTS,
  '.avif', '.gif', '.ico', '.bmp', '.tif', '.tiff', '.heic',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.gz', '.br', '.zst', '.tgz',
  '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg',
  '.glb', '.bin', '.wasm', '.psd', '.ai',
]);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build the matcher for one term. Spaces match space, "-", "_" or nothing. */
function buildRegex(term, word) {
  let body = term
    .split(/\s+/)
    .map(escapeRe)
    .join('[\\s_-]*')
    // Emoji: the trailing variation selector is optional in real text.
    .replace(/️/g, '\\uFE0F?');
  if (word) body = `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`;
  return new RegExp(body, 'iu');
}

/**
 * Parse denylist text. One term per line; `#` starts a comment line;
 * `term|word` makes it a whole-word match.
 * @param {string} text
 * @returns {{ term: string, word: boolean, regex: RegExp }[]}
 */
export function parseDenylist(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [term, ...flags] = line.split('|').map((s) => s.trim());
    const word = flags.includes('word');
    out.push({ term, word, regex: buildRegex(term, word) });
  }
  return out;
}

/** @param {string} file */
export function loadDenylist(file) {
  return parseDenylist(readFileSync(file, 'utf8'));
}

/** @returns {string | null} the first term matching `text`, or null */
function firstMatch(text, terms) {
  for (const t of terms) if (t.regex.test(text)) return t.term;
  return null;
}

/** All matching terms in `text`. */
function allMatches(text, terms) {
  return terms.filter((t) => t.regex.test(text)).map((t) => t.term);
}

// ---------- image metadata extraction (text only, no pixel data) ----------

function pngText(buf) {
  const parts = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, Math.min(off + 8 + len, buf.length));
    if (type === 'tEXt' || type === 'iTXt' || type === 'eXIf') {
      parts.push(data.toString('latin1'), data.toString('utf8'));
    } else if (type === 'zTXt') {
      const nul = data.indexOf(0);
      parts.push(data.toString('latin1', 0, nul));
      try {
        parts.push(inflateSync(data.subarray(nul + 2)).toString('latin1'));
      } catch {
        /* corrupt chunk: ignore */
      }
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  return parts.join('\n');
}

function jpegText(buf) {
  const parts = [];
  let off = 2;
  while (off + 4 <= buf.length && buf[off] === 0xff) {
    const marker = buf[off + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end
    const len = buf.readUInt16BE(off + 2);
    if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      const data = buf.subarray(off + 4, off + 2 + len);
      parts.push(data.toString('latin1'), data.toString('utf8'));
    }
    off += 2 + len;
  }
  return parts.join('\n');
}

function webpText(buf) {
  const parts = [];
  let off = 12;
  while (off + 8 <= buf.length) {
    const type = buf.toString('latin1', off, off + 4);
    const len = buf.readUInt32LE(off + 4);
    if (type === 'EXIF' || type === 'XMP ') {
      const data = buf.subarray(off + 8, off + 8 + len);
      parts.push(data.toString('latin1'), data.toString('utf8'));
    }
    off += 8 + len + (len & 1);
  }
  return parts.join('\n');
}

function imageMetadata(file, ext) {
  try {
    const buf = readFileSync(file);
    if (ext === '.png') return pngText(buf);
    if (ext === '.webp') return webpText(buf);
    return jpegText(buf);
  } catch {
    return '';
  }
}

// ---------- walker ----------

/**
 * Scan files and folders for denylisted terms.
 * @param {{ paths: string[], terms: ReturnType<typeof parseDenylist>, cwd?: string }} opts
 * @returns {{ hits: { file: string, line: number, term: string, kind: 'content'|'name'|'metadata' }[], filesScanned: number }}
 */
export function scan({ paths, terms, cwd = process.cwd() }) {
  const hits = [];
  let filesScanned = 0;

  const nameHit = (abs) => {
    // Underscores act as separators in names (ship_name.png).
    const term = firstMatch(basename(abs).replace(/_/g, '-'), terms);
    if (term) hits.push({ file: abs, line: 0, term, kind: 'name' });
  };

  const scanFile = (abs) => {
    filesScanned++;
    nameHit(abs);
    const ext = extname(abs).toLowerCase();
    if (METADATA_EXTS.has(ext)) {
      const meta = imageMetadata(abs, ext);
      for (const term of meta ? allMatches(meta, terms) : []) {
        hits.push({ file: abs, line: 0, term, kind: 'metadata' });
      }
      return;
    }
    if (BINARY_EXTS.has(ext)) return;
    const buf = readFileSync(abs);
    if (buf.subarray(0, 8000).includes(0)) return; // looks binary
    const lines = buf.toString('utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const term of allMatches(lines[i], terms)) {
        hits.push({ file: abs, line: i + 1, term, kind: 'content' });
      }
    }
  };

  const walk = (abs, root, rootInFixtures) => {
    let st;
    try {
      st = statSync(abs);
    } catch {
      return;
    }
    const name = basename(abs);
    if (st.isDirectory()) {
      if (abs !== root) {
        if (SKIP_DIRS.has(name)) return;
        if (name.startsWith('dist-')) return; // other local build outputs
        if (!rootInFixtures && abs.endsWith(sep + FIXTURE_SEGMENT)) return;
        nameHit(abs);
      }
      for (const child of readdirSync(abs).sort()) walk(join(abs, child), root, rootInFixtures);
    } else if (st.isFile()) {
      if (SKIP_FILES.has(name)) return;
      scanFile(abs);
    }
  };

  for (const p of paths) {
    const abs = resolve(cwd, p);
    if (!existsSync(abs)) continue;
    const rootInFixtures = (abs + sep).includes(sep + FIXTURE_SEGMENT + sep);
    walk(abs, abs, rootInFixtures);
  }
  return { hits, filesScanned };
}

/**
 * Human-readable report, one line per hit: `path:line: matched "term"`.
 * @param {ReturnType<typeof scan>['hits']} hits
 * @param {string} [cwd]
 */
export function formatReport(hits, cwd = process.cwd()) {
  return hits
    .map((h) => {
      const rel = relative(cwd, h.file) || h.file;
      if (h.kind === 'name') return `${rel}: file/folder name matches "${h.term}"`;
      if (h.kind === 'metadata') return `${rel}: image metadata matches "${h.term}"`;
      return `${rel}:${h.line}: matched "${h.term}"`;
    })
    .join('\n');
}
