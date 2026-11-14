import { leerFuente } from '../../dominio/fuentes';
import { CONTROLES, type AjusteStick, type EstadoCrudo, type EstadoEstandar, type MapeoMando } from '../../dominio/tipos';

/**
 * Version reducida de `mapeo::ajustes::aplicar` (Rust) para el backend simulado. En la app real
 * el estado estandar lo calcula siempre el nucleo.
 */

function valor(texto: string | undefined, e: EstadoCrudo): number {
  const f = texto ? leerFuente(texto) : null;
  if (!f) return 0;
  if (f.tipo === 'boton') return e.botones[f.indice] ? 1 : 0;
  if (f.tipo === 'hat') return ((e.hats[f.indice] ?? 0) & f.mascara) !== 0 ? 1 : 0;
  const v = (e.ejes[f.indice] ?? 0) * (f.invertido ? -1 : 1);
  return f.mitad === 'positiva' ? Math.max(0, v) : f.mitad === 'negativa' ? Math.max(0, -v) : v;
}

function gatillo(texto: string | undefined, e: EstadoCrudo): number {
  const f = texto ? leerFuente(texto) : null;
  const v = valor(texto, e);
  return Math.min(1, Math.max(0, f?.tipo === 'eje' && f.mitad === 'completa' ? (v + 1) / 2 : v));
}

export function ajustarStick(x: number, y: number, a: AjusteStick): [number, number] {
  const m = Math.hypot(x, y);
  let r: [number, number] = [0, 0];
  if (m > a.zona_muerta && m > 0) {
    const n = Math.min(1, Math.max(0, (Math.min(m, 1) - a.zona_muerta) / (1 - a.zona_muerta))) ** a.curva;
    r = [Math.max(-1, Math.min(1, (x * n) / m)), Math.max(-1, Math.min(1, (y * n) / m))];
  }
  return [a.invertir_x ? -r[0] : r[0], a.invertir_y ? -r[1] : r[1]];
}

export function aplicar(m: MapeoMando, e: EstadoCrudo): EstadoEstandar {
  const a = m.asignaciones;
  const s: EstadoEstandar = {
    botones: {},
    ls: ajustarStick(valor(a.LS_X, e), valor(a.LS_Y, e), m.stick_izquierdo),
    rs: ajustarStick(valor(a.RS_X, e), valor(a.RS_Y, e), m.stick_derecho),
    l2: gatillo(a.L2, e),
    r2: gatillo(a.R2, e),
  };
  for (const c of CONTROLES) {
    if (c.startsWith('LS_') || c.startsWith('RS_')) continue;
    s.botones[c] = (c === 'L2' || c === 'R2' ? gatillo(a[c], e) : valor(a[c], e)) > 0.5;
  }
  return s;
}
