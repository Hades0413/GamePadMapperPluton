import type { Backend } from './backend';
import { crearBackendSimulado } from './simulado';
import { crearBackendTauri } from './tauri';

export type { Backend } from './backend';

/** ¿Corre dentro de la app Tauri? (en `pnpm dev` en un navegador, no). */
export const enTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Dentro de Tauri, el backend real; en un navegador, el simulado. */
export function crearBackend(): Backend {
  return enTauri() ? crearBackendTauri() : crearBackendSimulado();
}
