import { AppError } from '@domain/shared/AppError';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rechaza identificadores mal formados antes de llegar a la red. */
export function requireId(id: string): string {
  if (!UUID.test(id)) throw new AppError('NOT_FOUND', 'Ese perfil no existe.');
  return id.toLowerCase();
}

/** Solo rutas internas de la web: evita redirecciones abiertas a otros dominios. */
export function safeReturnPath(path: string | null | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
  return path.slice(0, 300);
}
