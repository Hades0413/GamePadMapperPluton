import type { Binding, ProfileConfig } from './ProfileConfig';

/**
 * Adaptar un perfil a otra pantalla como los juegos adaptan su interfaz: el tamano sigue a la
 * altura (en horizontal) y cada boton conserva su distancia al borde mas cercano, con transicion
 * suave entre zonas. Misma formula que la app (Profile.fitX) y gpmapper (fit_x).
 */
export interface Screen {
  readonly width: number;
  readonly height: number;
}

function anchor(t: number): number {
  const w = Math.min(1, Math.max(0, (t - 0.25) / 0.5));
  return w * w * (3 - 2 * w);
}

export function fitScale(from: Screen, to: Screen): number {
  return from.width >= from.height ? to.height / from.height : to.width / from.width;
}

export function fitX(x: number, from: Screen, to: Screen): number {
  if (from.width < from.height) return (x * to.width) / from.width;
  const s = to.height / from.height;
  return x * s + anchor(x / from.width) * (to.width - from.width * s);
}

export function fitY(y: number, from: Screen, to: Screen): number {
  if (from.width >= from.height) return (y * to.height) / from.height;
  const s = to.width / from.width;
  return y * s + anchor(y / from.height) * (to.height - from.height * s);
}

/** Pantalla con la misma orientacion que el perfil (las medidas del dispositivo pueden venir giradas). */
export function orient(screen: Screen, like: Screen): Screen {
  const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height);
  return like.width >= like.height ? { width: long, height: short } : { width: short, height: long };
}

/** Misma proporcion (con un 2 % de margen): el perfil encaja tal cual. */
export function sameRatio(a: Screen, b: Screen): boolean {
  const ra = Math.max(a.width, a.height) / Math.min(a.width, a.height);
  const rb = Math.max(b.width, b.height) / Math.min(b.width, b.height);
  return Math.abs(ra - rb) / rb < 0.02;
}

/** El perfil completo adaptado a otra pantalla. */
export function fitConfig(config: ProfileConfig, target: Screen): ProfileConfig {
  const from = config.screen;
  const to = orient(target, from);
  if (to.width === from.width && to.height === from.height) return config;
  const k = fitScale(from, to);
  const p = (pt: { x: number; y: number }) => ({ x: fitX(pt.x, from, to), y: fitY(pt.y, from, to) });
  const bindings = config.bindings.map((b): Binding => {
    switch (b.type) {
      case 'swipe': return { ...b, at: p(b.at), to: p(b.to) };
      case 'macro': return { ...b, at: p(b.at), steps: b.steps.map((s) => ({ ...s, at: p(s.at) })) };
      case 'stick': return { ...b, at: p(b.at), radius: b.radius * k };
      default: return { ...b, at: p(b.at) };
    }
  });
  return { ...config, screen: to, bindings };
}
