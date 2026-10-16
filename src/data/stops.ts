import { z } from 'astro/zod';
import { shipSizeFor, shipSizes } from './ship-size';

// The Voyage stop data: the single source of truth for both the static
// timeline (the base layer) and the desktop animation layered over it.
// Phase 5 fields (map, pathProgress, sizeSwap) are present now so the
// animation never forces a schema refactor. Real dates arrive from the content
// track; until then `null` renders as "dates to come".

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM');

export const StopSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a lowercase slug'),
    place: z.string().min(1),
    chapter: z.string().min(1),
    role: z.string().min(1),
    dates: z
      .object({
        start: yearMonth.nullable(),
        end: z.union([yearMonth, z.literal('present')]).nullable(),
      })
      .strict(),
    shipSize: z.enum(shipSizes),
    milestone: z.enum(['graduation', 'turning-point']).nullable(),
    /** Position on the voyage chart, in 0..1000 viewBox units. */
    map: z
      .object({ x: z.number().min(0).max(1000), y: z.number().min(0).max(1000) })
      .strict()
      .nullable(),
    /** Where along the route (0..1) this stop sits. Null means "derive from the route". */
    pathProgress: z.number().min(0).max(1).nullable(),
    /** True where the ship changes size on arrival. */
    sizeSwap: z.boolean(),
  })
  .strict();

export type Stop = z.infer<typeof StopSchema>;

export const StopsSchema = z
  .array(StopSchema)
  .min(1)
  .superRefine((list, ctx) => {
    const ids = new Set<string>();
    list.forEach((s, i) => {
      if (ids.has(s.id)) ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `duplicate id ${s.id}` });
      ids.add(s.id);
      const derived = shipSizeFor(i, list);
      if (s.shipSize !== derived) {
        ctx.addIssue({ code: 'custom', path: [i, 'shipSize'], message: `expected ${derived} from milestones` });
      }
    });
  });

const noDates = { start: null, end: null } as const;

// Map coordinates sketch the US on a 1000 x 600 chart: New Jersey on the
// right, Indiana in the middle, Texas lower left, the next island out west.
// Stops that share a city are nudged apart so the route stays readable.
const raw: Stop[] = [
  {
    id: 'edison-origin',
    place: 'Edison, NJ',
    chapter: 'Origin',
    role: 'Hometown, a kid with a dream',
    dates: noDates,
    shipSize: 'small',
    milestone: null,
    map: { x: 892, y: 190 },
    pathProgress: null,
    sizeSwap: false,
  },
  {
    id: 'metuchen-training',
    place: 'Metuchen, NJ',
    chapter: 'Training years',
    role: 'St. Joseph High School, swim and tennis',
    dates: noDates,
    shipSize: 'small',
    milestone: null,
    map: { x: 918, y: 236 },
    pathProgress: null,
    sizeSwap: false,
  },
  {
    id: 'purdue',
    place: 'West Lafayette, IN',
    chapter: 'Setting sail',
    role: 'Computer Engineering, Purdue University',
    dates: noDates,
    shipSize: 'small',
    milestone: null,
    map: { x: 588, y: 214 },
    pathProgress: null,
    sizeSwap: false,
  },
  {
    id: 'infosys-remote',
    place: 'Edison, NJ',
    chapter: 'Back home, remote',
    role: 'Infosys (remote), first full-time role',
    dates: { start: '2020-11', end: '2021-12' },
    shipSize: 'medium',
    milestone: 'graduation',
    map: { x: 862, y: 252 },
    pathProgress: null,
    sizeSwap: true,
  },
  {
    id: 'dallas',
    place: 'Dallas, TX',
    chapter: 'Go West',
    role: 'L&T Technology Services',
    dates: { start: '2021-12', end: '2022-12' },
    shipSize: 'medium',
    milestone: null,
    map: { x: 452, y: 430 },
    pathProgress: null,
    sizeSwap: false,
  },
  {
    id: 'bae-austin',
    place: 'Austin, TX',
    chapter: 'The discipline years',
    role: 'BAE Systems',
    dates: { start: '2022-11', end: '2025-11' },
    shipSize: 'medium',
    milestone: null,
    map: { x: 418, y: 506 },
    pathProgress: null,
    sizeSwap: false,
  },
  {
    id: 'gauntlet-ai',
    place: 'Austin, TX',
    chapter: 'The turning point',
    role: 'Gauntlet AI, AI engineering program',
    dates: { start: '2026-02', end: '2026-04' },
    shipSize: 'large',
    milestone: 'turning-point',
    map: { x: 352, y: 540 },
    pathProgress: null,
    sizeSwap: true,
  },
  {
    id: 'founder-mode',
    place: 'Austin, TX',
    chapter: 'Founder mode',
    role: 'Traveling Chess, Lummus, CloudCred',
    dates: { start: '2025-12', end: 'present' },
    shipSize: 'large',
    milestone: null,
    map: { x: 276, y: 486 },
    pathProgress: null,
    sizeSwap: false,
  },
  {
    id: 'next-island',
    place: 'The next island',
    chapter: 'The next chapter',
    role: 'Your team, if we are a fit',
    dates: noDates,
    shipSize: 'large',
    milestone: null,
    map: { x: 96, y: 330 },
    pathProgress: null,
    sizeSwap: false,
  },
];

/** The ordered, validated voyage. Throws at module load if the data is wrong. */
export const stops: readonly Stop[] = StopsSchema.parse(raw);
