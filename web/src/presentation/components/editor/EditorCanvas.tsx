import type { Binding, ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { clampPoint, handlePoint, moveHandle, removeStep, type Handle, type MacroBinding } from '@domain/profile/conf/editConf';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useT } from '../../i18n/I18nContext';
import { buttonLabel } from '../../lib/labels';
import { ProfilePreview } from '../profile/ProfilePreview';

interface HandleSpec {
  readonly handle: Handle;
  readonly scale: number;
}

function handlesOf(b: Binding): HandleSpec[] {
  switch (b.type) {
    case 'swipe':
      return [{ handle: { kind: 'at' }, scale: 1 }, { handle: { kind: 'to' }, scale: 0.7 }];
    case 'macro':
      return b.steps.map((_, index) => ({ handle: { kind: 'step', index } as Handle, scale: index === 0 ? 1 : 0.7 }));
    case 'stick':
      return [{ handle: { kind: 'at' }, scale: 1 }, { handle: { kind: 'radius' }, scale: 0.5 }];
    default:
      return [{ handle: { kind: 'at' }, scale: 1 }];
  }
}

/**
 * Lienzo del editor: la misma vista que ProfilePreview con un tirador por cada parte de cada boton.
 * Se arrastran con raton o dedo (pointer events) y con el teclado (flechas, Mayus = pasos grandes,
 * Supr borra). El SVG escala al ancho disponible conservando la proporcion de la pantalla.
 */
export function EditorCanvas({
  config, background, selected, onSelect, onChange, onDelete,
}: {
  config: ProfileConfig;
  background: string | null;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onChange: (index: number, binding: Binding) => void;
  onDelete: (index: number) => void;
}) {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; handle: Handle } | null>(null);
  const { width, height } = config.screen;
  const unit = Math.min(width, height);
  const r = unit * 0.045;

  const toScreen = (e: PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return clampPoint({ x: p.x, y: p.y }, config.screen);
  };

  const onDown = (e: PointerEvent<SVGCircleElement>, index: number, handle: Handle) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { index, handle };
    onSelect(index);
  };

  const onMove = (e: PointerEvent<SVGCircleElement>, index: number, handle: Handle) => {
    const d = drag.current;
    const b = config.bindings[index];
    if (!d || d.index !== index || !b || JSON.stringify(d.handle) !== JSON.stringify(handle)) return;
    const p = toScreen(e);
    if (p) onChange(index, moveHandle(b, handle, p));
  };

  const onKey = (e: KeyboardEvent<SVGCircleElement>, index: number, handle: Handle) => {
    const b = config.bindings[index];
    if (!b) return;
    const step = (e.shiftKey ? 0.02 : 0.002) * unit;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const move = delta[e.key];
    if (move) {
      e.preventDefault();
      const cur = handlePoint(b, handle);
      onChange(index, moveHandle(b, handle, clampPoint({ x: cur.x + move[0], y: cur.y + move[1] }, config.screen)));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (b.type === 'macro' && handle.kind === 'step' && handle.index > 0) {
        onChange(index, removeStep(b as MacroBinding, handle.index));
      } else if (handle.kind === 'at' || handle.kind === 'step') {
        onDelete(index);
      }
    } else if (e.key === 'Escape') {
      onSelect(null);
    }
  };

  const overlay = (
    <>
      <rect width={width} height={height} fill="transparent" onPointerDown={() => onSelect(null)} />
      {config.bindings.map((b, index) => {
        const isSel = index === selected;
        const name = buttonLabel(b.key, t);
        return handlesOf(b).map(({ handle, scale }) => {
          const p = handlePoint(b, handle);
          const id = `${index}:${handle.kind}:${handle.kind === 'step' ? handle.index : 0}`;
          const label = handle.kind === 'to' ? t('Final del deslizamiento de {name}', { name })
            : handle.kind === 'radius' ? t('Radio del joystick {name}', { name })
              : handle.kind === 'step' && handle.index > 0 ? t('Paso {n} de {name}', { n: handle.index + 1, name })
                : t('Mover {name}', { name });
          const main = handle.kind === 'at' || (handle.kind === 'step' && handle.index === 0);
          return (
            <circle
              key={id}
              cx={p.x} cy={p.y} r={r * scale * (handle.kind === 'radius' ? 0.6 : 1.1)}
              role="button" aria-label={label} aria-pressed={main ? isSel : undefined}
              tabIndex={main && index === (selected ?? 0) ? 0 : -1}
              style={{ touchAction: 'none' }}
              strokeWidth={r * 0.14}
              className={`cursor-grab outline-none active:cursor-grabbing focus-visible:stroke-white ${
                handle.kind === 'radius' ? 'fill-accent stroke-white' : isSel ? 'fill-white/10 stroke-accent' : 'fill-transparent stroke-transparent'}`}
              onPointerDown={(e) => onDown(e, index, handle)}
              onPointerMove={(e) => onMove(e, index, handle)}
              onPointerUp={() => { drag.current = null; }}
              onPointerCancel={() => { drag.current = null; }}
              onFocus={() => onSelect(index)}
              onKeyDown={(e) => onKey(e, index, handle)}
            />
          );
        });
      })}
    </>
  );

  return (
    <ProfilePreview config={config} background={background} overlay={overlay} svgRef={svgRef} className="select-none" />
  );
}
