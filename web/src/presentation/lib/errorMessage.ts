import { AppError } from '@domain/shared/AppError';
import { getLang } from '../i18n/lang';
import { translate } from '../i18n/translate';

/** Mensaje de error para el usuario (nunca detalles internos). Los mensajes del servidor/dominio van en espanol. */
export function errorMessage(error: unknown): string {
  if (AppError.is(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return translate(getLang(), 'Algo salió mal. Inténtalo de nuevo.');
}
