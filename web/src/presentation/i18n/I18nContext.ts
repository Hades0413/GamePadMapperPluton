import { createContext, useContext, type ReactNode } from 'react';
import { interpolate, type Lang, type TFunction } from './translate';

export type RichVars = Record<string, ReactNode>;

export interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunction;
  /** Como t, pero devuelve JSX: admite <b>negrita</b>, <c>codigo</c> y {nombre} con un nodo de React. */
  tr: (es: string, vars?: RichVars) => ReactNode;
}

export const I18nContext = createContext<I18n>({
  lang: 'es',
  setLang: () => undefined,
  t: (es, vars) => interpolate(es, vars),
  tr: (es) => es,
});

export const useI18n = (): I18n => useContext(I18nContext);
export const useT = (): TFunction => useContext(I18nContext).t;
export const useRich = (): I18n['tr'] => useContext(I18nContext).tr;
export const useLang = (): [Lang, (lang: Lang) => void] => {
  const { lang, setLang } = useContext(I18nContext);
  return [lang, setLang];
};
