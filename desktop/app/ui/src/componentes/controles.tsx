import type { ReactNode } from 'react';

/** Piezas de formulario comunes (deslizador con valor, casilla, tarjeta con titulo). */

interface PropsDeslizador {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  paso?: number;
  /** Como se muestra el valor (por defecto, porcentaje). */
  formato?: (v: number) => string;
  ayuda?: string | undefined;
  onCambiar: (v: number) => void;
}

const porcentaje = (v: number) => `${Math.round(v * 100)} %`;

export function Deslizador({ etiqueta, valor, min, max, paso = 0.01, formato = porcentaje, ayuda, onCambiar }: PropsDeslizador) {
  return (
    <label className="block text-xs" title={ayuda}>
      <span className="flex justify-between gap-2 text-muted">
        <span>{etiqueta}</span>
        <span className="font-mono text-ink tabular-nums">{formato(valor)}</span>
      </span>
      <input type="range" min={min} max={max} step={paso} value={valor} className="w-full accent-primary"
        onChange={(e) => onCambiar(Number(e.target.value))} />
    </label>
  );
}

export function Casilla({ etiqueta, marcada, onCambiar, ayuda, desactivada }: {
  etiqueta: string; marcada: boolean; onCambiar: (v: boolean) => void; ayuda?: string | undefined; desactivada?: boolean | undefined;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${desactivada ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={marcada} disabled={desactivada} className="mt-0.5 accent-primary"
        onChange={(e) => onCambiar(e.target.checked)} />
      <span>
        {etiqueta}
        {ayuda && <span className="block text-xs text-muted">{ayuda}</span>}
      </span>
    </label>
  );
}

export function Tarjeta({ titulo, extra, children, className = '' }: { titulo?: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`} aria-label={titulo}>
      {(titulo || extra) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {titulo && <h2 className="text-sm font-semibold">{titulo}</h2>}
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

/** Barra horizontal 0..1 (o -1..1 con `centrada`). */
export function Barra({ valor, centrada = false, color = 'bg-accent' }: { valor: number; centrada?: boolean; color?: string }) {
  const v = Math.max(centrada ? -1 : 0, Math.min(1, valor));
  return (
    <span className="relative block h-2 overflow-hidden rounded-full bg-surface-2">
      {centrada && <span className="absolute inset-y-0 left-1/2 w-px bg-line" />}
      <span className={`absolute inset-y-0 rounded-full ${color}`}
        style={centrada ? { left: `${50 + Math.min(0, v) * 50}%`, width: `${Math.abs(v) * 50}%` } : { left: 0, width: `${v * 100}%` }} />
    </span>
  );
}
