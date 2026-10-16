// IP-denylist scan tests. This file must stay clean of denylisted terms: every
// forbidden string it needs is read from tests/fixtures/ip-scan/planted.json
// or from the committed fixture trees, which the default scan skips.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scan, parseDenylist, loadDenylist, formatReport } from '../../scripts/ip-scan-lib.mjs';

const ROOT = resolve(__dirname, '../..');
const FIXTURES = join(ROOT, 'tests/fixtures/ip-scan');
const DENYLIST = join(ROOT, 'ip-denylist.txt');
const planted = JSON.parse(readFileSync(join(FIXTURES, 'planted.json'), 'utf8')) as {
  bodyPhrase: string;
  bodyFile: string;
  bodyLine: number;
  filenameWord: string;
  emoji: string;
  emojiNoSelector: string;
  mixedCase: string;
  wholeWord: string;
  wholeWordNearMisses: string[];
};

const terms = loadDenylist(DENYLIST);

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ip-scan-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Build a throwaway tree under the temp dir and return its root. */
function tree(name: string, files: Record<string, string>): string {
  const root = join(tmp, name);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

describe('parseDenylist', () => {
  it('ignores comments and blank lines and reads the word flag', () => {
    const parsed = parseDenylist('# comment\n\nalpha beta\ngamma|word\n');
    expect(parsed.map((t) => [t.term, t.word])).toEqual([
      ['alpha beta', false],
      ['gamma', true],
    ]);
  });

  it('loads every committed term', () => {
    expect(terms.length).toBeGreaterThanOrEqual(13);
  });
});

describe('scan', () => {
  it('passes a clean fixture tree (near-miss words do not match)', () => {
    const result = scan({ paths: [join(FIXTURES, 'clean')], terms });
    expect(result.hits).toEqual([]);
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  it('fails on a planted phrase in a file body and reports term, file and line', () => {
    const result = scan({ paths: [join(FIXTURES, 'dirty-body')], terms });
    expect(result.hits).toHaveLength(1);
    const [hit] = result.hits;
    expect(hit.kind).toBe('content');
    expect(hit.term.toLowerCase()).toBe(planted.bodyPhrase.toLowerCase());
    expect(hit.file.endsWith(planted.bodyFile)).toBe(true);
    expect(hit.line).toBe(planted.bodyLine);
    const report = formatReport(result.hits, FIXTURES);
    expect(report).toContain(`${planted.bodyFile}:${planted.bodyLine}`);
    expect(report).toContain(planted.bodyPhrase);
  });

  it('fails on a forbidden word in a file name', () => {
    const root = tree('name', { [`public/ship-${planted.filenameWord}.png`]: 'not really a png' });
    const result = scan({ paths: [root], terms });
    expect(result.hits.some((h) => h.kind === 'name' && h.file.includes(planted.filenameWord))).toBe(true);
  });

  it('fails on a forbidden word in a directory name', () => {
    const root = tree('dirname', { [`src/${planted.filenameWord}/ok.txt`]: 'fine' });
    const result = scan({ paths: [root], terms });
    expect(result.hits.some((h) => h.kind === 'name')).toBe(true);
  });

  it('matches hyphenated and joined variants of multi-word terms in names', () => {
    const slug = planted.bodyPhrase.toLowerCase().replace(' ', '-');
    const root = tree('slug', { [`public/${slug}-map.svg`]: '<svg/>' });
    expect(scan({ paths: [root], terms }).hits.length).toBeGreaterThan(0);
  });

  it('matches whole-word terms on their own but not inside longer words', () => {
    const near = tree('near', { 'a.txt': planted.wholeWordNearMisses.join(' ') });
    expect(scan({ paths: [near], terms }).hits).toEqual([]);
    const exact = tree('exact', { 'b.txt': `credit to ${planted.wholeWord}.` });
    const hits = scan({ paths: [exact], terms }).hits;
    expect(hits).toHaveLength(1);
    expect(hits[0].term.toLowerCase()).toBe(planted.wholeWord.toLowerCase());
  });

  it('catches the flag emoji, with or without the variation selector', () => {
    const a = tree('emoji-a', { 'a.html': `<p>next island ${planted.emoji}</p>` });
    const b = tree('emoji-b', { 'b.html': `<p>next island ${planted.emojiNoSelector}</p>` });
    expect(scan({ paths: [a], terms }).hits).toHaveLength(1);
    expect(scan({ paths: [b], terms }).hits).toHaveLength(1);
  });

  it('is case-insensitive', () => {
    const root = tree('case', { 'c.md': `about ${planted.mixedCase} things` });
    expect(scan({ paths: [root], terms }).hits).toHaveLength(1);
  });

  it('scans SVG text content', () => {
    const root = tree('svg', { 'img/route.svg': `<svg><title>${planted.mixedCase}</title></svg>` });
    expect(scan({ paths: [root], terms }).hits).toHaveLength(1);
  });

  it('scans PNG text metadata chunks', () => {
    const root = join(tmp, 'png');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'art.png'), pngWithText('Description', `art of ${planted.mixedCase}`));
    const hits = scan({ paths: [root], terms }).hits;
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('metadata');
  });

  it('skips node_modules and the denylist file itself', () => {
    const root = tree('skips', {
      [`node_modules/pkg/${planted.filenameWord}.js`]: planted.bodyPhrase,
      'ip-denylist.txt': planted.bodyPhrase,
      'ok.txt': 'fine',
    });
    expect(scan({ paths: [root], terms }).hits).toEqual([]);
  });
});

describe('CLI', () => {
  const run = (args: string[]) =>
    spawnSync(process.execPath, [join(ROOT, 'scripts/ip-scan.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });

  it('exits 1 with a readable report on a hit', () => {
    const res = run([join(FIXTURES, 'dirty-body')]);
    expect(res.status).toBe(1);
    expect(res.stdout + res.stderr).toContain(`:${planted.bodyLine}:`);
  });

  it('emits JSON with --json', () => {
    const res = run(['--json', join(FIXTURES, 'dirty-body')]);
    expect(res.status).toBe(1);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.hits).toHaveLength(1);
  });

  it('integration: the real src/ and public/ are clean', () => {
    const res = run(['--quiet', 'src', 'public']);
    if (res.status !== 0) console.error(res.stdout, res.stderr);
    expect(res.status).toBe(0);
  });
});

/** Minimal valid-enough PNG: signature + IHDR + tEXt + IEND (CRCs zeroed; the scanner does not verify them). */
function pngWithText(keyword: string, text: string): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from(`${keyword}\0${text}`, 'latin1')),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
