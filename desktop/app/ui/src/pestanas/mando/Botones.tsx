import { claseBoton } from '../../componentes/boton';
import { Tarjeta } from '../../componentes/controles';
import { SelectorAccion } from '../../componentes/SelectorAccion';

import { accionDe, accionPad, conAccion, esControl, LIMITES } from '../../dominio/configuracion';
import { actividad, describirFuente } from '../../dominio/fuentes';
import type { Capa, Control, Entrada, InfoMando, MapeoMando, SalidaPad } from '../../dominio/tipos';
import { useT } from '../../i18n/contexto';
import { nombreEntrada, type PropsSeccion } from './comun';

const BOTONES: readonly Control[] = ['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'SELECT', 'START', 'HOME'];

/** Tabla de acciones: una fila por entrada con su actividad en vivo. */
export function FilasAcciones({ entradas, m, info, actividadDe, onCambiar }: {
  entradas: readonly Entrada[];
  m: MapeoMando;
  info: InfoMando;
  actividadDe: (e: Entrada) => number;
  onCambiar: (e: Entrada, a: ReturnType<typeof accionDe>) => void;
}) {
  const t = useT();
  return (
    <ul className="divide-y divide-line/60">
      {entradas.map((e) => {
        const nivel = actividadDe(e);
        const fuente = esControl(e) ? m.asignaciones[e] : undefined;
        // Entradas crudas: «b11» y debajo el nombre del sistema (BTN_TRIGGER_HAPPY1...).
        const detalle = esControl(e) ? (fuente ? describirFuente(fuente, info) : t('sin asignar')) : describirFuente(e, info).split(' · ')[1];
        return (
          <li key={e} className="grid grid-cols-[7.5rem_0.5rem_minmax(0,1fr)] items-center gap-3 py-1.5">
            <span className="min-w-0" title={describirFuente(e, info)}>
              <span className="block truncate text-sm font-semibold">{esControl(e) ? nombreEntrada(e, info) : e}</span>
              {detalle && <span className="block truncate font-mono text-[11px] text-muted">{detalle}</span>}
            </span>
            <span className="size-2 rounded-full bg-accent transition-opacity" style={{ opacity: 0.15 + nivel * 0.85 }} title={t('Actividad')} />
            <SelectorAccion accion={accionDe(m, e)} macros={m.macros} salida={m.salida} etiqueta={nombreEntrada(e, info)}
              salidaPorDefecto={(esControl(e) ? e : 'A') as SalidaPad} onCambiar={(a) => onCambiar(e, a)} />
          </li>
        );
      })}
    </ul>
  );
}

/** Que hace cada boton (normal, turbo, alterno, otro control, macro, tecla) y las capas. */
export function Botones({ info, estado, vivo, editar }: PropsSeccion) {
  const t = useT();
  const m = estado.mapeo;
  const actividadDe = (e: Entrada): number => {
    if (!vivo) return 0;
    if (e === 'L2') return vivo.estandar.l2;
    if (e === 'R2') return vivo.estandar.r2;
    if (esControl(e)) return vivo.estandar.botones[e] ? 1 : 0;
    return actividad(e, vivo.crudo);
  };
  const entradasPosibles: Entrada[] = [...BOTONES, 'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT', ...estado.extras];
  const ponerCapas = (capas: Capa[]) => editar((x) => ({ ...x, capas }));
  const capaActiva = vivo ? m.capas.findIndex((c) => actividadDe(c.modificador) > 0.5) : -1;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Tarjeta titulo={t('Botones')} extra={<p className="text-xs text-muted">{t('Turbo repite mientras mantienes; Alterno se queda pulsado hasta la siguiente pulsación.')}</p>}>
        <FilasAcciones entradas={BOTONES} m={m} info={info} actividadDe={actividadDe}
          onCambiar={(e, a) => editar((x) => ({ ...x, acciones: conAccion(x.acciones, e, a) }))} />
      </Tarjeta>

      <Tarjeta titulo={t('Capas (shift)')} extra={
        <button type="button" className={claseBoton('secundario', 'sm')} disabled={m.capas.length >= LIMITES.capas}
          onClick={() => {
            const libre = entradasPosibles.find((e) => !m.capas.some((c) => c.modificador === e) && !esControl(e)) ?? 'L3';
            ponerCapas([...m.capas, { nombre: t('Capa {n}', { n: m.capas.length + 1 }), modificador: libre, acciones: {} }]);
          }}>
          {t('Añadir capa')}
        </button>
      }>
        <p className="mb-3 text-xs text-muted">{t('Mientras mantienes el modificador, las entradas de la capa hacen otra cosa. El modificador no llega al juego.')}</p>
        {m.capas.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{t('Sin capas')}</p>}
        <div className="space-y-3">
          {m.capas.map((capa, i) => {
            const cambiar = (c: Capa) => ponerCapas(m.capas.map((x, j) => (j === i ? c : x)));
            const sinUsar = entradasPosibles.filter((e) => e !== capa.modificador && !(e in capa.acciones));
            return (
              <div key={i} className={`rounded-xl border p-3 ${capaActiva === i ? 'border-accent/70 bg-accent/5' : 'border-line'}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <input value={capa.nombre} maxLength={LIMITES.nombre} aria-label={t('Nombre de la capa')}
                    onChange={(e) => cambiar({ ...capa, nombre: e.target.value })} className="input h-8 w-36 py-0 text-sm" />
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    {t('Modificador')}
                    <select value={capa.modificador} onChange={(e) => cambiar({ ...capa, modificador: e.target.value })}
                      className="input h-8 w-36 py-0 pl-2 font-mono text-xs">
                      {entradasPosibles.filter((e) => e === capa.modificador || !m.capas.some((c) => c.modificador === e))
                        .map((e) => <option key={e} value={e}>{nombreEntrada(e, info)}</option>)}
                    </select>
                  </label>
                  {capaActiva === i && <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs text-accent">{t('Activa')}</span>}
                  <button type="button" className={claseBoton('fantasma', 'sm', 'ml-auto')}
                    onClick={() => ponerCapas(m.capas.filter((_, j) => j !== i))}>{t('Quitar')}</button>
                </div>
                <ul className="space-y-1.5">
                  {Object.entries(capa.acciones).map(([e, a]) => (
                    <li key={e} className="flex flex-wrap items-center gap-2">
                      <span className="w-24 truncate font-mono text-xs font-semibold">{nombreEntrada(e, info)}</span>
                      <SelectorAccion accion={a} macros={m.macros} salida={m.salida} etiqueta={nombreEntrada(e, info)}
                        salidaPorDefecto={(esControl(e) ? e : 'A') as SalidaPad}
                        onCambiar={(nueva) => cambiar({ ...capa, acciones: { ...capa.acciones, [e]: nueva } })} />
                      <button type="button" className={claseBoton('fantasma', 'sm')} aria-label={t('Quitar')}
                        onClick={() => cambiar({ ...capa, acciones: Object.fromEntries(Object.entries(capa.acciones).filter(([k]) => k !== e)) })}>✕</button>
                    </li>
                  ))}
                </ul>
                {sinUsar.length > 0 && (
                  <select value="" aria-label={t('Añadir una entrada a la capa')} className="input mt-2 h-8 w-56 py-0 pl-2 text-xs"
                    onChange={(e) => {
                      const nueva = e.target.value;
                      if (nueva) cambiar({ ...capa, acciones: { ...capa.acciones, [nueva]: esControl(nueva) ? accionPad(nueva as SalidaPad) : { tipo: 'ignorar' } } });
                    }}>
                    <option value="">{t('+ Añadir entrada…')}</option>
                    {sinUsar.map((e) => <option key={e} value={e}>{nombreEntrada(e, info)}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </Tarjeta>
    </div>
  );
}
