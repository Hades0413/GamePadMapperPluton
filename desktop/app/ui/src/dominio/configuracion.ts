import type {
  Accion, AjusteDireccion, AjusteEje, AjusteGatillo, AjusteStick, AjusteToques, AjusteVibracion, Control, EstadoPad,
  MapeoMando, SalidaPad, TipoSalida,
} from './tipos';
import { SALIDAS } from './tipos';

/** Valores por defecto (los mismos que `Default` en Rust). */
export const EJE_DEFECTO: AjusteEje = { zona_muerta: 0, anti_zona_muerta: 0, sensibilidad: 1, saturacion: 1 };
export const STICK_DEFECTO: AjusteStick = {
  zona_muerta: 0.1, curva: 1, invertir_x: false, invertir_y: false, eje_x: { ...EJE_DEFECTO }, eje_y: { ...EJE_DEFECTO },
};
export const GATILLO_DEFECTO: AjusteGatillo = { zona_muerta: 0, anti_zona_muerta: 0, maximo: 1 };
export const VIBRACION_DEFECTO: AjusteVibracion = { activa: true, intercambiar: false, fuerza: 1, fuerte: 1, debil: 1 };
export const DIRECCION_DEFECTO: AjusteDireccion = { intercambiar_sticks: false, cruceta_a_stick: null, stick_a_cruceta: null };
export const TURBO_HZ_DEFECTO = 10;
export const TOQUES_DEFECTO: AjusteToques = { destino: { tipo: 'pantalla_completa' }, solo_con_foco: true };

/** Completa un mapeo con los campos que falten (mapeos de la version 1 o del simulador). */
export function completarMapeo(m: Partial<MapeoMando> & Pick<MapeoMando, 'guid' | 'nombre'>): MapeoMando {
  const stick = (s?: Partial<AjusteStick>): AjusteStick => ({
    ...STICK_DEFECTO, ...s, eje_x: { ...EJE_DEFECTO, ...s?.eje_x }, eje_y: { ...EJE_DEFECTO, ...s?.eje_y },
  });
  return {
    version: 2,
    asignaciones: {},
    acciones: {},
    capas: [],
    macros: [],
    salida: 'ninguna',
    ...m,
    stick_izquierdo: stick(m.stick_izquierdo),
    stick_derecho: stick(m.stick_derecho),
    gatillo_izquierdo: { ...GATILLO_DEFECTO, ...m.gatillo_izquierdo },
    gatillo_derecho: { ...GATILLO_DEFECTO, ...m.gatillo_derecho },
    vibracion: { ...VIBRACION_DEFECTO, ...m.vibracion },
    direccion: { ...DIRECCION_DEFECTO, ...m.direccion },
    toques: { ...TOQUES_DEFECTO, ...m.toques },
  };
}

/** Respuesta de un eje con signo (igual que `AjusteEje::aplicar`). */
export function respuestaEje(v: number, a: AjusteEje): number {
  const m = Math.min(1, Math.abs(v));
  if (m <= a.zona_muerta || m === 0) return 0;
  const rango = Math.max(1e-3, a.saturacion - a.zona_muerta);
  const n = Math.min(1, Math.max(0, (m - a.zona_muerta) / rango)) ** a.sensibilidad;
  return Math.sign(v) * (a.anti_zona_muerta + (1 - a.anti_zona_muerta) * n);
}

/** Stick completo (zona muerta radial, curva, respuesta por eje e inversion), como `ajustar_stick`. */
export function respuestaStick(x: number, y: number, a: AjusteStick): [number, number] {
  const m = Math.hypot(x, y);
  let r: [number, number] = [0, 0];
  if (m > a.zona_muerta && m > 0) {
    const n = Math.min(1, Math.max(0, (Math.min(m, 1) - a.zona_muerta) / (1 - a.zona_muerta))) ** a.curva;
    r = [Math.max(-1, Math.min(1, (x * n) / m)), Math.max(-1, Math.min(1, (y * n) / m))];
  }
  r = [respuestaEje(r[0], a.eje_x), respuestaEje(r[1], a.eje_y)];
  return [a.invertir_x ? -r[0] : r[0], a.invertir_y ? -r[1] : r[1]];
}

export function respuestaGatillo(v: number, a: AjusteGatillo): number {
  return respuestaEje(Math.min(1, Math.max(0, v)), { ...a, sensibilidad: 1, saturacion: a.maximo });
}

/** Etiqueta corta de cada control del mando virtual. */
export const ETIQUETA_SALIDA: Record<SalidaPad, string> = {
  A: 'A', B: 'B', X: 'X', Y: 'Y', L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2', L3: 'L3', R3: 'R3',
  SELECT: 'SELECT', START: 'START', HOME: 'HOME',
  DPAD_UP: 'DPAD ↑', DPAD_DOWN: 'DPAD ↓', DPAD_LEFT: 'DPAD ←', DPAD_RIGHT: 'DPAD →',
  TOUCHPAD: 'TOUCHPAD', CAPTURA: 'CAPTURE',
  LS_UP: 'LS ↑', LS_DOWN: 'LS ↓', LS_LEFT: 'LS ←', LS_RIGHT: 'LS →',
  RS_UP: 'RS ↑', RS_DOWN: 'RS ↓', RS_LEFT: 'RS ←', RS_RIGHT: 'RS →',
};

