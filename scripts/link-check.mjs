#!/usr/bin/env node
// Warn-only link checker. Reads every .html file in the build output, checks
// that same-origin files they reference (resume PDF, images, CSS, fonts)
// exist on disk, and checks each external http(s) URL against the statuses
// allowed for it in link-check.json. Never writes files.
//
// Usage:
//   node scripts/link-check.mjs              check dist/
//   --dist <dir>     build output to read (default: dist)
//   --config <file>  expectations file (default: link-check.json at the repo root)
//   --json           print { results, missingAssets, pages, ms } as JSON
//
// Exit codes: 0 all as expected, 1 any mismatch or missing file, 2 usage error.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractLinks,
  extractLocalAssets,
  expectedStatuses,
  isIgnored,
  checkUrl,
  formatReport,
  DEFAULT_TIMEOUT_MS,
} from './link-check-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const opts = { json: false, dist: 'dist', config: join(REPO, 'link-check.json') };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') opts.json = true;
  else if (a === '--dist') opts.dist = args[++i];
  else if (a.startsWith('--dist=')) opts.dist = a.slice(7);
  else if (a === '--config') opts.config = args[++i];
  else if (a === '--help' || a === '-h') {
    console.log('Usage: node scripts/link-check.mjs [--dist <dir>] [--config <file>] [--json]');
    process.exit(0);
  } else {
    console.error(`link-check: unknown argument ${a}`);
    process.exit(2);
  }
}

const dist = resolve(process.cwd(), opts.dist ?? '');
if (!opts.dist || !existsSync(dist) || !statSync(dist).isDirectory()) {
  console.error(`link-check: build output ${dist} not found; run the build first`);
  process.exit(2);
}
const config = JSON.parse(readFileSync(opts.config, 'utf8'));

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...htmlFiles(abs));
    else if (name.endsWith('.html')) out.push(abs);
  }
  return out;
}

const start = performance.now();
const pages = htmlFiles(dist);
const links = new Set();
const assets = new Set();
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  for (const l of extractLinks(html)) if (!isIgnored(l, config)) links.add(l);
  for (const a of extractLocalAssets(html)) assets.add(a);
}

const missingAssets = [...assets]
  .filter((p) => {
    let rel;
    try {
      rel = decodeURIComponent(p);
    } catch {
      rel = p;
    }
    const abs = resolve(dist, '.' + rel);
    if (abs !== dist && !abs.startsWith(dist + sep)) return true; // escapes the build
    return !(existsSync(abs) && statSync(abs).isFile());
  })
  .sort();

const queue = [...links];
const results = [];
async function worker() {
  while (queue.length) {
    const url = queue.shift();
    const expected = expectedStatuses(url, config);
    const r = await checkUrl(url, { fetch: globalThis.fetch, timeoutMs: DEFAULT_TIMEOUT_MS, expected });
    results.push({ ...r, expected });
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const order = [...links];
results.sort((a, b) => order.indexOf(a.url) - order.indexOf(b.url));
const ms = Math.round(performance.now() - start);

const failed = results.some((r) => !r.ok) || missingAssets.length > 0;
if (opts.json) {
  console.log(JSON.stringify({ ok: !failed, pages: pages.length, results, missingAssets, ms }, null, 2));
} else {
  console.log(formatReport(results, { missingAssets }));
  console.log(`link-check: ${pages.length} pages, ${assets.size} local files, ${ms} ms.`);
  if (failed) console.log('link-check: mismatches above. Expected statuses live in link-check.json.');
}
process.exit(failed ? 1 : 0);
