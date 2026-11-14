/**
 * Lineas SDL GameControllerDB (como las que da «Exportar SDL» en la app de escritorio):
 *   03000000c82d00000161000000000000,8BitDo SN30 Pro,a:b1,b:b0,...,platform:Linux,
 * Validacion y forma canonica identicas a private.canonical_sdl (supabase/migrations/20261114030000_mandos_comunidad.sql).
 * La base de datos vuelve a validar siempre: esto solo sirve para avisar antes de enviar.
 */

export const SDL_MAX_BYTES = 1024;
export const SDL_MIN_CONTROLS = 6;
export const SDL_NAME_MIN = 2;
export const SDL_NAME_MAX = 80;

export const SDL_PLATFORMS = ['Windows', 'Linux'] as const;
export type SdlPlatform = (typeof SDL_PLATFORMS)[number];

/** Controles admitidos, en el orden canonico. */
export const SDL_KEYS = [
  'a', 'b', 'x', 'y', 'back', 'guide', 'start', 'leftstick', 'rightstick', 'leftshoulder', 'rightshoulder',
  'dpup', 'dpdown', 'dpleft', 'dpright', 'leftx', 'lefty', 'rightx', 'righty', 'lefttrigger', 'righttrigger',
  'misc1', 'paddle1', 'paddle2', 'paddle3', 'paddle4', 'touchpad',
] as const;
export type SdlKey = (typeof SDL_KEYS)[number];

const VALUE = /^[+-]?(b[0-9]{1,3}|a[0-9]{1,2}~?|h[0-9]{1,2}\.(1|2|4|8))$/;
const GUID = /^[0-9a-f]{32}$/;
// eslint-disable-next-line no-control-regex -- a proposito: sin caracteres de control
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const SAFE_KEY = /^[A-Za-z0-9+-]{1,20}$/;

export type SdlErrorCode =
  | 'EMPTY' | 'TOO_LONG' | 'CONTROL_CHARS' | 'NOT_SDL' | 'BAD_GUID' | 'BAD_NAME_LENGTH' | 'BAD_NAME_CHARS'
  | 'BAD_FIELD' | 'UNKNOWN_KEY' | 'UNKNOWN_KEY_SAFE' | 'DUPLICATE_KEY' | 'BAD_VALUE' | 'BAD_PLATFORM'
  | 'DUPLICATE_PLATFORM' | 'NO_PLATFORM' | 'TOO_FEW';

/** Mensaje (en espanol, clave del i18n) de cada error. {key} = control afectado. */
export const SDL_ERROR_MESSAGE: Readonly<Record<SdlErrorCode, string>> = {
  EMPTY: 'Pega la línea que da «Exportar SDL» en la app.',
  TOO_LONG: 'La línea es demasiado larga (máximo 1024 bytes).',
  CONTROL_CHARS: 'La línea tiene caracteres no permitidos (debe ser una sola línea).',
  NOT_SDL: 'No parece una línea SDL: GUID,nombre,controles…,platform:Linux,',
  BAD_GUID: 'El GUID debe tener 32 caracteres hexadecimales.',
  BAD_NAME_LENGTH: 'El nombre del mando debe tener entre 2 y 80 caracteres.',
  BAD_NAME_CHARS: 'El nombre del mando no puede contener < ni >.',
  BAD_FIELD: 'Cada control debe ir como nombre:valor (por ejemplo a:b0).',
  UNKNOWN_KEY: 'Hay un control desconocido.',
  UNKNOWN_KEY_SAFE: 'Control desconocido: «{key}».',
  DUPLICATE_KEY: 'El control «{key}» aparece repetido.',
  BAD_VALUE: 'Valor no válido para «{key}» (ejemplos: b0, a1, a2~, h0.4).',
  BAD_PLATFORM: 'La plataforma debe ser Windows o Linux.',
  DUPLICATE_PLATFORM: 'La plataforma aparece repetida.',
  NO_PLATFORM: 'Falta la plataforma (platform:Windows o platform:Linux).',
  TOO_FEW: 'Faltan controles: asigna al menos 6.',
};

export interface SdlField {
  readonly key: SdlKey;
  readonly value: string;
}

export interface SdlMapping {
  readonly guid: string;
  readonly name: string;
  readonly platform: SdlPlatform;
  /** Controles en el orden canonico. */
  readonly fields: readonly SdlField[];
  /** Linea canonica (la que se guarda). */
  readonly mapping: string;
}

