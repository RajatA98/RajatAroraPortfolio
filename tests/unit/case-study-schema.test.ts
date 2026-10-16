import { describe, expect, it } from 'vitest';
import { CaseStudySchema, type CaseStudy } from '../../src/data/case-study';

const base: CaseStudy = {
  title: 'Portfolio Agent',
  order: 1,
  draft: false,
  kind: 'live',
  tagline: 'Ask real brokerage holdings questions in plain English.',
  stack: ['TypeScript', 'Claude', 'GCP Cloud Run'],
  links: { live: 'https://example.com/app', github: 'https://github.com/RajatA98/portfolio-agent' },
  problem: 'People cannot query their holdings in natural language.',
  hardPart: 'The agent must never invent a holding.',
  decision: 'Chose a six-tool ReAct loop with a hard refusal guardrail over free-form generation.',
  outcome: 'Shipped on Cloud Run behind a login.',
  figure: { value: '100%', note: 'golden-set pass rate', cleared: false },
  redacted: false,
};

describe('case-study schema [unit]', () => {
  it('accepts a complete live entry and applies defaults', () => {
    const { draft, redacted, ...rest } = base;
    const parsed = CaseStudySchema.parse(rest);
    expect(parsed.draft).toBe(false);
    expect(parsed.redacted).toBe(false);
    expect(parsed.title).toBe('Portfolio Agent');
    expect(draft).toBe(false);
    expect(redacted).toBe(false);
  });

  it('rejects unknown fields (strict)', () => {
    expect(() => CaseStudySchema.parse({ ...base, extra: 1 })).toThrow();
  });

  it('a live entry needs a live link', () => {
    expect(() => CaseStudySchema.parse({ ...base, links: { github: base.links.github } })).toThrow(/live/);
  });

  it('an app-store entry needs an App Store link', () => {
    expect(() => CaseStudySchema.parse({ ...base, kind: 'app-store', links: {} })).toThrow(/appStore/);
    expect(
      CaseStudySchema.parse({ ...base, kind: 'app-store', links: { appStore: 'https://apps.apple.com/us/app/x/id1' } })
        .kind,
    ).toBe('app-store');
  });

  it('a repo entry needs a GitHub link', () => {
    expect(() => CaseStudySchema.parse({ ...base, kind: 'repo', links: {} })).toThrow(/github/);
  });

  it('a classified entry is redacted and links nowhere', () => {
    expect(() => CaseStudySchema.parse({ ...base, kind: 'classified', links: {} })).toThrow(/redacted/);
    expect(() => CaseStudySchema.parse({ ...base, kind: 'classified', redacted: true })).toThrow(/links/);
    const ok = CaseStudySchema.parse({ ...base, kind: 'classified', redacted: true, links: {}, figure: null });
    expect(ok.redacted).toBe(true);
  });

  it('links must be absolute https URLs and the diagram a same-origin path', () => {
    expect(() => CaseStudySchema.parse({ ...base, links: { live: 'example.com' } })).toThrow();
    expect(() => CaseStudySchema.parse({ ...base, links: { ...base.links, diagram: 'mips.svg' } })).toThrow();
    expect(CaseStudySchema.parse({ ...base, links: { ...base.links, diagram: '/diagrams/mips.svg' } }).links.diagram).toBe(
      '/diagrams/mips.svg',
    );
  });

  it('the tagline stays one short line', () => {
    expect(() => CaseStudySchema.parse({ ...base, tagline: 'x'.repeat(141) })).toThrow();
  });
});
