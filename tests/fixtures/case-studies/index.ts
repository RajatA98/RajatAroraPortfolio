// Fixture case studies for the Captain's Log unit tests. Each one is parsed
// through the real schema, so a fixture that drifts from the schema fails loud.
// Prose here is test-only and follows the copy rules.
import { CaseStudySchema, type CaseStudy, type LogEntryData } from '../../../src/data/case-study';

const base = {
  draft: false,
  stack: ['TypeScript', 'Postgres', 'OpenAI'],
  problem: 'Fixture problem: support tickets piled up overnight.',
  hardPart: 'Fixture hard part: the model hallucinated order numbers.',
  decision: 'Fixture decision: ground every answer in a database lookup.',
  outcome: 'Fixture outcome: the queue cleared by morning.',
  redacted: false,
};

export const liveCleared: CaseStudy = CaseStudySchema.parse({
  ...base,
  title: 'Fixture Live Cleared',
  order: 1,
  kind: 'live',
  tagline: 'A live app with a cleared number.',
  links: { live: 'https://example.com/live', github: 'https://github.com/example/live' },
  figure: { value: '42%', note: 'fewer escalations in the first month', cleared: true },
});

export const liveUncleared: CaseStudy = CaseStudySchema.parse({
  ...base,
  title: 'Fixture Live Uncleared',
  order: 2,
  kind: 'live',
  tagline: 'A live app whose number is not cleared yet.',
  links: { live: 'https://example.com/uncleared' },
  figure: { value: '9001x', note: 'secret employer metric', cleared: false },
});

export const appStore: CaseStudy = CaseStudySchema.parse({
  ...base,
  title: 'Fixture App Store',
  order: 3,
  kind: 'app-store',
  tagline: 'An iOS app on the App Store.',
  links: { appStore: 'https://apps.apple.com/app/id000000' },
  figure: null,
});

export const repo: CaseStudy = CaseStudySchema.parse({
  ...base,
  title: 'Fixture Repo',
  order: 4,
  kind: 'repo',
  tagline: 'A repository with an architecture diagram.',
  stack: ['SystemVerilog'],
  links: { github: 'https://github.com/example/repo', diagram: '/diagrams/mips-architecture.svg' },
  figure: null,
});

export const classified: CaseStudy = CaseStudySchema.parse({
  ...base,
  title: 'Fixture Classified',
  order: 5,
  kind: 'classified',
  tagline: 'Technical lead at a company in stealth.',
  stack: ['Redacted'],
  links: {},
  figure: { value: '7', note: 'engineers led', cleared: true },
  redacted: true,
});

export const allFixtures: LogEntryData[] = [
  { id: 'fixture-live', study: liveCleared },
  { id: 'fixture-uncleared', study: liveUncleared },
  { id: 'fixture-app-store', study: appStore },
  { id: 'fixture-repo', study: repo },
  { id: 'fixture-classified', study: classified },
];
