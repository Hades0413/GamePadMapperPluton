import { AppError } from '@domain/shared/AppError';

/** Mensaje de error para el usuario (nunca detalles internos). */
export function errorMessage(error: unknown): string {
  if (AppError.is(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Algo salió mal. Inténtalo de nuevo.';
}
