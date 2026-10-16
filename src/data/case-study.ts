import { z } from 'astro/zod';

// Schema for one Captain's Log entry (a case study). Lives here, not in
// content.config.ts, so unit tests and the Log components can import it
// without the `astro:content` virtual module.
//
// Every entry is structured, not free prose: problem, the hard part, the one
// concrete decision, the outcome, and at most one real number. The Plan's
// acceptance test reads these fields directly.

const httpsUrl = z.url({ protocol: /^https$/, error: 'links are absolute https URLs' });

export const caseStudyKinds = ['live', 'app-store', 'repo', 'classified'] as const;
export type CaseStudyKind = (typeof caseStudyKinds)[number];

export const CaseStudySchema = z
  .object({
    title: z.string().min(1),
    /** Position in the Log, 1 = first. */
    order: z.number().int().positive(),
    /** Drafts never render or block the build. */
    draft: z.boolean().default(false),
    /** How the project is shown: a live app, an App Store listing, a repo plus diagram, or a redacted entry. */
    kind: z.enum(caseStudyKinds),
    /** One short line under the title. */
    tagline: z.string().min(1).max(140),
    stack: z.array(z.string().min(1)).min(1).max(8),
    links: z
      .object({
        live: httpsUrl.optional(),
        appStore: httpsUrl.optional(),
        github: httpsUrl.optional(),
        /** Same-origin path to a diagram image (437-MIPS). */
        diagram: z.string().startsWith('/', 'diagram is a same-origin path').optional(),
      })
      .strict(),
    problem: z.string().min(1),
    hardPart: z.string().min(1),
    /** The one concrete technical decision, as a sentence. */
    decision: z.string().min(1),
    outcome: z.string().min(1),
    /** The one real number. Rendered only once `cleared` is true (public, or Rajat's own). */
    figure: z
      .object({ value: z.string().min(1), note: z.string().min(1), cleared: z.boolean() })
      .strict()
      .nullable(),
    /** True only for the classified entry; renders redaction, not details. */
    redacted: z.boolean().default(false),
  })
  .strict()
  .superRefine((s, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    switch (s.kind) {
      case 'live':
        need(!!s.links.live, 'links', 'a live entry needs links.live');
        break;
      case 'app-store':
        need(!!s.links.appStore, 'links', 'an app-store entry needs links.appStore');
        break;
      case 'repo':
        need(!!s.links.github, 'links', 'a repo entry needs links.github');
        break;
      case 'classified':
        need(s.redacted, 'redacted', 'a classified entry must be redacted');
        need(Object.keys(s.links).length === 0, 'links', 'a classified entry has no links');
        break;
    }
    if (s.kind !== 'classified') need(!s.redacted, 'redacted', 'only classified entries are redacted');
  });

export type CaseStudy = z.infer<typeof CaseStudySchema>;

/** A rendered Log entry: the collection id (file name) plus its validated data. */
export interface LogEntryData {
  id: string;
  study: CaseStudy;
}
