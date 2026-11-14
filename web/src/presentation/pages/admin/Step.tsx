import type { ReactNode } from 'react';

/** Paso de la ficha de un juego: numero, titulo, estado (listo / falta) y contenido. */
export function Step({
  n, title, done, optional = false, children,
}: { n: number; title: string; done: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <header className="flex items-center gap-3">
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          done ? 'bg-success/20 text-success' : 'bg-surface-2 text-muted'}`}>
          {done ? '✓' : n}
        </span>
        <h3 className="flex-1 font-semibold">{title}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          done ? 'bg-success/15 text-success' : optional ? 'bg-surface-2 text-muted' : 'bg-warning/15 text-warning'}`}>
          {done ? 'Listo' : optional ? 'Opcional' : 'Falta'}
        </span>
      </header>
      {children}
    </section>
  );
}

/** Mensaje breve de resultado bajo una accion. */
export function Feedback({ ok, error }: { ok?: string | false | null; error?: string | null }) {
  if (error) return <p className="text-sm text-danger" role="alert">{error}</p>;
  if (ok) return <p className="text-sm text-success" role="status">✓ {ok}</p>;
  return null;
}
