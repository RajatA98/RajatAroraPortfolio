// Site-wide facts used by the shell (header, action bars, footer, hero, contact).

export type ActionId = 'resume' | 'linkedin' | 'github';

export interface SiteAction {
  id: ActionId;
  label: string;
  href: string;
  /** Same-origin file the browser should download (the résumé PDF). */
  download?: boolean;
  /** Off-site profile; opens in a new tab. */
  external?: boolean;
}

export const name = 'Rajat Arora';

export const location = 'Austin, TX';

export const valueLine = 'I build AI products that work in production, and I prove it.';

export const statusLine =
  'AI Engineer and Forward-Deployed Engineer roles, Austin, TX, open to remote or relocation, available now.';

/** Current role, shown as supporting evidence under the status line, never as the headline. */
export const currentRole = 'Currently Technical Lead at CloudCred, a startup in stealth.';

export const tagline = 'Building myself up to reach the next level, to enter the New World of AI.';

export const skills = [
  'LLM apps',
  'RAG',
  'evals and guardrails',
  'Python',
  'TypeScript',
  'React',
  'GCP and AWS',
] as const;

export const actions: readonly SiteAction[] = [
  { id: 'resume', label: 'Résumé', href: '/RajatArora-Resume.pdf', download: true },
  { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/rajata98', external: true },
  { id: 'github', label: 'GitHub', href: 'https://github.com/RajatA98', external: true },
];

/**
 * Contact details (owner decision 2026-10-15): real values, clickable
 * mailto:/tel: links, plus a copy button and selectable text as the fallback.
 * The phone stays out of meta tags, Open Graph and JSON-LD `telephone`.
 */
export const contact = {
  email: { display: 'rajat1998@gmail.com', href: 'mailto:rajat1998@gmail.com' },
  phone: { display: '732-874-1211', href: 'tel:+17328741211' },
  ctaLine:
    'Hiring for an AI Engineer or Forward-Deployed Engineer? I would love to talk. Fastest reply is by email.',
} as const;
