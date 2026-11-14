import type { Aviso } from '../hooks/useAviso';

/** Aviso temporal abajo a la derecha. */
export function AvisoFlotante({ aviso }: { aviso: Aviso | null }) {
  if (!aviso) return null;
  return (
    <div role="status" className={`fixed right-4 bottom-4 z-50 max-w-md rounded-xl border px-4 py-3 text-sm shadow-xl shadow-black/40 ${aviso.error
      ? 'border-danger/50 bg-surface text-danger' : 'border-line bg-surface text-ink'}`}>
      {aviso.texto}
    </div>
  );
}
