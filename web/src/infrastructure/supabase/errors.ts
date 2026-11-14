import { AppError, type ErrorCode } from '@domain/shared/AppError';
import type { z } from 'zod';

const KNOWN: Record<string, ErrorCode> = {
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  BANNED: 'BANNED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT: 'RATE_LIMIT',
  LIMIT: 'LIMIT',
};

interface ErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

/** Traduce cualquier error de Supabase / red a un AppError con un mensaje para el usuario. */
export function toAppError(error: unknown): AppError {
  if (AppError.is(error)) return error;
  const e = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;
  const message = e.message ?? '';

  // Errores propios de la base de datos: 'CODIGO|mensaje'
  const sep = message.indexOf('|');
  if (e.code === 'P0001' && sep > 0) {
    const code = message.slice(0, sep);
    return new AppError(KNOWN[code] ?? 'INVALID_INPUT', message.slice(sep + 1), { cause: error });
  }
  if (e.code === '42501' || e.code === 'PGRST301' || e.status === 401) {
    return new AppError('AUTH_REQUIRED', 'Inicia sesión con GitHub para hacer esto.', { cause: error });
  }
  if (e.status === 429) {
    return new AppError('RATE_LIMIT', 'Demasiadas peticiones. Espera un momento.', { cause: error });
  }
  if (error instanceof TypeError || /fetch|network/i.test(message)) {
    return new AppError('NETWORK', 'No hay conexión con el servidor. Revisa tu internet.', { cause: error });
  }
  console.error('Error inesperado', error);
  return new AppError('UNKNOWN', 'Algo salió mal. Inténtalo de nuevo.', { cause: error });
}

/** Resultado de Supabase: lanza si hay error y devuelve los datos. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw toAppError(result.error);
  return result.data;
}

/** Valida datos con un esquema; si no cuadran, es un error del servidor, no del usuario. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error('Respuesta inesperada del servidor', result.error.issues);
    throw new AppError('UNKNOWN', 'El servidor devolvió datos inesperados.');
  }
  return result.data;
}
