import type { Binding, BindingType, MacroStep, Point, ProfileConfig } from './ProfileConfig';

/** Operaciones puras para editar un perfil (las usa el editor visual). */

type Screen = ProfileConfig['screen'];
export type MacroBinding = Extract<Binding, { type: 'macro' }>;

/** Parte de un boton que se puede arrastrar. */
export type Handle =
  | { readonly kind: 'at' }
  | { readonly kind: 'to' }
  | { readonly kind: 'radius' }
  | { readonly kind: 'step'; readonly index: number };

/** Botones estandar de la app, en el orden en que se ofrecen. */
export const STANDARD_BUTTONS = [
  'A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'SELECT', 'START', 'HOME',
  'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT', 'LS', 'RS',
] as const;

/** Botones que se ofrecen como modificador de capa. */
export const LAYER_MODIFIERS = ['L1', 'R1', 'L2', 'R2', 'SELECT', 'L3', 'R3'] as const;

export const SCREEN_PRESETS: readonly Screen[] = [
  { width: 2400, height: 1080 },
  { width: 2340, height: 1080 },
  { width: 1600, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1600 },
];

const round = (n: number) => Math.round(n * 100) / 100;

export function clampPoint(p: Point, screen: Screen): Point {
  return {
    x: round(Math.min(screen.width, Math.max(0, p.x))),
    y: round(Math.min(screen.height, Math.max(0, p.y))),
  };
}

export function composeKey(button: string, modifier: string | null): string {
  return modifier ? `${modifier}+${button}` : button;
}

export function withKey(b: Binding, button: string, modifier: string | null): Binding {
  return { ...b, key: composeKey(button, modifier), button, modifier };
}

export function patchBinding<B extends Binding>(b: B, patch: Partial<B>): B {
  return { ...b, ...patch };
}

/** Primer boton estandar que aun no esta asignado (o BTN_1, BTN_2...). */
export function nextFreeKey(bindings: readonly Binding[]): string {
  const used = new Set(bindings.map((b) => b.key));
  const standard = STANDARD_BUTTONS.find((k) => !used.has(k));
  if (standard) return standard;
  for (let i = 1; ; i++) if (!used.has(`BTN_${i}`)) return `BTN_${i}`;
}

function base(b: Pick<Binding, 'key' | 'button' | 'modifier'>) {
  return { key: b.key, button: b.button, modifier: b.modifier };
}

/** Cambia el tipo de un boton conservando su posicion (y los valores si el tipo no cambia). */
export function retype(b: Binding, type: BindingType, screen: Screen): Binding {
  if (b.type === type) return b;
  const at = b.at;
  const unit = Math.min(screen.width, screen.height);
  const shifted = (dx: number, dy: number): Point => clampPoint({ x: at.x + dx, y: at.y + dy }, screen);
  const k = base(b);
  switch (type) {
    case 'tap':
    case 'quick':
    case 'toggle':
      return { ...k, type, at };
    case 'burst':
      return { ...k, type, at, count: 5, gapMs: 80 };
    case 'turbo':
      return { ...k, type, at, rate: 10 };
    case 'swipe':
      return { ...k, type, at, to: shifted(0, -unit * 0.25), durationMs: 150 };
    case 'macro':
      return {
        ...k, type, at,
        steps: [{ at, delayMs: 0, holdMs: 40 }, { at: shifted(unit * 0.12, 0), delayMs: 200, holdMs: 40 }],
      };
    case 'stick':
      return { ...k, type, at, radius: Math.round(unit * 0.15), dpad: false };
    case 'look':
      return { ...k, type, at, sensitivity: 14 };
  }
}

export function newBinding(key: string, screen: Screen): Binding {
  const at = { x: Math.round(screen.width / 2), y: Math.round(screen.height / 2) };
  const plus = key.indexOf('+', 1);
  const layered = plus > 0 && plus < key.length - 1;
  return {
    key, button: layered ? key.slice(plus + 1) : key, modifier: layered ? key.slice(0, plus) : null,
    type: 'tap', at,
  };
}

/** Mueve una parte arrastrable de un boton a un punto (ya limitado a la pantalla). */
export function moveHandle(b: Binding, handle: Handle, to: Point): Binding {
  switch (b.type) {
    case 'swipe':
      return handle.kind === 'to' ? { ...b, to } : { ...b, at: to };
    case 'macro': {
      const index = handle.kind === 'step' ? handle.index : 0;
      const steps = b.steps.map((s, i) => (i === index ? { ...s, at: to } : s));
      return { ...b, steps, at: steps[0]?.at ?? b.at };
    }
    case 'stick':
      return handle.kind === 'radius'
        ? { ...b, radius: Math.max(1, Math.round(Math.hypot(to.x - b.at.x, to.y - b.at.y))) }
        : { ...b, at: to };
    default:
      return { ...b, at: to };
  }
}

/** Posicion actual de una parte arrastrable. */
export function handlePoint(b: Binding, handle: Handle): Point {
  if (b.type === 'swipe' && handle.kind === 'to') return b.to;
  if (b.type === 'macro') return b.steps[handle.kind === 'step' ? handle.index : 0]?.at ?? b.at;
  if (b.type === 'stick' && handle.kind === 'radius') return { x: b.at.x + b.radius, y: b.at.y };
  return b.at;
}

export function addStep(b: MacroBinding, screen: Screen, max: number): MacroBinding {
  if (b.steps.length >= max) return b;
  const last = b.steps[b.steps.length - 1]?.at ?? b.at;
  const step: MacroStep = {
    at: clampPoint({ x: last.x + Math.min(screen.width, screen.height) * 0.08, y: last.y }, screen),
    delayMs: 200, holdMs: 40,
  };
  return { ...b, steps: [...b.steps, step] };
}

export function removeStep(b: MacroBinding, index: number): MacroBinding {
  if (b.steps.length <= 1) return b;
  const steps = b.steps.filter((_, i) => i !== index);
  return { ...b, steps, at: steps[0]?.at ?? b.at };
}

export function patchStep(b: MacroBinding, index: number, patch: Partial<MacroStep>): MacroBinding {
  const steps = b.steps.map((s, i) => (i === index ? { ...s, ...patch } : s));
  return { ...b, steps, at: steps[0]?.at ?? b.at };
}

/** Perfil nuevo y vacio (sin botones: hay que anadir al menos uno para que sea valido). */
export function blankConfig(packageName: string, screen: Screen): ProfileConfig {
  return { packageName, name: null, screen, settings: {}, bindings: [] };
}

export function withSetting(config: ProfileConfig, key: string, value: string | null): ProfileConfig {
  const entries = Object.entries(config.settings);
  const empty = value === null || value === '';
  const next = empty ? entries.filter(([k]) => k !== key)
    : key in config.settings ? entries.map(([k, v]) => [k, k === key ? value : v] as const)
      : [...entries, [key, value] as const];
  const settings = Object.fromEntries(next);
  return { ...config, settings, name: key === 'name' ? (value || null) : config.name };
}
