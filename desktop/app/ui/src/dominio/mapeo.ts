import type { Control, MapeoMando } from './tipos';

/** Asignaciones con `control` cambiado (o quitado con null), sin modificar las originales. */
export function conAsignacion(
  asignaciones: MapeoMando['asignaciones'],
  control: Control,
  fuente: string | null,
): MapeoMando['asignaciones'] {
  const resto = Object.fromEntries(Object.entries(asignaciones).filter(([c]) => c !== control));
  return fuente ? { ...resto, [control]: fuente } : resto;
}
