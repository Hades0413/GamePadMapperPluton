import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CLAVE_IDIOMA, detectarIdioma, interpolar, traducir, type FuncionT, type Idioma } from './traducir';

interface I18n {
  idioma: Idioma;
  cambiarIdioma: (i: Idioma) => void;
  t: FuncionT;
}

const Contexto = createContext<I18n>({ idioma: 'es', cambiarIdioma: () => undefined, t: (es, vars) => interpolar(es, vars) });

function leerGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_IDIOMA);
  } catch {
    return null;
  }
}

export function ProveedorI18n({ children }: { children: ReactNode }) {
  const [idioma, setIdioma] = useState<Idioma>(() => detectarIdioma(leerGuardado(), navigator.language));
  const cambiarIdioma = useCallback((i: Idioma) => {
    setIdioma(i);
    document.documentElement.lang = i;
    try {
      localStorage.setItem(CLAVE_IDIOMA, i);
    } catch {
      // almacenamiento bloqueado: vale solo en esta sesion
    }
  }, []);
  const valor = useMemo<I18n>(() => ({ idioma, cambiarIdioma, t: (es, vars) => traducir(idioma, es, vars) }), [idioma, cambiarIdioma]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useI18n = (): I18n => useContext(Contexto);
export const useT = (): FuncionT => useContext(Contexto).t;
