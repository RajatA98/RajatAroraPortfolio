import { describe, expect, it } from 'vitest';
import { renderAstro } from '../helpers/container';
import LogEntry from '../../src/components/log/LogEntry.astro';
import CaptainsLog from '../../src/components/log/CaptainsLog.astro';
import IndexPage from '../../src/pages/index.astro';
import { findCopyViolations, stripTags } from '../../src/lib/copy-rules';
import {
  allFixtures,
  appStore,
  classified,
  liveCleared,
  liveUncleared,
  repo,
} from '../fixtures/case-studies';
import type { CaseStudy } from '../../src/data/case-study';

const NEW_TAB = '(opens in a new tab)';

function entry(id: string, study: CaseStudy) {
  return renderAstro(LogEntry, { props: { id, study } });
}

/** The HTML of the #log section only (from its opening tag to its </section>). */
function logSection(html: string): string {
  const start = html.search(/<section\b[^>]*id="log"/);
  if (start < 0) return '';
  const end = html.indexOf('</section>', start);
  return html.slice(start, end + '</section>'.length);
}

describe('LogEntry [unit]', () => {
  it('renders the anchor, labelled heading, title and tagline', async () => {
    const html = await entry('fixture-live', liveCleared);
    expect(html).toMatch(/<article\b[^>]*id="log-fixture-live"/);
    expect(html).toMatch(/<article\b[^>]*aria-labelledby="log-fixture-live-title"/);
    expect(html).toMatch(/<h3\b[^>]*id="log-fixture-live-title"[^>]*>Fixture Live Cleared<\/h3>/);
    expect(html).toContain(liveCleared.tagline);
  });

  it('renders the stack strip', async () => {
    const html = await entry('fixture-live', liveCleared);
    for (const s of liveCleared.stack) expect(html).toContain(`>${s}</li>`);
  });

  it('renders the three parts in order, with the decision marked', async () => {
    const html = await entry('fixture-live', liveCleared);
    const text = stripTags(html);
    const iProblem = text.indexOf('Problem');
    const iHard = text.indexOf('The hard part');
    const iDecisionLabel = text.indexOf('Decision');
    const iOutcome = text.indexOf('Outcome');
    expect(iProblem).toBeGreaterThanOrEqual(0);
    expect(iHard).toBeGreaterThan(iProblem);
    expect(iDecisionLabel).toBeGreaterThan(iHard);
    expect(iOutcome).toBeGreaterThan(iDecisionLabel);
    expect(html).toContain(liveCleared.problem);
    expect(html).toContain(liveCleared.hardPart);
    expect(html).toContain(liveCleared.decision);
    expect(html).toContain(liveCleared.outcome);
    expect(html).toContain('data-decision');
  });

  it('shows a cleared figure', async () => {
    const html = await entry('fixture-live', liveCleared);
    expect(html).toContain('data-figure');
    expect(html).toContain(liveCleared.figure!.value);
    expect(html).toContain(liveCleared.figure!.note);
  });

  it('hides an uncleared figure completely', async () => {
    const html = await entry('fixture-uncleared', liveUncleared);
    expect(html).not.toContain('data-figure');
    expect(html).not.toContain(liveUncleared.figure!.value);
    expect(html).not.toContain(liveUncleared.figure!.note);
  });

  it('renders no figure when figure is null', async () => {
    const html = await entry('fixture-app-store', appStore);
    expect(html).not.toContain('data-figure');
  });

  it('live entry links: open the app and source, external, new-tab suffix', async () => {
    const html = await entry('fixture-live', liveCleared);
    const links = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
    expect(links).toHaveLength(2);
    expect(html).toContain('Open the app');
    expect(html).toContain('Source on GitHub');
    for (const a of links) {
      expect(a).toContain('target="_blank"');
      expect(a).toMatch(/rel="noopener[^"]*"/);
      expect(a).toContain(NEW_TAB);
    }
    expect(html).toContain(`href="${liveCleared.links.live}"`);
    expect(html).toContain(`href="${liveCleared.links.github}"`);
  });

  it('app-store entry links to the App Store', async () => {
    const html = await entry('fixture-app-store', appStore);
    expect(html).toContain('View on the App Store');
    expect(html).toContain(`href="${appStore.links.appStore}"`);
  });

  it('repo entry shows the GitHub link and a lazy diagram with size and alt', async () => {
    const html = await entry('fixture-repo', repo);
    expect(html).toContain('Source on GitHub');
    const img = html.match(/<img\b[^>]*>/)?.[0] ?? '';
    expect(img).not.toBe('');
    expect(img).toContain(`src="${repo.links.diagram}"`);
    expect(img).toMatch(/\bwidth="\d+"/);
    expect(img).toMatch(/\bheight="\d+"/);
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('decoding="async"');
    expect(img).toMatch(/\balt="[^"]+"/);
  });

  it('classified entry: no links, redaction markup, "Classified" label, withheld note', async () => {
    const html = await entry('fixture-classified', classified);
    expect(html).not.toMatch(/<a\s[^>]*href/);
    expect(html).toContain('Classified');
    expect(html).toMatch(/<[^>]*data-redaction[^>]*aria-hidden="true"|<[^>]*aria-hidden="true"[^>]*data-redaction/);
    expect(html).toContain('Details withheld.');
    expect(html).toContain(classified.title);
    expect(html).toContain(classified.tagline);
    expect(html).toContain(classified.problem);
  });

  it('classified entry never renders links even if handed some', async () => {
    const leaky = { ...classified, links: { github: 'https://github.com/example/leak' } } as CaseStudy;
    const html = await entry('fixture-leaky', leaky);
    expect(html).not.toContain('github.com/example/leak');
    expect(html).not.toMatch(/<a\s[^>]*href/);
  });

  it('non-classified entries carry no classified markup', async () => {
    const html = await entry('fixture-live', liveCleared);
    expect(html).not.toContain('data-redaction');
    expect(html).not.toContain('Classified');
  });

  it('every fixture entry passes the copy rules', async () => {
    for (const { id, study } of allFixtures) {
      const html = await entry(id, study);
      expect(findCopyViolations(stripTags(html)), id).toEqual([]);
    }
  });
});

