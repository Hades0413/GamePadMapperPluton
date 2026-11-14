import type { KeyboardEvent, ReactNode } from 'react';
import { ETIQUETA } from '../dominio/controles';
import type { Control, EstadoEstandar } from '../dominio/tipos';
import { useT } from '../i18n/contexto';

/**
 * Dibujo propio de un mando generico (sin marcas ni ilustraciones de terceros). Cada control es
 * pulsable para elegir su entrada; se ilumina con el estado estandar en vivo.
 */

interface Props {
  estado: EstadoEstandar | null;
  seleccionado: Control | null;
  /** Control que pide el asistente (parpadea). */
  pedido: Control | null;
  asignados: Partial<Record<Control, string>>;
  onElegir: (c: Control) => void;
}

const CUERPO =
  'M178 92C128 92 101 112 86 152L46 290C34 336 56 370 96 372C126 374 146 356 166 326L190 292H450L474 326C494 356 514 374 544 372C584 370 606 336 594 290L554 152C539 112 512 92 462 92Z';

export function DiagramaMando({ estado, seleccionado, pedido, asignados, onElegir }: Props) {
  const t = useT();
  const pulsado = (c: Control) => estado?.botones[c] ?? false;

  const clase = (c: Control, ...extra: Control[]) => {
    const grupo = [c, ...extra];
    if (pedido && grupo.includes(pedido)) return 'diag-pedido';
    if (seleccionado && grupo.includes(seleccionado)) return 'diag-sel';
    if (grupo.every((g) => !asignados[g])) return 'diag-libre';
    return '';
  };

  // Funciones que devuelven JSX (no componentes): el diagrama se redibuja 60 veces por segundo.
  const pieza = (c: Control, children: ReactNode, extra: Control[] = []) => {
    const alPulsarTecla = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onElegir(c);
      }
    };
    return (
      <g key={c} role="button" tabIndex={0} aria-label={t('Elegir la entrada de {control}', { control: ETIQUETA[c] })}
        className={`diag-pieza ${clase(c, ...extra)}`} onClick={() => onElegir(c)} onKeyDown={alPulsarTecla}>
        {children}
      </g>
    );
  };

  const relleno = (activo: boolean) => (activo ? 'var(--color-primary)' : 'var(--color-surface-2)');
  const texto = (activo: boolean) => (activo ? 'var(--color-bg)' : 'var(--color-ink)');

  const botonCara = (c: Control, x: number, y: number) => pieza(c, (
    <>
      <circle cx={x} cy={y} r={17} fill={relleno(pulsado(c))} className="diag-borde" />
      <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill={texto(pulsado(c))}>{ETIQUETA[c]}</text>
    </>
  ));

  const stick = (x: number, y: number, valor: [number, number], ejeX: Control, ejeY: Control, boton: Control, nombre: string) => pieza(ejeX, (
    <>
      <circle cx={x} cy={y} r={36} fill="var(--color-bg)" className="diag-borde" />
      <circle cx={x} cy={y} r={22} fill="none" stroke="var(--color-line)" strokeDasharray="3 4" />
      <circle cx={x + valor[0] * 20} cy={y + valor[1] * 20} r={15} fill={relleno(pulsado(boton))} stroke="var(--color-primary)" strokeWidth={Math.hypot(...valor) > 0.05 ? 2 : 0} />
      <text x={x} y={y + 56} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{nombre}</text>
    </>
  ), [ejeY, boton]);

  const gatillo = (c: Control, x: number, valor: number) => pieza(c, (
    <>
      <rect x={x} y={26} width={86} height={30} rx={12} fill="var(--color-surface-2)" className="diag-borde" />
      <clipPath id={`gatillo-${c}`}><rect x={x} y={26} width={86} height={30} rx={12} /></clipPath>
      <rect x={x} y={26} width={86 * valor} height={30} fill="var(--color-primary)" opacity={0.85} clipPath={`url(#gatillo-${c})`} />
      <text x={x + 43} y={46} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--color-ink)">{c}</text>
    </>
  ));

  const bumper = (c: Control, x: number) => pieza(c, (
    <>
      <rect x={x} y={64} width={108} height={22} rx={11} fill={relleno(pulsado(c))} className="diag-borde" />
      <text x={x + 54} y={79} textAnchor="middle" fontSize="12" fontWeight="700" fill={texto(pulsado(c))}>{c}</text>
    </>
  ));

  const flecha = (c: Control, x: number, y: number, rot: number) => pieza(c, (
    <>
      <rect x={x - 14} y={y - 14} width={28} height={28} rx={5} fill={relleno(pulsado(c))} className="diag-borde" />
      <path d="M-5 3 0 -4 5 3" transform={`translate(${x} ${y}) rotate(${rot})`} fill="none"
        stroke={texto(pulsado(c))} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ));

  const pastilla = (c: Control, x: number, y: number, nombre: string) => pieza(c, (
    <>
      <rect x={x - 22} y={y - 9} width={44} height={18} rx={9} fill={relleno(pulsado(c))} className="diag-borde" />
      <text x={x} y={y + 24} textAnchor="middle" fontSize="10" fill="var(--color-muted)">{nombre}</text>
    </>
  ));

  return (
    <svg viewBox="0 0 640 400" className="h-auto w-full" role="group" aria-label={t('Diagrama del mando')}>
      {gatillo('L2', 136, estado?.l2 ?? 0)}
      {gatillo('R2', 418, estado?.r2 ?? 0)}
      {bumper('L1', 124)}
      {bumper('R1', 408)}
      <path d={CUERPO} fill="var(--color-surface)" stroke="var(--color-line)" strokeWidth={2} />
      <path d={CUERPO} fill="url(#brillo)" opacity={0.6} />
      <defs>
        <radialGradient id="brillo" cx="50%" cy="0%" r="80%">
          <stop offset="0%" stopColor="#b088f9" stopOpacity={0.14} />
          <stop offset="100%" stopColor="#b088f9" stopOpacity={0} />
        </radialGradient>
      </defs>

      {stick(196, 168, estado?.ls ?? [0, 0], 'LS_X', 'LS_Y', 'L3', 'LS · L3')}
      {stick(392, 250, estado?.rs ?? [0, 0], 'RS_X', 'RS_Y', 'R3', 'RS · R3')}

      {flecha('DPAD_UP', 250, 222, 0)}
      {flecha('DPAD_DOWN', 250, 278, 180)}
      {flecha('DPAD_LEFT', 222, 250, -90)}
      {flecha('DPAD_RIGHT', 278, 250, 90)}

      {botonCara('Y', 444, 130)}
      {botonCara('X', 408, 166)}
      {botonCara('B', 480, 166)}
      {botonCara('A', 444, 202)}

      {pastilla('SELECT', 282, 150, 'SELECT')}
      {pastilla('START', 358, 150, 'START')}
      {pieza('HOME', (
        <>
          <circle cx={320} cy={200} r={15} fill={relleno(pulsado('HOME'))} className="diag-borde" />
          <circle cx={320} cy={200} r={5} fill={pulsado('HOME') ? 'var(--color-bg)' : 'var(--color-primary)'} />
        </>
      ))}
    </svg>
  );
}
