import type { Binding, MacroStep, Point, ProfileConfig } from './ProfileConfig';
import { CONF_MAX_BINDINGS, CONF_MAX_BYTES, CONF_MAX_LINES, MACRO_MAX_STEPS } from './ProfileConfig';

/**
 * Valida e interpreta un perfil .conf con las MISMAS reglas que la base de datos
 * (supabase/migrations: private.validate_conf). Si se cambia una, hay que cambiar la otra.
 */
export type ConfResult =
  | { readonly ok: true; readonly config: ProfileConfig; readonly normalized: string }
  | { readonly ok: false; readonly error: string };

const NUM = /^-?[0-9]{1,6}(\.[0-9]{1,4})?$/;
const KEY = /^([A-Z0-9_]{1,20}\+)?[A-Z0-9_]{1,20}[+-]?$/;
// eslint-disable-next-line no-control-regex -- a proposito: rechaza caracteres de control
const CONTROL = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SETTINGS = new Set([
  'package', 'name', 'screen', 'deadzone', 'ls_deadzone', 'rs_deadzone',
  'ls_curve', 'rs_curve', 'look_y', 'look_invert', 'ls_axes', 'rs_axes',
  'aim_button', 'aim_scale', 'look_accel', 'controller', 'rumble', 'gyro', 'gyro_button', 'gyro_invert', 'mouse',
]);

class ConfError extends Error {}

const fail = (message: string): never => {
  throw new ConfError(message);
};

const toNum = (value: string | undefined): number | null =>
  value !== undefined && NUM.test(value) ? Number(value) : null;

function inRange(value: string, min: number, max: number): boolean {
  const n = toNum(value);
  return n !== null && n >= min && n <= max;
}

function splitKey(key: string): { button: string; modifier: string | null } {
  const plus = key.indexOf('+', 1);
  return plus > 0 && plus < key.length - 1
    ? { modifier: key.slice(0, plus), button: key.slice(plus + 1) }
    : { modifier: null, button: key };
}

/** Interpreta el valor de un boton. Devuelve la asignacion o un texto con el problema. */
function parseBinding(key: string, value: string): Binding | string {
  const args = value.split(/\s+/);
  const type = (args[0] ?? '').toLowerCase();
  const nums = args.length - 1;
  const base = { key, ...splitKey(key) };

  if (type === 'macro') {
    const parts = value.slice(5).trim().split(';');
    if (parts.length < 1 || parts.length > MACRO_MAX_STEPS) return `una macro tiene de 1 a ${MACRO_MAX_STEPS} pasos`;
    const steps: MacroStep[] = [];
    for (const part of parts) {
      const s = part.trim().split(/\s+/);
      if (s.length < 2 || s.length > 4 || s.some((a) => !NUM.test(a))) return 'cada paso es «x y [espera] [duración]»';
      const [x, y, delay, hold] = s.map(Number) as [number, number, number?, number?];
      if (x < 0 || y < 0) return 'coordenadas negativas';
      steps.push({ at: { x, y }, delayMs: delay ?? 0, holdMs: hold ?? 40 });
    }
    const first = steps[0];
    if (!first) return 'una macro tiene de 1 a 16 pasos';
    return { ...base, type: 'macro', at: first.at, steps };
  }

  const counts: Record<string, (n: number) => boolean> = {
    tap: (n) => n === 2, toggle: (n) => n === 2, quick: (n) => n === 2,
    burst: (n) => n >= 2 && n <= 4, turbo: (n) => n >= 2 && n <= 3, swipe: (n) => n >= 4 && n <= 5,
    look: (n) => n === 3, stick: (n) => n === 3 || (n === 4 && args[4]?.toLowerCase() === 'dpad'),
  };
  const countOk = counts[type];
  if (countOk && !countOk(nums)) return 'número de valores incorrecto';
  if (!countOk) return `tipo «${type}» desconocido`;
  // "dpad" solo vale como ultimo valor de un stick; el resto deben ser numeros.
  const checked = type === 'stick' && nums === 4 ? 3 : Math.min(nums, 5);
  const values = args.slice(1, checked + 1);
  if (values.some((a) => !NUM.test(a))) return 'los valores deben ser números';
  const n = values.map(Number);
  const at: Point = { x: n[0] ?? 0, y: n[1] ?? 0 };
  if (at.x < 0 || at.y < 0) return 'coordenadas negativas';

  switch (type) {
    case 'tap':
    case 'quick':
    case 'toggle':
      return { ...base, type, at };
    case 'burst':
      return { ...base, type, at, count: n[2] ?? 5, gapMs: n[3] ?? 80 };
    case 'turbo':
      return { ...base, type, at, rate: n[2] ?? 10 };
    case 'swipe': {
      const to: Point = { x: n[2] ?? 0, y: n[3] ?? 0 };
      if (to.x < 0 || to.y < 0) return 'coordenadas negativas';
      return { ...base, type, at, to, durationMs: n[4] ?? 150 };
    }
    case 'stick':
      return { ...base, type, at, radius: n[2] ?? 0, dpad: nums === 4 };
    default:
      return { ...base, type: 'look', at, sensitivity: n[2] ?? 0 };
  }
}