describe('CaptainsLog [unit]', () => {
  it('renders entries in the given order with a matching table of contents', async () => {
    const html = await renderAstro(CaptainsLog, { props: { entries: allFixtures } });
    expect(html).toMatch(/<section\b[^>]*id="log"/);
    expect(html).toMatch(/Captain(?:'|&#39;)s Log/);

    const tocHrefs = [...html.matchAll(/<a\b[^>]*href="#(log-[^"]+)"/g)].map((m) => m[1]);
    const articleIds = [...html.matchAll(/<article\b[^>]*id="(log-[^"]+)"/g)].map((m) => m[1]);
    const expected = allFixtures.map((f) => `log-${f.id}`);
    expect(tocHrefs).toEqual(expected);
    expect(articleIds).toEqual(expected);
  });

  it('TOC link text is each entry title', async () => {
    const html = await renderAstro(CaptainsLog, { props: { entries: allFixtures } });
    for (const { id, study } of allFixtures) {
      expect(html).toMatch(new RegExp(`<a\\b[^>]*href="#log-${id}"[^>]*>\\s*${study.title}\\s*</a>`));
    }
  });

  it('section copy passes the copy rules', async () => {
    const html = await renderAstro(CaptainsLog, { props: { entries: allFixtures } });
    expect(findCopyViolations(stripTags(html))).toEqual([]);
  });
});

describe('Captain\'s Log on the home page [unit]', () => {
  it('renders at least one entry inside the #log section', async () => {
    const html = await renderAstro(IndexPage);
    const section = logSection(html);
    expect(section).not.toBe('');
    expect(section).toMatch(/\bid="log-/);
  });

  it('seeded Log copy passes the copy rules', async () => {
    const html = await renderAstro(IndexPage);
    expect(findCopyViolations(stripTags(logSection(html)))).toEqual([]);
  });
});
