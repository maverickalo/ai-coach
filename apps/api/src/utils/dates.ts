const dayIndexByShortName = new Map([
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6]
]);

export function dateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function dayOfWeekInTimeZone(date: Date, timeZone: string): number {
  const shortName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(date);

  const dayIndex = dayIndexByShortName.get(shortName);
  if (dayIndex === undefined) {
    throw new Error(`Unable to determine day of week for ${shortName}`);
  }

  return dayIndex;
}

export function startOfPreviousWeek(date: Date, timeZone: string): {
  weekStart: string;
  weekEnd: string;
} {
  const localDate = new Date(`${dateInTimeZone(date, timeZone)}T12:00:00Z`);
  const day = dayOfWeekInTimeZone(date, timeZone);
  const daysSinceMonday = (day + 6) % 7;

  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday - 7);
  const weekStart = localDate.toISOString().slice(0, 10);
  localDate.setUTCDate(localDate.getUTCDate() + 6);
  const weekEnd = localDate.toISOString().slice(0, 10);

  return { weekStart, weekEnd };
}
