/** Codigos de error que entiende toda la aplicacion (independientes de Supabase). */
export type ErrorCode =
  | 'AUTH_REQUIRED'
  | 'BANNED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'LIMIT'
  | 'INVALID_INPUT'
  | 'NETWORK'
  | 'UNKNOWN';

/** Error con un mensaje apto para mostrar al usuario. */
export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
  }

  static is(error: unknown): error is AppError {
    return error instanceof AppError;
  }
}
