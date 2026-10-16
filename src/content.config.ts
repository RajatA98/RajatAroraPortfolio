import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { CaseStudySchema } from './data/case-study';

// Content collections. Case studies are one markdown file each under
// src/content/case-studies/, all fields in the frontmatter (the body is unused
// for now). `draft: true` entries are filtered out on the page, so unfinished
// copy never blocks a build. Voyage stops stay in src/data/stops.ts (typed,
// zod-validated at import) since they are data, not prose.

const caseStudies = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/case-studies' }),
  schema: CaseStudySchema,
});

export const collections = { caseStudies };