function pointsOf(b: Binding): Point[] {
  if (b.type === 'macro') return b.steps.map((s) => s.at);
  if (b.type === 'swipe') return [b.at, b.to];
  return [b.at];
}

function settingProblem(key: string, value: string): string | null {
  switch (key) {
    case 'name': return value.length > 60 ? 'nombre demasiado largo' : null;
    case 'screen': return /^[0-9]{3,5}\s*x\s*[0-9]{3,5}$/.test(value.toLowerCase()) ? null : 'usa el formato ANCHOxALTO';
    case 'deadzone': case 'ls_deadzone': case 'rs_deadzone':
      return inRange(value, 0, 0.95) ? null : 'debe estar entre 0 y 0.95';
    case 'ls_curve': case 'rs_curve': return inRange(value, 0.1, 5) ? null : 'debe estar entre 0.1 y 5';
    case 'look_y': return inRange(value, 0.1, 10) ? null : 'debe estar entre 0.1 y 10';
    case 'look_invert': return value === '0' || value === '1' ? null : 'debe ser 0 o 1';
    case 'aim_button': case 'gyro_button':
      return /^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(value) ? null : 'debe ser un botón (por ejemplo L2)';
    case 'aim_scale': return inRange(value, 0.1, 2) ? null : 'debe estar entre 0.1 y 2';
    case 'look_accel': return inRange(value, 0, 3) ? null : 'debe estar entre 0 y 3';
    case 'rumble': return inRange(value, 0, 1) ? null : 'debe estar entre 0 y 1';
    case 'gyro': case 'mouse': return inRange(value, 0, 5) ? null : 'debe estar entre 0 y 5';
    case 'gyro_invert': return value === '0' || value === '1' ? null : 'debe ser 0 o 1';
    case 'controller':
      return value.length <= 40 && /^[A-Za-z0-9 ._()+-]*$/.test(value)
        ? null : 'nombre de mando no válido (letras, números y . _ ( ) + -, máximo 40)';
    case 'ls_axes': case 'rs_axes':
      return /^[0-9A-Fa-f]{1,2},[0-9A-Fa-f]{1,2}$/.test(value.replace(/ /g, '')) ? null : 'usa el formato 0,1';
    default: return null;
  }
}

function parse(text: string, expectedPackage: string | undefined): ConfResult {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized === '') fail('El perfil está vacío.');
  if (new TextEncoder().encode(normalized).length > CONF_MAX_BYTES) fail('El perfil es demasiado grande (máximo 16 KB).');
  if (CONTROL.test(normalized)) fail('El perfil tiene caracteres no permitidos.');
  const lines = normalized.split('\n');
  if (lines.length > CONF_MAX_LINES) fail(`El perfil tiene demasiadas líneas (máximo ${CONF_MAX_LINES}).`);

  const settings: Record<string, string> = {};
  const bindings: Binding[] = [];
  const keys = new Set<string>();

  lines.forEach((raw, index) => {
    const n = index + 1;
    const line = (raw.split('#')[0] ?? '').trim();
    if (line === '') return;
    const eq = line.indexOf('=');
    if (eq < 0) fail(`Línea ${n}: falta «=».`);
    const rawKey = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    const lower = rawKey.toLowerCase();

    if (SETTINGS.has(lower)) {
      const problem = settingProblem(lower, value);
      if (problem) fail(`Línea ${n} (${rawKey}): ${problem}.`);
      settings[lower] = value;
      return;
    }
    const key = rawKey.replace(/ /g, '').toUpperCase();
    if (!KEY.test(key)) fail(`Línea ${n}: «${key}» no es un botón válido.`);
    if (keys.has(key)) fail(`Línea ${n}: el botón ${key} está repetido.`);
    keys.add(key);
    const binding = parseBinding(key, value);
    if (typeof binding === 'string') fail(`Línea ${n} (${key}): ${binding}.`);
    else bindings.push(binding);
  });

  const packageName = settings['package'];
  if (packageName === undefined) fail('Falta la línea «package = ...».');
  if (expectedPackage !== undefined && packageName !== expectedPackage) {
    fail(`El perfil es del juego ${packageName ?? ''}, no de ${expectedPackage}.`);
  }
  const screen = settings['screen'];
  if (screen === undefined) fail('Falta la línea «screen = ANCHOxALTO».');
  const [width = 0, height = 0] = (screen ?? '').toLowerCase().replace(/\s/g, '').split('x').map(Number);
  if (bindings.length === 0) fail('El perfil no tiene ningún botón asignado.');
  if (bindings.length > CONF_MAX_BINDINGS) fail(`El perfil tiene demasiados botones (máximo ${CONF_MAX_BINDINGS}).`);
  const outside = bindings.flatMap(pointsOf).some((p) => p.x > width * 1.05 || p.y > height * 1.05);
  if (outside) fail('Hay botones fuera de la pantalla indicada en «screen».');

  return {
    ok: true,
    normalized,
    config: {
      packageName: packageName ?? '',
      name: settings['name'] ?? null,
      screen: { width, height },
      settings,
      bindings,
    },
  };
}

export function validateConf(text: string, expectedPackage?: string): ConfResult {
  try {
    return parse(text, expectedPackage);
  } catch (error) {
    if (error instanceof ConfError) return { ok: false, error: error.message };
    throw error;
  }
}
