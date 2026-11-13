/** Borrador guardado en sessionStorage (sobrevive al ir y volver de GitHub). */
export function loadDraft<T extends object>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    // Solo campos conocidos y de tipo texto.
    const out: Record<string, unknown> = { ...(fallback as Record<string, unknown>) };
    for (const k of Object.keys(fallback)) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v === 'string') out[k] = v;
    }
    return out as T;
  } catch {
    return fallback;
  }
}

export function saveDraft(key: string, value: object | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento disponible: no pasa nada
  }
}
