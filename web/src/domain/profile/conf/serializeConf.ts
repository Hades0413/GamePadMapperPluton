import type { Binding, ProfileConfig } from './ProfileConfig';

/**
 * Convierte un perfil interpretado de nuevo en texto .conf (lo contrario de validateConf).
 * Orden: package, name, screen, el resto de ajustes (en el orden en que estan en config.settings)
 * y despues los botones. Pensado para que validateConf lo acepte y el ciclo
 * interpretar -> serializar -> interpretar no pierda nada.
 */

/** Numero sin ruido de coma flotante (maximo 2 decimales, sin exponente). */
export function formatNum(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isFinite(rounded)) return '0';
  return rounded.toFixed(2).replace(/\.?0+$/, '') || '0';
}

/** Parte de la linea de un boton que va despues del "=". */
export function bindingValue(b: Binding): string {
  const n = formatNum;
  switch (b.type) {
    case 'tap':
    case 'quick':
    case 'toggle':
      return `${b.type} ${n(b.at.x)} ${n(b.at.y)}`;
    case 'burst':
      return `burst ${n(b.at.x)} ${n(b.at.y)} ${n(b.count)} ${n(b.gapMs)}`;
    case 'turbo':
      return `turbo ${n(b.at.x)} ${n(b.at.y)} ${n(b.rate)}`;
    case 'swipe':
      return `swipe ${n(b.at.x)} ${n(b.at.y)} ${n(b.to.x)} ${n(b.to.y)} ${n(b.durationMs)}`;
    case 'macro':
      return `macro ${b.steps.map((s) => `${n(s.at.x)} ${n(s.at.y)} ${n(s.delayMs)} ${n(s.holdMs)}`).join('; ')}`;
    case 'stick':
      return `stick ${n(b.at.x)} ${n(b.at.y)} ${n(b.radius)}${b.dpad ? ' dpad' : ''}`;
    case 'look':
      return `look ${n(b.at.x)} ${n(b.at.y)} ${n(b.sensitivity)}`;
  }
}

const HEADER = new Set(['package', 'name', 'screen']);

export function serializeConf(config: ProfileConfig): string {
  const lines: string[] = [`package = ${config.packageName}`];
  const name = config.name ?? config.settings['name'];
  if (name) lines.push(`name = ${name}`);
  lines.push(`screen = ${config.screen.width}x${config.screen.height}`);
  for (const [key, value] of Object.entries(config.settings)) {
    if (!HEADER.has(key) && value !== '') lines.push(`${key} = ${value}`);
  }
  for (const b of config.bindings) lines.push(`${b.key} = ${bindingValue(b)}`);
  return `${lines.join('\n')}\n`;
}
