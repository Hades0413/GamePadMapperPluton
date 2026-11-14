import type { Binding, ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import type { ReactNode, Ref } from 'react';
import { useT } from '../../i18n/I18nContext';
import { shortLabel } from '../../lib/labels';

/**
 * Dibujo de la pantalla con cada boton en su sitio (lo mismo que se ve en el editor de la app).
 * Los botones de una capa (L2+A) se dibujan en otro color.
 */
export function ProfilePreview({
  config, background = null, className = '', overlay = null, svgRef,
}: {
  config: ProfileConfig; background?: string | null; className?: string;
  /** Capa interactiva encima (el editor visual pone aqui los tiradores). */
  overlay?: ReactNode; svgRef?: Ref<SVGSVGElement>;
}) {
  const t = useT();
  const { width, height } = config.screen;
  const unit = Math.min(width, height);
  const r = unit * 0.045;
  const font = unit * 0.034;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      role={overlay ? 'group' : 'img'}
      aria-label={t('Distribución de {n} botones en una pantalla de {w}×{h}', { n: config.bindings.length, w: width, h: height })}
      className={`w-full rounded-xl border border-line bg-[#0b0710] ${className}`}
    >
      <defs>
        <pattern id="grid" width={unit / 8} height={unit / 8} patternUnits="userSpaceOnUse">
          <path d={`M ${unit / 8} 0 L 0 0 0 ${unit / 8}`} fill="none" stroke="#ffffff" strokeOpacity="0.04" />
        </pattern>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 10 5 0 10z" className="fill-accent" />
        </marker>
      </defs>
      {background ? (
        <>
          {/* Captura del juego que cubre la pantalla del perfil (se recorta si la proporcion no coincide). */}
          <image href={background} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
          <rect width={width} height={height} fill="#000" fillOpacity="0.28" />
        </>
      ) : (
        <rect width={width} height={height} fill="url(#grid)" />
      )}
      {config.bindings.map((b, i) => (
        <BindingShape key={`${i}:${b.key}`} binding={b} r={r} font={font} onImage={!!background} />
      ))}
      {overlay}
    </svg>
  );
}

function BindingShape({
  binding: b, r, font, onImage,
}: { binding: Binding; r: number; font: number; onImage: boolean }) {
  const layer = b.modifier !== null;
  // Sobre una captura: relleno mas opaco y borde claro para que se distingan del juego.
  const fill = onImage
    ? (layer ? 'fill-warning/75 stroke-white' : 'fill-primary-strong/75 stroke-white')
    : (layer ? 'fill-warning/25 stroke-warning' : 'fill-primary/25 stroke-primary');
  const label = (
    <text
      x={b.at.x}
      y={b.at.y}
      dy="0.35em"
      textAnchor="middle"
      fontSize={layer ? font * 0.8 : font}
      fontWeight="600"
      className="pointer-events-none fill-white select-none"
      style={onImage ? { paintOrder: 'stroke', stroke: 'rgba(0,0,0,.6)', strokeWidth: font * 0.12 } : undefined}
    >
      {layer ? `${shortLabel(b.modifier ?? '')}+${shortLabel(b.button)}` : shortLabel(b.button)}
    </text>
  );

  switch (b.type) {
    case 'stick':
      return (
        <g>
          <circle cx={b.at.x} cy={b.at.y} r={b.radius} className={onImage ? 'fill-accent/25 stroke-white' : 'fill-accent/10 stroke-accent'} strokeWidth={r * 0.08} />
          <circle cx={b.at.x} cy={b.at.y} r={r * 0.9} className={onImage ? 'fill-accent/75 stroke-white' : 'fill-accent/30 stroke-accent'} strokeWidth={r * 0.06} />
          {label}
        </g>
      );
    case 'look':
      return (
        <g>
          <circle cx={b.at.x} cy={b.at.y} r={r * 1.6} className={onImage ? 'fill-accent/30 stroke-white' : 'fill-accent/10 stroke-accent'} strokeWidth={r * 0.06}
            strokeDasharray={`${r * 0.3} ${r * 0.2}`} />
          {label}
        </g>
      );
    case 'swipe':
      return (
        <g>
          <line x1={b.at.x} y1={b.at.y} x2={b.to.x} y2={b.to.y} className="stroke-accent" strokeWidth={r * 0.12}
            markerEnd="url(#arrow)" />
          <circle cx={b.at.x} cy={b.at.y} r={r} className={fill} strokeWidth={r * 0.08} />
          {label}
        </g>
      );
    case 'macro':
      return (
        <g>
          <polyline points={b.steps.map((s) => `${s.at.x},${s.at.y}`).join(' ')} fill="none" className="stroke-primary/60"
            strokeWidth={r * 0.08} strokeDasharray={`${r * 0.25} ${r * 0.2}`} />
          {b.steps.slice(1).map((s, i) => (
            <g key={i}>
              <circle cx={s.at.x} cy={s.at.y} r={r * 0.55} className="fill-surface-2 stroke-primary/70" strokeWidth={r * 0.06} />
              <text x={s.at.x} y={s.at.y} dy="0.35em" textAnchor="middle" fontSize={font * 0.7} className="fill-muted">
                {i + 2}
              </text>
            </g>
          ))}
          <circle cx={b.at.x} cy={b.at.y} r={r} className={fill} strokeWidth={r * 0.08} />
          {label}
        </g>
      );
    default:
      return (
        <g>
          <circle cx={b.at.x} cy={b.at.y} r={r} className={fill} strokeWidth={r * 0.08}
            strokeDasharray={b.type === 'turbo' || b.type === 'burst' ? `${r * 0.3} ${r * 0.15}` : undefined} />
          {label}
        </g>
      );
  }
}
