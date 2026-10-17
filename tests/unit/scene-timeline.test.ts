import { describe, expect, it } from 'vitest';
import { pageBounds, progressToScrollY } from '../../src/components/scene/timeline';

describe('timeline helpers [unit]', () => {
  it('maps the first chapter top and the last chapter bottom to document scroll positions', () => {
    const first = { top: 120 } as DOMRect;
    const last = { bottom: 9000 } as DOMRect;
    const b = pageBounds(first, last, 300, 900);
    expect(b.start).toBe(420);          // 120 + 300: the first chapter's top in document coordinates
    expect(b.end).toBe(9300 - 900);     // the last chapter's bottom minus one viewport
  });

  it('maps progress back to a scroll position', () => {
    expect(progressToScrollY(0, { start: 100, end: 1100 })).toBe(100);
    expect(progressToScrollY(0.5, { start: 100, end: 1100 })).toBe(600);
    expect(progressToScrollY(2, { start: 100, end: 1100 })).toBe(1100);
  });
});
