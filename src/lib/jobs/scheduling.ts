import { DateTime } from 'luxon';
export function nextOccurrence(
  time: string,
  weekdays: number[],
  zone: string,
  after = new Date(),
): Date {
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    !weekdays.length ||
    weekdays.some((d) => d < 1 || d > 7)
  )
    throw new Error('invalid_schedule');
  const base = DateTime.fromJSDate(after, { zone });
  if (!base.isValid) throw new Error('invalid_timezone');
  const [hour, minute] = time.split(':').map(Number);
  for (let i = 0; i < 9; i++) {
    const day = base.startOf('day').plus({ days: i });
    const candidate = day.set({ hour, minute });
    // Skip nonexistent DST wall times; use the earliest valid occurrence during overlaps.
    const options = candidate.getPossibleOffsets().sort((a, b) => a.toMillis() - b.toMillis());
    const c = options[0];
    if (
      c &&
      c.hour === hour &&
      c.minute === minute &&
      weekdays.includes(c.weekday) &&
      c.toMillis() > after.getTime()
    )
      return c.toUTC().toJSDate();
  }
  throw new Error('invalid_schedule');
}
export function backoff(attempt: number) {
  return Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
}
