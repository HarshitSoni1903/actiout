function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

// YYYY-MM-DD in device TZ. Deliberately uses local getters (never toISOString(),
// which would shift the date across a UTC day boundary).
export function todayLocalDate(): string {
  return formatLocalDate(new Date());
}

// 0 = Sunday, matching Date#getDay(). Parses the YYYY-MM-DD as local components
// (not via `new Date(string)`, which would parse as UTC midnight and could
// shift the weekday depending on device TZ).
export function weekdayOf(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year as number, (month as number) - 1, day as number).getDay();
}

export function localDateDaysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return formatLocalDate(date);
}

// "Jun 3" — short, no year, in the device locale. Parses local components
// like weekdayOf (never `new Date(string)`, for the same UTC-shift reason).
export function formatShortDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const date = new Date(year as number, (month as number) - 1, day as number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}
