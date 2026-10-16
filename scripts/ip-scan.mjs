#!/usr/bin/env node
// IP-denylist scan (CI gate). Fails when any term in ip-denylist.txt appears
// in file contents, file/folder names, or image metadata.
//
// Usage:
//   node scripts/ip-scan.mjs                 scan the default set (see below)
//   node scripts/ip-scan.mjs src public      scan only the given paths
//   --dist <dir>    build output to include (default: $ASTRO_OUT_DIR or dist)
//   --no-dist       skip the build output
//   --denylist <f>  denylist file (default: ip-denylist.txt at the repo root)
//   --json          print { hits, filesScanned } as JSON
//   --quiet         print nothing on success
//
// Exit codes: 0 clean, 1 at least one hit, 2 usage error.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan, loadDenylist, formatReport } from './ip-scan-lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PATHS = ['src', 'public', 'tests', 'scripts', 'docs', 'README.md', 'LICENSES.md'];

const args = process.argv.slice(2);
const opts = { json: false, quiet: false, dist: undefined, noDist: false, denylist: join(REPO, 'ip-denylist.txt') };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--json') opts.json = true;
  else if (a === '--quiet') opts.quiet = true;
  else if (a === '--no-dist') opts.noDist = true;
  else if (a === '--dist') opts.dist = args[++i];
  else if (a.startsWith('--dist=')) opts.dist = a.slice(7);
  else if (a === '--denylist') opts.denylist = args[++i];
  else if (a === '--help' || a === '-h') {
    console.log('Usage: node scripts/ip-scan.mjs [paths...] [--dist <dir>|--no-dist] [--json] [--quiet]');
    process.exit(0);
  } else if (a.startsWith('--')) {
    console.error(`ip-scan: unknown option ${a}`);
    process.exit(2);
  } else positional.push(a);
}
if (opts.dist === '') {
  console.error('ip-scan: --dist needs a directory');
  process.exit(2);
}

const start = performance.now();
const paths = positional.length ? [...positional] : DEFAULT_PATHS.map((p) => join(REPO, p));
const notes = [];
if (!opts.noDist && (opts.dist !== undefined || !positional.length)) {
  const dist = resolve(REPO, opts.dist ?? process.env.ASTRO_OUT_DIR ?? 'dist');
  if (existsSync(dist)) paths.push(dist);
  else notes.push(`build output ${dist} not found; run the build first to scan it`);
}

const terms = loadDenylist(opts.denylist);
const { hits, filesScanned } = scan({ paths, terms, cwd: process.cwd() });
const ms = Math.round(performance.now() - start);

if (opts.json) {
  console.log(JSON.stringify({ hits, filesScanned, ms, notes }, null, 2));
} else {
  for (const n of notes) console.error(`ip-scan: note: ${n}`);
  if (hits.length) {
    console.error(formatReport(hits));
    console.error(
      `\nip-scan: FAILED. ${hits.length} denylisted term hit(s) in ${filesScanned} files (${ms} ms).` +
        '\nRemove or rename the content above. Terms live in ip-denylist.txt.',
    );
  } else if (!opts.quiet) {
    console.log(`ip-scan: clean. ${filesScanned} files, ${terms.length} terms (${ms} ms).`);
  }
}
process.exit(hits.length ? 1 : 0);
