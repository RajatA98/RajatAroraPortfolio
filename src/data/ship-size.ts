// Ship size is the career level-up meter. It is derived from the milestones in
// the stop data, never typed by hand: small until graduation, medium from the
// graduation stop, large from the turning point onward. Sizes are named
// small / medium / large only (sprites ship-s.svg, ship-m.svg, ship-l.svg).

export const shipSizes = ['small', 'medium', 'large'] as const;
export type ShipSize = (typeof shipSizes)[number];

export type Milestone = 'graduation' | 'turning-point';

interface HasMilestone {
  milestone: Milestone | null;
}

const rank: Record<Milestone, ShipSize> = {
  graduation: 'medium',
  'turning-point': 'large',
};

/** Size of the ship at stop `index`, given the ordered stop list. */
export function shipSizeFor(index: number, stops: readonly HasMilestone[]): ShipSize {
  if (!Number.isInteger(index) || index < 0 || index >= stops.length) {
    throw new RangeError(`stop index ${index} is out of range (0..${stops.length - 1})`);
  }
  let size: ShipSize = 'small';
  for (let i = 0; i <= index; i++) {
    const m = stops[i]!.milestone;
    if (m && shipSizes.indexOf(rank[m]) > shipSizes.indexOf(size)) size = rank[m];
  }
  return size;
}

export const shipSprite: Record<ShipSize, string> = {
  small: '/voyage/ship-s.svg',
  medium: '/voyage/ship-m.svg',
  large: '/voyage/ship-l.svg',
};
