import { accionPad, nombreEnSalida, TECLAS, TURBO_HZ_DEFECTO } from '../dominio/configuracion';
import { SALIDAS, type Accion, type Macro, type SalidaPad, type TipoSalida } from '../dominio/tipos';
import { useT } from '../i18n/contexto';

type TipoUi = 'normal' | 'turbo' | 'alternar' | 'macro' | 'tecla' | 'ignorar';

const tipoUi = (a: Accion): TipoUi => (a.tipo === 'pad' ? a.modo : a.tipo);

interface Props {
  accion: Accion;
  macros: readonly Macro[];
  /** Para nombrar los botones como en el mando virtual elegido. */
  salida: TipoSalida;
  /** Salida por defecto al pasar a «normal» desde otro tipo. */
  salidaPorDefecto: SalidaPad;
  etiqueta: string;
  onCambiar: (a: Accion) => void;
}

/** Que hace una entrada: control del mando virtual (normal, turbo o alterno), macro, tecla o nada. */
export function SelectorAccion({ accion, macros, salida, salidaPorDefecto, etiqueta, onCambiar }: Props) {
  const t = useT();
  const tipo = tipoUi(accion);
  const nombres: Record<TipoUi, string> = {
    normal: t('Normal'), turbo: t('Turbo'), alternar: t('Alterno'), macro: t('Macro'), tecla: t('Tecla'), ignorar: t('Ignorar'),
  };

  const cambiarTipo = (nuevo: TipoUi) => {
    const pad = accion.tipo === 'pad' ? accion : accionPad(salidaPorDefecto);
    if (nuevo === 'normal' || nuevo === 'turbo' || nuevo === 'alternar') {
      onCambiar({ ...pad, tipo: 'pad', modo: nuevo, turbo_hz: pad.turbo_hz || TURBO_HZ_DEFECTO });
    } else if (nuevo === 'macro') {
      const primera = macros[0];
      onCambiar(primera ? { tipo: 'macro', macro_id: primera.id } : { tipo: 'ignorar' });
    } else if (nuevo === 'tecla') {
      onCambiar({ tipo: 'tecla', tecla: 'SPACE' });
    } else {
      onCambiar({ tipo: 'ignorar' });
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <select value={tipo} aria-label={t('Tipo de acción de {entrada}', { entrada: etiqueta })}
        onChange={(e) => cambiarTipo(e.target.value as TipoUi)} className="input h-7 w-28 py-0 pl-2 text-xs">
        {(Object.keys(nombres) as TipoUi[]).map((k) => (
          <option key={k} value={k} disabled={k === 'macro' && macros.length === 0}>{nombres[k]}</option>
        ))}
      </select>
      {accion.tipo === 'pad' && (
        <select value={accion.salida} aria-label={t('Control del mando virtual para {entrada}', { entrada: etiqueta })}
          onChange={(e) => onCambiar({ ...accion, salida: e.target.value as SalidaPad })}
          className="input h-7 w-32 py-0 pl-2 font-mono text-xs">
          {SALIDAS.map((s) => <option key={s} value={s}>{nombreEnSalida(s, salida)}</option>)}
        </select>
      )}
      {accion.tipo === 'pad' && accion.modo === 'turbo' && (
        <label className="flex items-center gap-1 text-xs text-muted">
          <input type="number" min={1} max={30} step={1} value={accion.turbo_hz}
            aria-label={t('Pulsaciones por segundo')}
            onChange={(e) => onCambiar({ ...accion, turbo_hz: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })}
            className="input h-7 w-14 px-1.5 py-0 text-xs" />
          {t('por s')}
        </label>
      )}
      {accion.tipo === 'macro' && (
        <select value={accion.macro_id} aria-label={t('Macro')}
          onChange={(e) => onCambiar({ tipo: 'macro', macro_id: Number(e.target.value) })}
          className="input h-7 w-40 py-0 pl-2 text-xs">
          {macros.map((m) => <option key={m.id} value={m.id}>{m.nombre || `#${m.id}`}</option>)}
        </select>
      )}
      {accion.tipo === 'tecla' && (
        <select value={accion.tecla} aria-label={t('Tecla')}
          onChange={(e) => onCambiar({ tipo: 'tecla', tecla: e.target.value })}
          className="input h-7 w-32 py-0 pl-2 font-mono text-xs">
          {TECLAS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      )}
    </div>
  );
}
