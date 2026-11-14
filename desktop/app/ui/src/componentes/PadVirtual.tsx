import { NOMBRE_SALIDA, nombreEnSalida, pulsadoPad } from '../dominio/configuracion';
import { CONTROLES, SALIDAS, type Control, type EstadoEstandar, type EstadoPad, type VistaSalida } from '../dominio/tipos';
import { useT } from '../i18n/contexto';
import { DiagramaMando } from './DiagramaMando';

const TODOS_ASIGNADOS = Object.fromEntries(CONTROLES.map((c) => [c, 'x'])) as Record<Control, string>;

/** El mando virtual tal como lo ve el juego: dibujo en vivo y controles pulsados. */
export function PadVirtual({ pad, salida, compacto = false }: { pad: EstadoPad | null; salida: VistaSalida | null; compacto?: boolean }) {
  const t = useT();
  const estandar: EstadoEstandar | null = pad && {
    botones: Object.fromEntries(CONTROLES.filter((c) => !c.includes('_X') && !c.includes('_Y'))
      .map((c) => [c, c === 'L2' ? pad.l2 > 0.5 : c === 'R2' ? pad.r2 > 0.5 : pulsadoPad(pad, c as (typeof SALIDAS)[number])])),
    ls: pad.ls, rs: pad.rs, l2: pad.l2, r2: pad.r2,
  };
  const tipo = salida?.tipo ?? 'ninguna';
  const etiquetas = Object.fromEntries((['A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2'] as const).map((c) => [c, nombreEnSalida(c, tipo)]));
  const pulsados = pad ? SALIDAS.filter((s) => pulsadoPad(pad, s)) : [];
  return (
    <section className="card p-4" aria-label={t('Mando virtual')}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('Mando virtual')}</h2>
        <span className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${salida?.activa
          ? 'bg-success/15 text-success' : 'bg-surface-2 text-muted'}`}>
          <span className={`size-1.5 rounded-full ${salida?.activa ? 'bg-success' : 'bg-line'}`} />
          {tipo === 'ninguna' ? t('Sin mando virtual') : `${tipo === 'toques' ? t('Toques') : NOMBRE_SALIDA[tipo]} · ${salida?.activa ? t('Activo') : t('Inactivo')}`}
        </span>
      </div>
      <div className={compacto ? 'mx-auto max-w-[18rem]' : 'mx-auto max-w-[26rem]'}>
        <DiagramaMando estado={estandar} seleccionado={null} pedido={null} asignados={TODOS_ASIGNADOS} onElegir={() => undefined} soloLectura etiquetas={etiquetas} />
      </div>
      <p className="mt-1 min-h-5 truncate text-center font-mono text-xs text-muted">
        {pulsados.length > 0 ? pulsados.map((s) => nombreEnSalida(s, tipo)).join(' · ') : t('Nada pulsado')}
      </p>
    </section>
  );
}
