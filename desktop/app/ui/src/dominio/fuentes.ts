import type { Control, EstadoCrudo, InfoMando } from './tipos';

/** Entrada cruda con la sintaxis de SDL GameControllerDB (igual que `Fuente` en Rust). */
export type Fuente =
  | { tipo: 'boton'; indice: number }
  | { tipo: 'eje'; indice: number; mitad: 'completa' | 'positiva' | 'negativa'; invertido: boolean }
  | { tipo: 'hat'; indice: number; mascara: number };

export const HAT_ARRIBA = 1;
export const HAT_DERECHA = 2;
export const HAT_ABAJO = 4;
export const HAT_IZQUIERDA = 8;

const PATRON = /^(?:b(\d+)|h(\d+)\.(\d+)|([+-]?)a(\d+)(~?))$/;

export function leerFuente(texto: string): Fuente | null {
  const m = PATRON.exec(texto);
  if (!m) return null;
  if (m[1] !== undefined) return { tipo: 'boton', indice: Number(m[1]) };
  if (m[2] !== undefined) {
    const mascara = Number(m[3]);
    if (mascara < 1 || mascara > 15) return null;
    return { tipo: 'hat', indice: Number(m[2]), mascara };
  }
  const mitad = m[4] === '+' ? 'positiva' : m[4] === '-' ? 'negativa' : 'completa';
  return { tipo: 'eje', indice: Number(m[5]), mitad, invertido: m[6] === '~' };
}

export function escribirFuente(f: Fuente): string {
  switch (f.tipo) {
    case 'boton':
      return `b${f.indice}`;
    case 'hat':
      return `h${f.indice}.${f.mascara}`;
    case 'eje': {
      const signo = f.mitad === 'positiva' ? '+' : f.mitad === 'negativa' ? '-' : '';
      return `${signo}a${f.indice}${f.invertido ? '~' : ''}`;
    }
  }
}

const FLECHA_HAT: Record<number, string> = { [HAT_ARRIBA]: '↑', [HAT_DERECHA]: '→', [HAT_ABAJO]: '↓', [HAT_IZQUIERDA]: '←' };

/** Texto corto para mostrar una fuente: «b0 · BTN_SOUTH», «+a2 · ABS_Z», «h0 ↑». */
export function describirFuente(texto: string, info: InfoMando | null): string {
  const f = leerFuente(texto);
  if (!f) return texto;
  if (f.tipo === 'hat') return `h${f.indice} ${FLECHA_HAT[f.mascara] ?? f.mascara}`;
  const lista = f.tipo === 'boton' ? info?.botones : info?.ejes;
  const nombre = lista?.find((d) => d.indice === f.indice)?.nombre;
  return nombre ? `${texto} · ${nombre}` : texto;
}

/** Cuanto esta activa una fuente: 0..1 (un eje completo devuelve su valor absoluto). */
export function actividad(texto: string, crudo: EstadoCrudo): number {
  const f = leerFuente(texto);
  if (!f) return 0;
  switch (f.tipo) {
    case 'boton':
      return crudo.botones[f.indice] ? 1 : 0;
    case 'hat':
      return ((crudo.hats[f.indice] ?? 0) & f.mascara) !== 0 ? 1 : 0;
    case 'eje': {
      const v = (crudo.ejes[f.indice] ?? 0) * (f.invertido ? -1 : 1);
      if (f.mitad === 'positiva') return Math.max(0, v);
      if (f.mitad === 'negativa') return Math.max(0, -v);
      return Math.abs(v);
    }
  }
}

/** Valor con signo (-1..1) de una fuente de eje de stick, ya invertida si lleva «~». */
export function valorEje(texto: string | undefined, crudo: EstadoCrudo): number {
  const f = texto ? leerFuente(texto) : null;
  if (f?.tipo !== 'eje') return 0;
  return (crudo.ejes[f.indice] ?? 0) * (f.invertido ? -1 : 1);
}

export const esEje =(c: Control): boolean => c === 'LS_X' || c === 'LS_Y' || c === 'RS_X' || c === 'RS_Y';
export const esGatillo = (c: Control): boolean => c === 'L2' || c === 'R2';

/** Fuentes que se pueden elegir para un control con las entradas de este mando. */
export function opcionesPara(control: Control, info: InfoMando): string[] {
  const ejes = info.ejes.map((e) => e.indice);
  if (esEje(control)) return ejes.flatMap((i) => [`a${i}`, `a${i}~`]);
  const botones = info.botones.map((b) => `b${b.indice}`);
  const hats = Array.from({ length: info.hats }, (_, h) =>
    [HAT_ARRIBA, HAT_DERECHA, HAT_ABAJO, HAT_IZQUIERDA].map((m) => `h${h}.${m}`)).flat();
  const medios = ejes.flatMap((i) => [`+a${i}`, `-a${i}`]);
  const completos = esGatillo(control) ? ejes.flatMap((i) => [`a${i}`, `a${i}~`]) : [];
  return [...botones, ...hats, ...completos, ...medios];
}
