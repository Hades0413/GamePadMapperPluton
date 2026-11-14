import { useState } from 'react';
import { claseBoton } from '../../componentes/boton';
import { Casilla, Tarjeta } from '../../componentes/controles';
import { LIMITES, nombreEnSalida } from '../../dominio/configuracion';
import { SALIDAS, type Macro, type PasoMacro, type SalidaPad } from '../../dominio/tipos';
import { useT } from '../../i18n/contexto';
import { nombreEntrada, type PropsSeccion } from './comun';

type TipoPaso = PasoMacro['tipo'];

const duracion = (pasos: readonly PasoMacro[]) =>
  pasos.reduce((s, p) => s + (p.tipo === 'toque' || p.tipo === 'esperar' ? p.ms : 0), 0);

/** Macros: secuencias de pulsaciones del mando virtual, a mano o grabadas pulsando el mando. */
export function Macros({ backend, info, estado, vivo, editar, ejecutar }: PropsSeccion) {
  const t = useT();
  const m = estado.mapeo;
  const [elegida, setElegida] = useState<number | null>(m.macros[0]?.id ?? null);
  const macro = m.macros.find((x) => x.id === elegida) ?? m.macros[0] ?? null;
  const grabando = vivo?.grabando ?? false;

  const ponerMacro = (nueva: Macro) => editar((x) => ({ ...x, macros: x.macros.map((y) => (y.id === nueva.id ? nueva : y)) }));
  const crear = (pasos: PasoMacro[] = []) => {
    const id = Math.max(0, ...m.macros.map((x) => x.id)) + 1;
    editar((x) => ({ ...x, macros: [...x.macros, { id, nombre: t('Macro {n}', { n: id }), pasos, repetir: false }] }));
    setElegida(id);
  };
  const borrar = (id: number) => editar((x) => ({
    ...x,
    macros: x.macros.filter((y) => y.id !== id),
    // Las acciones que la usaban dejan de hacer nada.
    acciones: Object.fromEntries(Object.entries(x.acciones).map(([e, a]) => [e, a.tipo === 'macro' && a.macro_id === id ? { tipo: 'ignorar' as const } : a])),
    capas: x.capas.map((c) => ({ ...c, acciones: Object.fromEntries(Object.entries(c.acciones).filter(([, a]) => !(a.tipo === 'macro' && a.macro_id === id))) })),
  }));
  const usos = macro ? Object.entries(m.acciones).filter(([, a]) => a.tipo === 'macro' && a.macro_id === macro.id).map(([e]) => nombreEntrada(e, info)) : [];

  const cambiarPaso = (i: number, p: PasoMacro) => macro && ponerMacro({ ...macro, pasos: macro.pasos.map((x, j) => (j === i ? p : x)) });
  const mover = (i: number, d: -1 | 1) => {
    if (!macro) return;
    const pasos = [...macro.pasos];
    const [p] = pasos.splice(i, 1);
    if (p) pasos.splice(i + d, 0, p);
    ponerMacro({ ...macro, pasos });
  };
  const tipoPaso = (p: PasoMacro, tipo: TipoPaso): PasoMacro => {
    const salida: SalidaPad = 'salida' in p ? p.salida : 'A';
    const ms = 'ms' in p ? p.ms : 50;
    if (tipo === 'esperar') return { tipo, ms };
    if (tipo === 'toque') return { tipo, salida, ms: Math.max(LIMITES.msToqueMin, ms) };
    return { tipo, salida };
  };
  const nombresPaso: Record<TipoPaso, string> = { pulsar: t('Pulsar'), soltar: t('Soltar'), toque: t('Toque'), esperar: t('Esperar') };

  const grabar = () => {
    if (grabando) {
      ejecutar(async () => {
        const pasos = await backend.grabarMacroTerminar(info.id);
        if (macro) ponerMacro({ ...macro, pasos: pasos.slice(0, LIMITES.pasos) });
        else crear(pasos.slice(0, LIMITES.pasos));
        return pasos.length;
      }, (n) => t('Macro grabada: {n} pasos', { n }));
    } else {
      ejecutar(() => backend.grabarMacroIniciar(info.id), () => t('Grabando: pulsa los botones en el mando y luego «Detener»'));
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <Tarjeta titulo={`${t('Macros')} · ${m.macros.length}`}>
        <ul className="mb-3 space-y-1.5">
          {m.macros.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setElegida(x.id)} aria-current={x.id === macro?.id}
                className={`w-full cursor-pointer rounded-xl border px-3 py-2 text-left text-sm ${x.id === macro?.id ? 'border-primary/70 bg-primary/10' : 'border-line hover:border-primary/40'}`}>
                <span className="block truncate font-medium">{x.nombre || `#${x.id}`}</span>
                <span className="text-xs text-muted">{t('{n} pasos · {ms} ms', { n: x.pasos.length, ms: duracion(x.pasos) })}</span>
              </button>
            </li>
          ))}
        </ul>
        {m.macros.length === 0 && <p className="mb-3 rounded-xl border border-dashed border-line p-3 text-center text-sm text-muted">{t('Sin macros')}</p>}
        <button type="button" className={claseBoton('secundario', 'sm', 'w-full')} disabled={m.macros.length >= LIMITES.macros} onClick={() => crear()}>
          {t('Nueva macro')}
        </button>
      </Tarjeta>

      {macro ? (
        <Tarjeta titulo={t('Editar macro')} extra={
          <span className="flex gap-2">
            <button type="button" className={claseBoton(grabando ? 'peligro' : 'secundario', 'sm')} onClick={grabar}>
              {grabando ? t('Detener grabación') : t('Grabar con el mando')}
            </button>
            <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => borrar(macro.id)}>{t('Borrar')}</button>
          </span>
        }>
          {grabando && (
            <p role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              <span className="size-2 animate-pulse rounded-full bg-danger" />{t('Grabando… pulsa los botones en el mando.')}
            </p>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <input value={macro.nombre} maxLength={LIMITES.nombre} aria-label={t('Nombre de la macro')}
              onChange={(e) => ponerMacro({ ...macro, nombre: e.target.value })} className="input h-9 w-56 py-0 text-sm" />
            <Casilla etiqueta={t('Repetir mientras se mantiene')} marcada={macro.repetir} onCambiar={(v) => ponerMacro({ ...macro, repetir: v })} />
            <span className="text-xs text-muted">{t('{n} pasos · {ms} ms', { n: macro.pasos.length, ms: duracion(macro.pasos) })}</span>
          </div>
          <p className="mb-3 text-xs text-muted">
            {usos.length > 0 ? t('La lanzan: {entradas}', { entradas: usos.join(', ') }) : t('Asígnala a un botón en «Botones» o «Botones extra» (acción «Macro»).')}
          </p>
          <ol className="space-y-1.5">
            {macro.pasos.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-2/50 px-2 py-1">
                <span className="w-6 text-right font-mono text-xs text-muted">{i + 1}</span>
                <select value={p.tipo} aria-label={t('Tipo de paso')} onChange={(e) => cambiarPaso(i, tipoPaso(p, e.target.value as TipoPaso))}
                  className="input h-7 w-28 py-0 pl-2 text-xs">
                  {(Object.keys(nombresPaso) as TipoPaso[]).map((k) => <option key={k} value={k}>{nombresPaso[k]}</option>)}
                </select>
                {'salida' in p && (
                  <select value={p.salida} aria-label={t('Control')} onChange={(e) => cambiarPaso(i, { ...p, salida: e.target.value as SalidaPad })}
                    className="input h-7 w-32 py-0 pl-2 font-mono text-xs">
                    {SALIDAS.map((s) => <option key={s} value={s}>{nombreEnSalida(s, m.salida)}</option>)}
                  </select>
                )}
                {'ms' in p && (
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input type="number" min={p.tipo === 'toque' ? LIMITES.msToqueMin : 0} max={LIMITES.msPaso} step={10} value={p.ms}
                      aria-label={t('Milisegundos')}
                      onChange={(e) => cambiarPaso(i, { ...p, ms: Math.min(LIMITES.msPaso, Math.max(p.tipo === 'toque' ? LIMITES.msToqueMin : 0, Math.round(Number(e.target.value) || 0))) })}
                      className="input h-7 w-20 px-1.5 py-0 text-xs" />
                    ms
                  </label>
                )}
                <span className="ml-auto flex">
                  <button type="button" className={claseBoton('fantasma', 'sm')} disabled={i === 0} onClick={() => mover(i, -1)} aria-label={t('Subir')}>↑</button>
                  <button type="button" className={claseBoton('fantasma', 'sm')} disabled={i === macro.pasos.length - 1} onClick={() => mover(i, 1)} aria-label={t('Bajar')}>↓</button>
                  <button type="button" className={claseBoton('fantasma', 'sm')} aria-label={t('Quitar')}
                    onClick={() => ponerMacro({ ...macro, pasos: macro.pasos.filter((_, j) => j !== i) })}>✕</button>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={claseBoton('secundario', 'sm')} disabled={macro.pasos.length >= LIMITES.pasos}
              onClick={() => ponerMacro({ ...macro, pasos: [...macro.pasos, { tipo: 'toque', salida: 'A', ms: 50 }] })}>{t('+ Toque')}</button>
            <button type="button" className={claseBoton('secundario', 'sm')} disabled={macro.pasos.length >= LIMITES.pasos}
              onClick={() => ponerMacro({ ...macro, pasos: [...macro.pasos, { tipo: 'esperar', ms: 100 }] })}>{t('+ Espera')}</button>
            <span className="self-center text-xs text-muted">{t('Máximo {n} pasos y 10 s por paso. Al terminar se suelta todo.', { n: LIMITES.pasos })}</span>
          </div>
        </Tarjeta>
      ) : (
        <div className="card flex flex-col items-center justify-center gap-3 p-8 text-center text-muted">
          <p className="font-medium text-ink">{t('Crea una macro o grábala pulsando el mando')}</p>
          <button type="button" className={claseBoton('primario', 'sm')} onClick={grabar}>
            {grabando ? t('Detener grabación') : t('Grabar con el mando')}
          </button>
        </div>
      )}
    </div>
  );
}