/** Nombre del boton segun el mando virtual (cruz/circulo en DualShock 4, B/A en Switch Pro...). */
export function nombreEnSalida(s: SalidaPad, tipo: TipoSalida): string {
  if (tipo === 'dualshock4') {
    const ds4: Partial<Record<SalidaPad, string>> = {
      A: '✕', B: '○', X: '□', Y: '△', SELECT: 'SHARE', START: 'OPTIONS', HOME: 'PS', L2: 'L2', R2: 'R2',
    };
    return ds4[s] ?? ETIQUETA_SALIDA[s];
  }
  if (tipo === 'switchpro') {
    // Por posicion: abajo B, derecha A, izquierda Y, arriba X.
    const sw: Partial<Record<SalidaPad, string>> = {
      A: 'B', B: 'A', X: 'Y', Y: 'X', L1: 'L', R1: 'R', L2: 'ZL', R2: 'ZR', SELECT: '−', START: '+', CAPTURA: '⬤',
    };
    return sw[s] ?? ETIQUETA_SALIDA[s];
  }
  return ETIQUETA_SALIDA[s];
}

/** Controles estandar con accion (todos menos los ejes de stick), como `Entrada::estandar`. */
export const ENTRADAS_ESTANDAR: readonly Control[] = [
  'A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'SELECT', 'START', 'HOME',
  'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT',
];

export const esControl = (e: string): e is Control => (ENTRADAS_ESTANDAR as readonly string[]).includes(e);

export const accionPad = (salida: SalidaPad): Extract<Accion, { tipo: 'pad' }> => ({ tipo: 'pad', salida, modo: 'normal', turbo_hz: TURBO_HZ_DEFECTO });

/** Accion efectiva de una entrada (sin capas). */
export function accionDe(m: MapeoMando, entrada: string): Accion {
  const guardada = m.acciones[entrada];
  if (guardada) return guardada;
  return esControl(entrada) ? accionPad(entrada as SalidaPad) : { tipo: 'ignorar' };
}

/** ¿Es la accion la de por defecto (para no guardarla)? */
export function esPorDefecto(entrada: string, a: Accion): boolean {
  if (!esControl(entrada)) return a.tipo === 'ignorar';
  return a.tipo === 'pad' && a.salida === entrada && a.modo === 'normal';
}

/** Acciones con `entrada` cambiada (la de por defecto no se guarda). */
export function conAccion(acciones: MapeoMando['acciones'], entrada: string, a: Accion): MapeoMando['acciones'] {
  const resto = Object.fromEntries(Object.entries(acciones).filter(([e]) => e !== entrada));
  return esPorDefecto(entrada, a) ? resto : { ...resto, [entrada]: a };
}

export const bit = (s: SalidaPad): number => 1 << SALIDAS.indexOf(s);
export const pulsadoPad = (p: EstadoPad | null | undefined, s: SalidaPad): boolean => !!p && (p.botones & bit(s)) !== 0;

/** Teclas que puede pulsar una accion (mismos nombres que TECLAS en mapeo/acciones.rs). */
export const TECLAS: readonly string[] = [
  'ESC', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'BACKSPACE', 'TAB', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I',
  'O', 'P', 'ENTER', 'LEFTCTRL', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'LEFTSHIFT', 'Z', 'X', 'C', 'V', 'B',
  'N', 'M', 'RIGHTSHIFT', 'LEFTALT', 'SPACE', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11',
  'F12', 'RIGHTCTRL', 'RIGHTALT', 'HOME', 'UP', 'PAGEUP', 'LEFT', 'RIGHT', 'END', 'DOWN', 'PAGEDOWN', 'INSERT',
  'DELETE', 'VOLUMEDOWN', 'VOLUMEUP', 'PAUSE', 'PRINT',
];

/** Limites (los mismos que mapeo/validar.rs). */
export const LIMITES = { macros: 32, pasos: 64, msPaso: 10_000, msToqueMin: 10, capas: 4, nombre: 64, presetBytes: 1024 * 1024 } as const;

/** Identificador de juego a partir del nombre: minusculas, numeros y guiones (como valida el nucleo). */
export function idDeNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'juego';
}

/** Nombres de los mandos virtuales. */
export const NOMBRE_SALIDA: Record<TipoSalida, string> = {
  ninguna: '—', xbox360: 'Xbox 360', dualshock4: 'DualShock 4', switchpro: 'Switch Pro', toques: 'Toques',
};

/** Paquete de Android valido (como `paquete_valido` en toques/perfiles.rs). */
export function paqueteValido(p: string): boolean {
  return p.length >= 3 && p.length <= 160 && /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(p);
}

/** Nombre visible de un perfil de toques. */
export const nombrePerfil = (p: { nombre: string | null; paquete: string; id: string }): string => p.nombre ?? p.id;