export type SdlResult =
  | { readonly ok: true; readonly value: SdlMapping }
  | { readonly ok: false; readonly code: SdlErrorCode; readonly key?: string };

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
const isKey = (k: string): k is SdlKey => (SDL_KEYS as readonly string[]).includes(k);
const isPlatform = (p: string): p is SdlPlatform => (SDL_PLATFORMS as readonly string[]).includes(p);

/** Valida una linea SDL y la devuelve normalizada (o el primer error). */
export function parseSdlLine(line: string): SdlResult {
  const fail = (code: SdlErrorCode, key?: string): SdlResult => (key === undefined ? { ok: false, code } : { ok: false, code, key });
  if (utf8Bytes(line) > SDL_MAX_BYTES * 2) return fail('TOO_LONG');
  const text = line.trim();
  if (!text) return fail('EMPTY');
  if (utf8Bytes(text) > SDL_MAX_BYTES) return fail('TOO_LONG');
  if (CONTROL.test(text)) return fail('CONTROL_CHARS');
  const parts = text.split(',');
  if (parts.length < 3) return fail('NOT_SDL');

  const guid = (parts[0] ?? '').trim().toLowerCase();
  if (!GUID.test(guid)) return fail('BAD_GUID');
  const name = (parts[1] ?? '').replace(/\s+/g, ' ').trim();
  const nameLength = [...name].length;
  if (nameLength < SDL_NAME_MIN || nameLength > SDL_NAME_MAX) return fail('BAD_NAME_LENGTH');
  if (/[<>]/.test(name)) return fail('BAD_NAME_CHARS');

  const values = new Map<SdlKey, string>();
  let platform: SdlPlatform | null = null;
  for (const raw of parts.slice(2)) {
    const field = raw.trim();
    if (!field) continue;
    const colon = field.indexOf(':');
    if (colon < 0) return fail('BAD_FIELD');
    const key = field.slice(0, colon);
    const value = field.slice(colon + 1);
    if (key === 'platform') {
      if (platform) return fail('DUPLICATE_PLATFORM');
      if (!isPlatform(value)) return fail('BAD_PLATFORM');
      platform = value;
      continue;
    }
    if (!isKey(key)) return SAFE_KEY.test(key) ? fail('UNKNOWN_KEY_SAFE', key) : fail('UNKNOWN_KEY');
    if (values.has(key)) return fail('DUPLICATE_KEY', key);
    if (!VALUE.test(value)) return fail('BAD_VALUE', key);
    values.set(key, value);
  }
  if (!platform) return fail('NO_PLATFORM');
  if (values.size < SDL_MIN_CONTROLS) return fail('TOO_FEW');

  const fields = SDL_KEYS.flatMap((key) => {
    const value = values.get(key);
    return value === undefined ? [] : [{ key, value }];
  });
  const mapping = `${guid},${name},${fields.map((f) => `${f.key}:${f.value},`).join('')}platform:${platform},`;
  return { ok: true, value: { guid, name, platform, fields, mapping } };
}

/** Mensaje en espanol de un resultado fallido (para errores del dominio). */
export function sdlErrorText(result: Extract<SdlResult, { ok: false }>): string {
  return SDL_ERROR_MESSAGE[result.code].replace('{key}', result.key ?? '');
}

/** Nombre legible de cada control (clave del i18n). */
export const SDL_KEY_LABEL: Readonly<Record<SdlKey, string>> = {
  a: 'A', b: 'B', x: 'X', y: 'Y',
  back: 'Back / Select', guide: 'Guía (Home)', start: 'Start',
  leftstick: 'Clic stick izq.', rightstick: 'Clic stick der.',
  leftshoulder: 'LB / L1', rightshoulder: 'RB / R1',
  dpup: 'Cruceta ↑', dpdown: 'Cruceta ↓', dpleft: 'Cruceta ←', dpright: 'Cruceta →',
  leftx: 'Stick izq. X', lefty: 'Stick izq. Y', rightx: 'Stick der. X', righty: 'Stick der. Y',
  lefttrigger: 'LT / L2', righttrigger: 'RT / R2',
  misc1: 'Captura / Share', paddle1: 'Pala 1', paddle2: 'Pala 2', paddle3: 'Pala 3', paddle4: 'Pala 4',
  touchpad: 'Panel táctil',
};

/** Campos de una linea ya guardada (canonica). Si algo no cuadra, devuelve los que entienda. */
export function sdlFields(mapping: string): readonly SdlField[] {
  const result = parseSdlLine(mapping);
  return result.ok ? result.value.fields : [];
}
