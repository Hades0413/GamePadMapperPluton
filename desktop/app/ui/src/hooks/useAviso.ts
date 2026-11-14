import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n/contexto';

export interface Aviso {
  texto: string;
  error: boolean;
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Aviso temporal (abajo a la derecha) y `ejecutar`: lanza una accion y avisa del resultado o del error. */
export function useAviso() {
  const t = useT();
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const temporizador = setTimeout(() => setAviso(null), aviso.error ? 6000 : 3500);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  const ejecutar = useCallback(<T,>(accion: () => Promise<T>, ok?: (r: T) => string) => {
    void (async () => {
      try {
        const r = await accion();
        if (ok) setAviso({ texto: ok(r), error: false });
      } catch (e) {
        // Los errores del nucleo llegan en espanol: se traducen aqui.
        setAviso({ texto: t(mensajeDe(e)), error: true });
      }
    })();
  }, [t]);

  return { aviso, setAviso, ejecutar };
}
