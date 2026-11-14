import type { BindingType } from '@domain/profile/conf/ProfileConfig';
import type { ProfileTag } from '@domain/profile/GameProfile';
import type { ReportReason } from '@domain/report/ReportReason';

/** Mismos nombres que usa la app. */
export const BINDING_TYPE_LABEL: Record<BindingType, string> = {
  tap: 'Toque',
  quick: 'Toque rápido',
  burst: 'Ráfaga',
  turbo: 'Turbo',
  toggle: 'Interruptor',
  swipe: 'Deslizar',
  macro: 'Macro',
  stick: 'Joystick',
  look: 'Cámara',
};

const BUTTON_LABEL: Record<string, string> = {
  DPAD_UP: 'Cruceta ↑',
  DPAD_DOWN: 'Cruceta ↓',
  DPAD_LEFT: 'Cruceta ←',
  DPAD_RIGHT: 'Cruceta →',
  LS: 'Stick izq.',
  RS: 'Stick der.',
};

const MOUSE_LABEL: Record<string, string> = {
  MOUSE_LEFT: 'Clic izquierdo',
  MOUSE_RIGHT: 'Clic derecho',
  MOUSE_MIDDLE: 'Clic de la rueda',
  MOUSE_WHEEL_UP: 'Rueda ↑',
  MOUSE_WHEEL_DOWN: 'Rueda ↓',
};

export const TAG_LABEL: Record<ProfileTag, string> = {
  competitivo: 'Competitivo',
  casual: 'Casual',
  zurdo: 'Para zurdos',
  'una-mano': 'Una mano',
  'sin-gatillos': 'Sin gatillos',
  tablet: 'Tablet',
  giroscopio: 'Giroscopio',
  'teclado-raton': 'Teclado y ratón',
  xbox: 'Mando Xbox',
  playstation: 'Mando PlayStation',
};

export function buttonLabel(key: string): string {
  if (BUTTON_LABEL[key]) return BUTTON_LABEL[key];
  if (key.startsWith('AXIS_')) return `Eje ${key.slice(5)}`;
  if (key.startsWith('BTN_')) return `Botón ${key.slice(4)}`;
  if (key.startsWith('KB_')) return `Tecla ${key.slice(3)}`;
  if (key.startsWith('MOUSE_')) return MOUSE_LABEL[key] ?? `Ratón ${key.slice(6)}`;
  return key;
}

/** Texto corto para el boton en la vista previa (cabe dentro del circulo). */
export function shortLabel(key: string): string {
  const map: Record<string, string> = { DPAD_UP: '↑', DPAD_DOWN: '↓', DPAD_LEFT: '←', DPAD_RIGHT: '→', SELECT: 'SEL', START: 'STA' };
  if (map[key]) return map[key];
  if (key.startsWith('AXIS_')) return `E${key.slice(5)}`;
  if (key.startsWith('BTN_')) return `B${key.slice(4)}`;
  return key.slice(0, 4);
}

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: 'Spam o publicidad',
  broken: 'No funciona / está mal hecho',
  offensive: 'Contenido ofensivo',
  copyright: 'Copiado sin permiso',
  other: 'Otro motivo',
};
