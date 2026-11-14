import type { DescEntrada, EstadoCrudo, InfoMando, MapeoMando } from '../../dominio/tipos';

/** Mandos de demostracion para desarrollar la interfaz en el navegador sin mando ni Tauri. */

const desc = (lista: readonly (readonly [number, string])[]): DescEntrada[] =>
  lista.map(([codigo, nombre], indice) => ({ indice, codigo, nombre }));

export const MANDO_DEMO: InfoMando = {
  id: 1,
  nombre: 'Mando de demostración (simulado)',
  guid: '03000000091200007067000001000000',
  vendedor: 0x1209,
  producto: 0x6770,
  version: 1,
  conexion: 'usb',
  plataforma: 'simulado',
  ruta: '/dev/input/event21',
  botones: desc([
    [0x130, 'BTN_SOUTH'], [0x131, 'BTN_EAST'], [0x133, 'BTN_NORTH'], [0x134, 'BTN_WEST'], [0x136, 'BTN_TL'],
    [0x137, 'BTN_TR'], [0x13a, 'BTN_SELECT'], [0x13b, 'BTN_START'], [0x13c, 'BTN_MODE'], [0x13d, 'BTN_THUMBL'],
    [0x13e, 'BTN_THUMBR'],
  ]),
  ejes: desc([[0, 'ABS_X'], [1, 'ABS_Y'], [2, 'ABS_Z'], [3, 'ABS_RX'], [4, 'ABS_RY'], [5, 'ABS_RZ']]),
  hats: 1,
  vibracion: true,
};

export const MANDO_GENERICO: InfoMando = {
  id: 2,
  nombre: 'USB Gamepad genérico (simulado)',
  guid: '030000000f0d00000100000010010000',
  vendedor: 0x0d0f,
  producto: 0x0001,
  version: 0x0110,
  conexion: 'bluetooth',
  plataforma: 'simulado',
  ruta: '/dev/input/event22',
  botones: desc([
    [0x120, 'BTN_TRIGGER'], [0x121, 'BTN_THUMB'], [0x122, 'BTN_THUMB2'], [0x123, 'BTN_TOP'], [0x124, 'BTN_TOP2'],
    [0x125, 'BTN_PINKIE'], [0x126, 'BTN_BASE'], [0x127, 'BTN_BASE2'], [0x128, 'BTN_BASE3'], [0x129, 'BTN_BASE4'],
    [0x12a, 'BTN_BASE5'], [0x12b, 'BTN_BASE6'],
  ]),
  ejes: desc([[0, 'ABS_X'], [1, 'ABS_Y'], [2, 'ABS_Z'], [5, 'ABS_RZ']]),
  hats: 1,
  vibracion: false,
};

export const MANDOS_SIMULADOS: readonly InfoMando[] = [MANDO_DEMO, MANDO_GENERICO];

const AJUSTE = { zona_muerta: 0.1, curva: 1, invertir_x: false, invertir_y: false };

/** Mapeo «automatico» de cada mando simulado (lo que daria la base de datos o la heuristica). */
export function mapeoAutomatico(info: InfoMando): MapeoMando {
  const asignaciones: MapeoMando['asignaciones'] = info.id === MANDO_DEMO.id
    ? {
        A: 'b0', B: 'b1', X: 'b2', Y: 'b3', L1: 'b4', R1: 'b5', SELECT: 'b6', START: 'b7', HOME: 'b8', L3: 'b9',
        R3: 'b10', L2: 'a2', R2: 'a5', LS_X: 'a0', LS_Y: 'a1', RS_X: 'a3', RS_Y: 'a4',
        DPAD_UP: 'h0.1', DPAD_DOWN: 'h0.4', DPAD_LEFT: 'h0.8', DPAD_RIGHT: 'h0.2',
      }
    : {
        A: 'b2', B: 'b1', X: 'b3', Y: 'b0', L1: 'b4', R1: 'b5', L2: 'b6', R2: 'b7', SELECT: 'b8', START: 'b9',
        L3: 'b10', R3: 'b11', LS_X: 'a0', LS_Y: 'a1', RS_X: 'a2', RS_Y: 'a3',
        DPAD_UP: 'h0.1', DPAD_DOWN: 'h0.4', DPAD_LEFT: 'h0.8', DPAD_RIGHT: 'h0.2',
      };
  return {
    version: 1, guid: info.guid, nombre: info.nombre, asignaciones,
    stick_izquierdo: { ...AJUSTE }, stick_derecho: { ...AJUSTE },
  };
}

/** Estado en reposo: los gatillos analogicos del mando de demostracion reposan en -1. */
export function reposo(info: InfoMando): EstadoCrudo {
  return {
    botones: info.botones.map(() => false),
    ejes: info.ejes.map((e) => (info.id === MANDO_DEMO.id && (e.indice === 2 || e.indice === 5) ? -1 : 0)),
    hats: Array.from({ length: info.hats }, () => 0),
  };
}

/** Movimiento de demostracion en el instante `t` (ms): sticks en circulos, botones por turnos... */
export function estadoAnimado(info: InfoMando, t: number): EstadoCrudo {
  const e = reposo(info);
  const s = t / 1000;
  const ciclo = Math.floor(s / 0.6);
  e.botones[ciclo % e.botones.length] = s % 0.6 < 0.3;
  e.ejes[0] = Math.cos(s * 1.3) * 0.85;
  e.ejes[1] = Math.sin(s * 1.3) * 0.85;
  if (info.id === MANDO_DEMO.id) {
    e.ejes[3] = Math.sin(s * 0.9) * 0.9;
    e.ejes[4] = Math.sin(s * 1.8) * 0.5;
    e.ejes[2] = -1 + Math.max(0, Math.sin(s * 2)) * 2;
    e.ejes[5] = -1 + Math.max(0, Math.sin(s * 1.1 + 2)) * 2;
  } else {
    e.ejes[2] = Math.sin(s * 0.9) * 0.9;
    e.ejes[3] = Math.cos(s * 1.4) * 0.6;
  }
  const direcciones = [0, 1, 3, 2, 6, 4, 12, 8, 9];
  e.hats[0] = direcciones[Math.floor(s / 0.8) % direcciones.length] ?? 0;
  return e;
}
