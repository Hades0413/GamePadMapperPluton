import { translate, type Lang } from '../i18n/translate';

/** Formateadores por idioma (se crean una vez). */
interface Formatters {
  relative: Intl.RelativeTimeFormat;
  date: Intl.DateTimeFormat;
  number: Intl.NumberFormat;
}

const cache = new Map<Lang, Formatters>();

function formatters(lang: Lang): Formatters {
  let found = cache.get(lang);
  if (!found) {
    found = {
      relative: new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }),
      date: new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }),
      number: new Intl.NumberFormat(lang, { notation: 'compact' }),
    };
    cache.set(lang, found);
  }
  return found;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600], ['month', 30 * 24 * 3600], ['week', 7 * 24 * 3600],
  ['day', 24 * 3600], ['hour', 3600], ['minute', 60],
];

export function timeAgo(date: Date, now = Date.now(), lang: Lang = 'es'): string {
  const seconds = Math.round((date.getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatters(lang).relative.format(Math.round(seconds / size), unit);
  }
  return translate(lang, 'ahora');
}

export const formatDate = (date: Date, lang: Lang = 'es') => formatters(lang).date.format(date);
export const compactNumber = (n: number, lang: Lang = 'es') => formatters(lang).number.format(n);
export const fullNumber = (n: number, lang: Lang = 'es') => n.toLocaleString(lang);
