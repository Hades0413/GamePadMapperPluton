import { useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { I18nContext, type I18n } from './I18nContext';
import { getLang, setLang, subscribeLang } from './lang';
import { richNodes } from './rich';
import { translate, type Lang } from './translate';

/** Da el idioma a toda la web. Con `force` fija un idioma para una zona (el panel de moderacion va siempre en espanol). */
export function I18nProvider({ children, force }: { children: ReactNode; force?: Lang }) {
  const current = useSyncExternalStore(subscribeLang, getLang, () => 'es' as Lang);
  const lang = force ?? current;
  const value = useMemo<I18n>(() => ({
    lang,
    setLang,
    t: (es, vars) => translate(lang, es, vars),
    tr: (es, vars) => richNodes(translate(lang, es), vars),
  }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
