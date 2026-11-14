import { Casilla, Tarjeta } from '../../componentes/controles';
import { ETIQUETA } from '../../dominio/controles';
import { conAccion } from '../../dominio/configuracion';
import { describirFuente, opcionesPara } from '../../dominio/fuentes';
import { conAsignacion } from '../../dominio/mapeo';
import type { AjusteDireccion, Control, Lado } from '../../dominio/tipos';
import { useT } from '../../i18n/contexto';
import { FilasAcciones } from './Botones';
import type { PropsSeccion } from './comun';

const CRUCETA: readonly Control[] = ['DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT'];

/** Cruceta: de donde sale cada direccion, que hace y los cambios cruceta <-> stick. */
export function Cruceta({ info, estado, vivo, editar }: PropsSeccion) {
  const t = useT();
  const m = estado.mapeo;
  const dir = m.direccion;
  const cambiarDir = (d: Partial<AjusteDireccion>) => editar((x) => ({ ...x, direccion: { ...x.direccion, ...d } }));
  const lado = (v: Lado | null, onCambiar: (l: Lado | null) => void, etiqueta: string) => (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted">{etiqueta}</span>
      <select value={v ?? ''} onChange={(e) => onCambiar((e.target.value || null) as Lado | null)} className="input h-9 py-0 text-sm">
        <option value="">{t('No')}</option>
        <option value="izquierdo">{t('Stick izquierdo')}</option>
        <option value="derecho">{t('Stick derecho')}</option>
      </select>
    </label>
  );
  const x = vivo ? Number(!!vivo.estandar.botones.DPAD_RIGHT) - Number(!!vivo.estandar.botones.DPAD_LEFT) : 0;
  const y = vivo ? Number(!!vivo.estandar.botones.DPAD_DOWN) - Number(!!vivo.estandar.botones.DPAD_UP) : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Tarjeta titulo={t('Entradas de la cruceta')}>
        <div className="flex flex-wrap items-start gap-5">
          <svg viewBox="-30 -30 60 60" className="size-24 shrink-0" aria-hidden="true">
            {[[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx = 0, dy = 0]) => {
              const on = (dx !== 0 && dx === x) || (dy !== 0 && dy === y);
              return <rect key={`${dx}${dy}`} x={dx * 18 - 8} y={dy * 18 - 8} width={16} height={16} rx={3}
                fill={on ? 'var(--color-primary)' : 'var(--color-surface-2)'} stroke="var(--color-line)" />;
            })}
            <rect x={-8} y={-8} width={16} height={16} fill="var(--color-surface-2)" />
          </svg>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {CRUCETA.map((c) => {
              const fuente = m.asignaciones[c];
              const opciones = opcionesPara(c, info);
              if (fuente && !opciones.includes(fuente)) opciones.unshift(fuente);
              return (
                <li key={c} className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
                  <span className="text-xs font-semibold">{ETIQUETA[c]}</span>
                  <select value={fuente ?? ''} aria-label={t('Entrada de {control}', { control: ETIQUETA[c] })}
                    onChange={(e) => editar((x2) => ({ ...x2, asignaciones: conAsignacion(x2.asignaciones, c, e.target.value || null) }))}
                    className="input h-7 py-0 pl-2 font-mono text-xs">
                    <option value="">{t('— sin asignar —')}</option>
                    {opciones.map((o) => <option key={o} value={o}>{describirFuente(o, info)}</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
        </div>
      </Tarjeta>

      <Tarjeta titulo={t('Cruceta y sticks')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {lado(dir.cruceta_a_stick, (l) => cambiarDir({ cruceta_a_stick: l }), t('La cruceta mueve un stick'))}
          {lado(dir.stick_a_cruceta, (l) => cambiarDir({ stick_a_cruceta: l }), t('Un stick hace de cruceta'))}
        </div>
        <div className="mt-3">
          <Casilla etiqueta={t('Intercambiar los sticks')} marcada={dir.intercambiar_sticks}
            ayuda={t('El stick izquierdo mueve el derecho del mando virtual y al revés.')}
            onCambiar={(v) => cambiarDir({ intercambiar_sticks: v })} />
        </div>
      </Tarjeta>

      <Tarjeta titulo={t('Acciones de la cruceta')} className="xl:col-span-2">
        <FilasAcciones entradas={CRUCETA} m={m} info={info}
          actividadDe={(e) => (vivo?.estandar.botones[e as Control] ? 1 : 0)}
          onCambiar={(e, a) => editar((x2) => ({ ...x2, acciones: conAccion(x2.acciones, e, a) }))} />
      </Tarjeta>
    </div>
  );
}
