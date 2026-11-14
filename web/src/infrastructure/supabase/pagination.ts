import type { Page, PageRequest } from '@domain/shared/Page';

/** Rango que se pide: uno de mas para saber si hay otra pagina sin contar filas (COUNT es caro). */
export function rangeOf({ page, size }: PageRequest): [number, number] {
  const from = page * size;
  return [from, from + size];
}

export function toPage<T>(rows: readonly T[], { size }: PageRequest): Page<T> {
  return { items: rows.slice(0, size), hasMore: rows.length > size };
}
