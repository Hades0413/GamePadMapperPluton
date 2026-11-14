import type { Screen } from '@domain/profile/conf/fit';

/**
 * Pantalla del visitante en pixeles fisicos, solo en moviles y tabletas (en un PC no sirve para
 * saber como quedara el perfil en el telefono). null si no se puede saber.
 */
export function visitorScreen(): Screen | null {
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return null;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(window.screen.width * dpr), height = Math.round(window.screen.height * dpr);
  return width >= 320 && height >= 320 ? { width, height } : null;
}

/** Proporcion lado largo / corto (2,22 para 20:9). */
export function ratioOf(screen: Screen): number {
  return Math.max(screen.width, screen.height) / Math.min(screen.width, screen.height);
}

/** "20:9", "16:9"... (aproximado, para mostrar). */
export function ratioLabel(screen: Screen): string {
  const r = ratioOf(screen);
  const known: [number, string][] = [[16 / 9, '16:9'], [18 / 9, '18:9'], [19.5 / 9, '19.5:9'], [20 / 9, '20:9'], [21 / 9, '21:9'], [4 / 3, '4:3'], [16 / 10, '16:10']];
  const best = known.reduce((a, b) => (Math.abs(b[0] - r) < Math.abs(a[0] - r) ? b : a));
  return Math.abs(best[0] - r) / r < 0.015 ? best[1] : `${r.toFixed(2)}:1`;
}

interface UAData {
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
}

/** Modelo del telefono si el navegador lo dice (Chrome en Android); '' si no. */
export async function guessDeviceModel(): Promise<string> {
  try {
    const ua = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
    const model = (await ua?.getHighEntropyValues?.(['model']))?.model ?? '';
    return /^[A-Za-z0-9][A-Za-z0-9 ._()+/-]{1,59}$/.test(model.trim()) ? model.trim() : '';
  } catch {
    return '';
  }
}
