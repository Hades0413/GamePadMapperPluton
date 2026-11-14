import { useMemo } from 'react';
import { useLang } from '../i18n/I18nContext';
import { compactNumber, formatDate, fullNumber, timeAgo } from './format';

/** Fechas y numeros en el idioma actual (para usar dentro de componentes). */
export function useFormat() {
  const [lang] = useLang();
  return useMemo(() => ({
    timeAgo: (date: Date) => timeAgo(date, Date.now(), lang),
    formatDate: (date: Date) => formatDate(date, lang),
    compactNumber: (n: number) => compactNumber(n, lang),
    fullNumber: (n: number) => fullNumber(n, lang),
  }), [lang]);
}
