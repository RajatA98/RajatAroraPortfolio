// Copy rules shared by the unit tests: the ban-list from the Plan ("leveraged /
// utilized / seamless" and friends), the glyphs the design plan bans in
// running text, and the two terminology rules from the PRD.

/** Whole words or phrases that read as filler. Matched case-insensitively. */
export const BANNED_PHRASES = [
  'leverage',
  'leveraged',
  'leverages',
  'leveraging',
  'utilize',
  'utilized',
  'utilizes',
  'utilizing',
  'seamless',
  'seamlessly',
  'cutting-edge',
  'synergy',
  'game-changing',
  'best-in-class',
  'world-class',
  'delve',
  'just',
  // PRD terminology: it is "the turning point" and "the Captain's Log".
  'timeskip',
  "ship's log",
] as const;

/** Glyphs that never appear in copy: the em dash and the arrow. */
export const BANNED_GLYPHS = ['—', '→'] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns every banned phrase or glyph found in `text`, in order of first
 * appearance, lower-cased, each listed once. Empty means the copy is clean.
 */
export function findCopyViolations(text: string): string[] {
  const hits: Array<{ at: number; what: string }> = [];
  for (const phrase of BANNED_PHRASES) {
    const re = new RegExp(`(?<![\\w'])${escapeRegExp(phrase)}(?![\\w])`, 'i');
    const m = re.exec(text);
    if (m) hits.push({ at: m.index, what: phrase });
  }
  for (const glyph of BANNED_GLYPHS) {
    const at = text.indexOf(glyph);
    if (at >= 0) hits.push({ at, what: glyph });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.what);
}

/** Readable text of an HTML string: styles, scripts and tags removed. */
export function stripTags(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/g, ' ');
}
