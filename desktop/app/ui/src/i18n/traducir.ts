import { EN } from './en';

/** Igual que en la web: el texto en espanol es la clave; en ingles se busca en EN. */

export type Idioma = 'es' | 'en';
export type Vars = Record<string, string | number>;
export type FuncionT = (es: string, vars?: Vars) => string;

export const CLAVE_IDIOMA = 'gpm.lang';

export const esIdioma = (v: unknown): v is Idioma => v === 'es' || v === 'en';

export function detectarIdioma(guardado: string | null | undefined, navegador: string | null | undefined): Idioma {
  if (esIdioma(guardado)) return guardado;
  return (navegador ?? '').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function interpolar(texto: string, vars?: Vars): string {
  if (!vars) return texto;
  return texto.replace(/\{(\w+)\}/g, (todo, nombre: string) => (nombre in vars ? String(vars[nombre]) : todo));
}

export function traducir(idioma: Idioma, es: string, vars?: Vars, dic: Readonly<Record<string, string>> = EN): string {
  return interpolar(idioma === 'en' ? (dic[es] ?? es) : es, vars);
}
