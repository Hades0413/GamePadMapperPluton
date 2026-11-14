import { HAT_ABAJO, HAT_ARRIBA, HAT_DERECHA, HAT_IZQUIERDA } from '../dominio/fuentes';
import type { EstadoCrudo, InfoMando } from '../dominio/tipos';
import { useT } from '../i18n/contexto';

/** Todas las entradas en crudo del mando: botones que se encienden, barras de ejes y hats. */
export function PanelEnVivo({ info, crudo, ruidosos }: { info: InfoMando; crudo: EstadoCrudo | null; ruidosos: readonly number[] }) {
  const t = useT();
  return (
    <section className="card p-4" aria-label={t('Entrada en vivo')}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('Entrada en vivo')}</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className={`size-2 rounded-full ${crudo ? 'bg-success' : 'bg-line'}`} />
          {crudo ? t('Recibiendo') : t('Sin datos')}
        </span>
      </div>

      <h3 className="etiqueta mb-2">{t('Botones')} · {info.botones.length}</h3>
      <ul className="mb-4 grid grid-cols-6 gap-1.5">
        {info.botones.map((b) => {
          const on = crudo?.botones[b.indice] ?? false;
          return (
            <li key={b.indice} title={`b${b.indice} · ${b.nombre}`}
              className={`flex h-7 items-center justify-center rounded-lg border font-mono text-xs transition-colors ${on
                ? 'border-primary bg-primary text-bg' : 'border-line bg-surface-2 text-muted'}`}>
              b{b.indice}
            </li>
          );
        })}
      </ul>

      <h3 className="etiqueta mb-2">{t('Ejes')} · {info.ejes.length}</h3>
      <ul className="mb-4 space-y-1.5">
        {info.ejes.map((e) => {
          const v = crudo?.ejes[e.indice] ?? 0;
          const ruidoso = ruidosos.includes(e.indice);
          return (
            <li key={e.indice} className="grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-2 text-xs">
              <span className="truncate font-mono text-muted" title={e.nombre}>a{e.indice} <span className="text-muted/70">{e.nombre.replace('ABS_', '')}</span></span>
              <span className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                <span className={`absolute inset-y-0 rounded-full ${ruidoso ? 'bg-warning' : 'bg-accent'}`}
                  style={{ left: `${50 + Math.min(0, v) * 50}%`, width: `${Math.abs(v) * 50}%` }} />
              </span>
              <span className={`text-right font-mono tabular-nums ${ruidoso ? 'text-warning' : 'text-muted'}`}>{v.toFixed(2)}</span>
            </li>
          );
        })}
      </ul>

      {info.hats > 0 && (
        <>
          <h3 className="etiqueta mb-2">{t('Hats')} · {info.hats}</h3>
          <ul className="flex gap-3">
            {Array.from({ length: info.hats }, (_, h) => {
              const v = crudo?.hats[h] ?? 0;
              const celda = (bit: number, area: string) => (
                <span className={`rounded-sm ${area} ${v & bit ? 'bg-primary' : 'bg-surface-2'}`} />
              );
              return (
                <li key={h} className="flex items-center gap-2 text-xs text-muted">
                  <span className="grid size-10 grid-cols-3 grid-rows-3 gap-0.5" aria-label={`h${h}`}>
                    {celda(HAT_ARRIBA, 'col-start-2 row-start-1')}
                    {celda(HAT_IZQUIERDA, 'col-start-1 row-start-2')}
                    <span className="col-start-2 row-start-2 rounded-sm bg-bg" />
                    {celda(HAT_DERECHA, 'col-start-3 row-start-2')}
                    {celda(HAT_ABAJO, 'col-start-2 row-start-3')}
                  </span>
                  <span className="font-mono">h{h}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
