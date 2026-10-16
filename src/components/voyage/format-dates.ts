// Kept free of zod so the client island can import it without the schema.

interface Dates {
  start: string | null;
  end: string | null;
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (v: string) => (v === 'present' ? 'present' : `${months[Number(v.slice(5, 7)) - 1]} ${v.slice(0, 4)}`);

/** "2016-08" to "Aug 2016"; a whole range, or "dates to come" when unknown. */
export function formatDates(dates: Dates): string {
  if (dates.start === null && dates.end === null) return 'dates to come';
  if (dates.start && dates.end) return `${fmt(dates.start)} to ${fmt(dates.end)}`;
  return fmt((dates.start ?? dates.end)!);
}
