import type { Control } from './tipos';

/** Orden de «Asignar todo» (el mismo que `asistente::PASOS` en Rust). */
export const PASOS_ASISTENTE: readonly Control[] = [
  'A', 'B', 'X', 'Y', 'DPAD_UP', 'DPAD_RIGHT', 'DPAD_DOWN', 'DPAD_LEFT', 'L1', 'R1', 'L2', 'R2',
  'L3', 'R3', 'SELECT', 'START', 'HOME', 'LS_X', 'LS_Y', 'RS_X', 'RS_Y',
];

/** Grupos para la lista de selectores. */
export const GRUPOS: readonly { titulo: string; controles: readonly Control[] }[] = [
  { titulo: 'Botones', controles: ['A', 'B', 'X', 'Y', 'SELECT', 'START', 'HOME'] },
  { titulo: 'Gatillos y bumpers', controles: ['L1', 'R1', 'L2', 'R2'] },
  { titulo: 'Cruceta', controles: ['DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT'] },
  { titulo: 'Sticks', controles: ['LS_X', 'LS_Y', 'L3', 'RS_X', 'RS_Y', 'R3'] },
];

/** Etiqueta corta en el diagrama y en los selectores. */
export const ETIQUETA: Record<Control, string> = {
  A: 'A', B: 'B', X: 'X', Y: 'Y', L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2', L3: 'L3', R3: 'R3',
  SELECT: 'SELECT', START: 'START', HOME: 'HOME',
  DPAD_UP: 'DPAD ↑', DPAD_DOWN: 'DPAD ↓', DPAD_LEFT: 'DPAD ←', DPAD_RIGHT: 'DPAD →',
  LS_X: 'LS X', LS_Y: 'LS Y', RS_X: 'RS X', RS_Y: 'RS Y',
};

/** Instruccion del asistente (en espanol: es la clave de traduccion). */
export const INSTRUCCION: Record<Control, string> = {
  A: 'Pulsa el botón inferior (A)',
  B: 'Pulsa el botón derecho (B)',
  X: 'Pulsa el botón izquierdo (X)',
  Y: 'Pulsa el botón superior (Y)',
  DPAD_UP: 'Pulsa la cruceta hacia arriba',
  DPAD_RIGHT: 'Pulsa la cruceta a la derecha',
  DPAD_DOWN: 'Pulsa la cruceta hacia abajo',
  DPAD_LEFT: 'Pulsa la cruceta a la izquierda',
  L1: 'Pulsa el bumper izquierdo (L1)',
  R1: 'Pulsa el bumper derecho (R1)',
  L2: 'Aprieta el gatillo izquierdo (L2) a fondo',
  R2: 'Aprieta el gatillo derecho (R2) a fondo',
  L3: 'Hunde el stick izquierdo (L3)',
  R3: 'Hunde el stick derecho (R3)',
  SELECT: 'Pulsa SELECT (Back / View)',
  START: 'Pulsa START (Menu)',
  HOME: 'Pulsa el botón central (HOME)',
  LS_X: 'Mueve el stick izquierdo a la derecha',
  LS_Y: 'Mueve el stick izquierdo hacia abajo',
  RS_X: 'Mueve el stick derecho a la derecha',
  RS_Y: 'Mueve el stick derecho hacia abajo',
};
