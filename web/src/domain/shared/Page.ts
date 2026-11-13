/** Pagina de resultados. hasMore indica si hay mas despues de esta. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
}

export interface PageRequest {
  /** Pagina empezando en 0. */
  readonly page: number;
  readonly size: number;
}

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 50;

export function normalizePage(request: Partial<PageRequest> = {}): PageRequest {
  const page = Number.isInteger(request.page) && (request.page ?? 0) >= 0 ? (request.page ?? 0) : 0;
  const size = Math.min(Math.max(Math.trunc(request.size ?? DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  return { page, size };
}
