import type { BindingType } from '@domain/profile/conf/ProfileConfig';
import type { ReportReason } from '@domain/report/ReportReason';
import { interpolate, type TFunction } from '../i18n/translate';

/**
 * Mismos nombres que usa la app. Van en espanol porque son la clave de traduccion:
 * al mostrarlos se pasan por t() (el panel de moderacion los usa tal cual, en espanol).
 */
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

const spanish: TFunction = interpolate;

export function buttonLabel(key: string, t: TFunction = spanish): string {
  const fixed = BUTTON_LABEL[key];
  if (fixed) return t(fixed);
  if (key.startsWith('AXIS_')) return t('Eje {n}', { n: key.slice(5) });
  if (key.startsWith('BTN_')) return t('Botón {n}', { n: key.slice(4) });
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

/** Motivos de reporte (en espanol: clave de traduccion, ver arriba). */
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  spam: 'Spam o publicidad',
  broken: 'No funciona / está mal hecho',
  offensive: 'Contenido ofensivo',
  copyright: 'Copiado sin permiso',
  other: 'Otro motivo',
};
