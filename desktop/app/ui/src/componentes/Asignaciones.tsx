import { useEffect, useRef } from 'react';
import { ETIQUETA, GRUPOS } from '../dominio/controles';
import { actividad, describirFuente, opcionesPara } from '../dominio/fuentes';
import type { Control, EstadoCrudo, InfoMando, MapeoMando } from '../dominio/tipos';
import { useT } from '../i18n/contexto';

interface Props {
  info: InfoMando;
  mapeo: MapeoMando;
  crudo: EstadoCrudo | null;
  seleccionado: Control | null;
  onElegir: (c: Control) => void;
  onAsignar: (c: Control, fuente: string | null) => void;
}

/** Un selector por control estandar: que entrada cruda lo alimenta. */
export function Asignaciones({ info, mapeo, crudo, seleccionado, onElegir, onAsignar }: Props) {
  const t = useT();
  const filas = useRef(new Map<Control, HTMLLIElement>());

  useEffect(() => {
    if (seleccionado) filas.current.get(seleccionado)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [seleccionado]);

  return (
    <section className="@container card p-4" aria-label={t('Asignaciones')}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('Asignaciones')}</h2>
        <p className="text-xs text-muted">{t('Elige qué entrada del mando alimenta cada control.')}</p>
      </div>
      <div className="grid gap-x-6 gap-y-4 @lg:grid-cols-2">
        {GRUPOS.map((g) => (
          <div key={g.titulo}>
            <h3 className="etiqueta mb-1.5">{t(g.titulo)}</h3>
            <ul className="space-y-1">
              {g.controles.map((c) => {
                const fuente = mapeo.asignaciones[c];
                const nivel = fuente && crudo ? actividad(fuente, crudo) : 0;
                const opciones = opcionesPara(c, info);
                if (fuente && !opciones.includes(fuente)) opciones.unshift(fuente);
                return (
                  <li key={c} ref={(el) => { if (el) filas.current.set(c, el); else filas.current.delete(c); }}
                    className={`grid grid-cols-[4.25rem_1fr_0.5rem] items-center gap-2 rounded-lg px-1.5 py-0.5 ${seleccionado === c ? 'bg-primary/12 ring-1 ring-primary/50' : ''}`}>
                    <button type="button" onClick={() => onElegir(c)} className="cursor-pointer text-left text-xs font-semibold">
                      {ETIQUETA[c]}
                    </button>
                    <select value={fuente ?? ''} aria-label={t('Entrada de {control}', { control: ETIQUETA[c] })}
                      onFocus={() => onElegir(c)} onChange={(e) => onAsignar(c, e.target.value || null)}
                      className="input h-7 py-0 pl-2 font-mono text-xs">
                      <option value="">{t('— sin asignar —')}</option>
                      {opciones.map((o) => <option key={o} value={o}>{describirFuente(o, info)}</option>)}
                    </select>
                    <span className="size-2 rounded-full bg-accent transition-opacity" style={{ opacity: 0.15 + nivel * 0.85 }}
                      title={t('Actividad')} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
