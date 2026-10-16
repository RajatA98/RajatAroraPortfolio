import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { CaseStudySchema, type CaseStudy } from '@/data/case-study';
import { findCopyViolations } from '@/lib/copy-rules';

// Content-track acceptance for the Captain's Log: all eight entries are real
// copy (no placeholders, no drafts), every decision names a concrete choice,
// every public entry carries one number, and every word passes the ban-list.
//
// `getCollection` from astro:content resolves under Vitest but returns an
// empty list (the content store only exists during a build), so the files are
// read directly and validated with the same schema the collection uses.

const DIR = join(process.cwd(), 'src/content/case-studies');

const entries = readdirSync(DIR)
  .filter((f) => f.endsWith('.md'))
  .map((file) => {
    const raw = readFileSync(join(DIR, file), 'utf8');
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!match?.[1]) throw new Error(`${file}: no frontmatter`);
    return { id: file.replace(/\.md$/, ''), study: CaseStudySchema.parse(parseYaml(match[1])) };
  });

const PROSE = ['problem', 'hardPart', 'decision', 'outcome'] as const;

function textFields(s: CaseStudy): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ['title', s.title],
    ['tagline', s.tagline],
    ...s.stack.map((t, i): [string, string] => [`stack[${i}]`, t]),
    ...PROSE.map((k): [string, string] => [k, s[k]]),
  ];
  if (s.figure) out.push(['figure.value', s.figure.value], ['figure.note', s.figure.note]);
  return out;
}

describe('Captain\'s Log copy [unit]', () => {
  it('has exactly 8 entries with orders 1 through 8, each used once', () => {
    expect(entries).toHaveLength(8);
    const orders = entries.map((e) => e.study.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('has no drafts', () => {
    for (const { id, study } of entries) expect(study.draft, id).toBe(false);
  });

  it('has no placeholder prose left', () => {
    for (const { id, study } of entries) {
      for (const [field, text] of textFields(study)) {
        expect(text.toLowerCase(), `${id}.${field}`).not.toContain('case study in progress');
      }
    }
  });

  it('names a concrete decision of at least 60 characters in every entry', () => {
    for (const { id, study } of entries) {
      expect(study.decision.length, id).toBeGreaterThanOrEqual(60);
    }
  });

  it('gives every non-classified entry a figure', () => {
    for (const { id, study } of entries) {
      if (study.kind !== 'classified') expect(study.figure, id).not.toBeNull();
    }
  });

  it('passes the copy ban-list on every text field', () => {
    for (const { id, study } of entries) {
      for (const [field, text] of textFields(study)) {
        expect(findCopyViolations(text), `${id}.${field}: ${text}`).toEqual([]);
      }
    }
  });

  it('never uses the retired terms', () => {
    for (const { id, study } of entries) {
      for (const [field, text] of textFields(study)) {
        expect(text, `${id}.${field}`).not.toMatch(/timeskip|ship's log/i);
      }
    }
  });

  it('has exactly one classified entry, redacted and without links', () => {
    const classified = entries.filter((e) => e.study.kind === 'classified');
    expect(classified).toHaveLength(1);
    const [only] = classified;
    expect(only?.study.redacted).toBe(true);
    expect(Object.keys(only?.study.links ?? { x: 1 })).toHaveLength(0);
  });

  it('gives the repo entry a same-origin diagram', () => {
    const repos = entries.filter((e) => e.study.kind === 'repo');
    expect(repos.length).toBeGreaterThan(0);
    for (const { id, study } of repos) expect(study.links.diagram, id).toMatch(/^\//);
  });
});
