import { EN } from './en';

export type Lang = 'es' | 'en';
export type Vars = Record<string, string | number>;
export type TFunction = (es: string, vars?: Vars) => string;

export const LANGS: readonly Lang[] = ['es', 'en'];
export const LANG_STORAGE_KEY = 'gpm.lang';

export const isLang = (value: unknown): value is Lang => value === 'es' || value === 'en';

/** Elige el idioma: lo guardado manda; si no, el del navegador (es* -> es, el resto -> en). */
export function detectLang(saved: string | null | undefined, browserLanguage: string | null | undefined): Lang {
  if (isLang(saved)) return saved;
  return (browserLanguage ?? '').toLowerCase().startsWith('es') ? 'es' : 'en';
}

/** Sustituye los {nombre} del texto por sus valores (los que no esten en vars se dejan tal cual). */
export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** El texto en espanol es la clave: en ingles se busca en el diccionario y, si falta, se queda en espanol. */
export function translate(lang: Lang, es: string, vars?: Vars, dictionary: Readonly<Record<string, string>> = EN): string {
  const text = lang === 'en' ? (dictionary[es] ?? es) : es;
  return interpolate(text, vars);
}
