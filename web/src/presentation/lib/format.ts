const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });
const numberFormat = new Intl.NumberFormat('es', { notation: 'compact' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600], ['month', 30 * 24 * 3600], ['week', 7 * 24 * 3600],
  ['day', 24 * 3600], ['hour', 3600], ['minute', 60],
];

export function timeAgo(date: Date, now = Date.now()): string {
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'ahora';
}

export const formatDate = (date: Date) => dateFormat.format(date);
export const compactNumber = (n: number) => numberFormat.format(n);
