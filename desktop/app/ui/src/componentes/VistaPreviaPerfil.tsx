import type { BotonVista } from '../dominio/tipos';
import { useT } from '../i18n/contexto';

/** Nombre corto de un boton del perfil (como `shortLabel` de la web). */
function corto(b: string): string {
  const flechas: Record<string, string> = { DPAD_UP: '↑', DPAD_DOWN: '↓', DPAD_LEFT: '←', DPAD_RIGHT: '→', SELECT: 'SEL', START: 'STA', HOME: 'H' };
  return flechas[b] ?? b.replace(/^AXIS_/, 'E').replace(/^BTN_/, '');
}

/**
 * Dibujo de la pantalla del perfil con cada boton en su sitio (lo mismo que el `ProfilePreview`
 * de la web): circulos para los toques, el radio de los sticks, flechas para deslizar y la ruta de
 * las macros. Los botones de una capa (L2+A) van en otro color.
 */
export function VistaPreviaPerfil({ pantalla, lista, className = '' }: { pantalla: [number, number]; lista: BotonVista[]; className?: string }) {
  const t = useT();
  const [ancho, alto] = pantalla;
  const unidad = Math.min(ancho, alto);
  const r = unidad * 0.045;
  const letra = unidad * 0.034;
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} role="img"
      aria-label={t('Distribución de {n} botones en una pantalla de {w}×{h}', { n: lista.length, w: ancho, h: alto })}
      className={`w-full rounded-xl border border-line bg-[#0b0710] ${className}`}>
      <defs>
        <pattern id="rejilla-perfil" width={unidad / 8} height={unidad / 8} patternUnits="userSpaceOnUse">
          <path d={`M ${unidad / 8} 0 L 0 0 0 ${unidad / 8}`} fill="none" stroke="#ffffff" strokeOpacity="0.05" />
        </pattern>
        <marker id="flecha-perfil" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 10 5 0 10z" className="fill-accent" />
        </marker>
      </defs>
      <rect width={ancho} height={alto} fill="url(#rejilla-perfil)" />
      {lista.map((b, i) => {
        const capa = b.modificador !== null;
        const relleno = capa ? 'fill-warning/25 stroke-warning' : 'fill-primary/25 stroke-primary';
        const texto = (
          <text x={b.x} y={b.y} dy="0.35em" textAnchor="middle" fontSize={capa ? letra * 0.8 : letra} fontWeight="600"
            className="pointer-events-none fill-white select-none">
            {capa ? `${corto(b.modificador ?? '')}+${corto(b.boton)}` : corto(b.boton)}
          </text>
        );
        return (
          <g key={`${i}:${b.tecla}`}>
            {b.tipo === 'stick' && (
              <circle cx={b.x} cy={b.y} r={b.radio ?? r} className="fill-accent/10 stroke-accent" strokeWidth={r * 0.08} />
            )}
            {b.tipo === 'look' && (
              <circle cx={b.x} cy={b.y} r={r * 1.6} className="fill-accent/10 stroke-accent" strokeWidth={r * 0.06}
                strokeDasharray={`${r * 0.3} ${r * 0.2}`} />
            )}
            {b.tipo === 'swipe' && b.hasta && (
              <line x1={b.x} y1={b.y} x2={b.hasta[0]} y2={b.hasta[1]} className="stroke-accent" strokeWidth={r * 0.12}
                markerEnd="url(#flecha-perfil)" />
            )}
            {b.tipo === 'macro' && b.pasos.length > 1 && (
              <polyline points={b.pasos.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" className="stroke-primary/60"
                strokeWidth={r * 0.08} strokeDasharray={`${r * 0.25} ${r * 0.2}`} />
            )}
            {b.tipo === 'macro' && b.pasos.slice(1).map(([x, y], k) => (
              <circle key={k} cx={x} cy={y} r={r * 0.55} className="fill-surface-2 stroke-primary/70" strokeWidth={r * 0.06} />
            ))}
            {b.tipo !== 'look' && (
              <circle cx={b.x} cy={b.y} r={b.tipo === 'stick' ? r * 0.9 : r}
                className={b.tipo === 'stick' ? 'fill-accent/30 stroke-accent' : relleno} strokeWidth={r * 0.08} />
            )}
            {texto}
          </g>
        );
      })}
    </svg>
  );
}
