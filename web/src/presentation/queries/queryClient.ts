import { AppError } from '@domain/shared/AppError';
import { QueryClient } from '@tanstack/react-query';

/** Errores que no se arreglan reintentando. */
const FINAL = new Set(['AUTH_REQUIRED', 'BANNED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMIT', 'LIMIT', 'INVALID_INPUT']);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Cache generosa: menos peticiones al servidor cuando hay muchos usuarios.
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failures, error) => !(AppError.is(error) && FINAL.has(error.code)) && failures < 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: { retry: false },
    },
  });
}
