import { accionDe, bit, ENTRADAS_ESTANDAR, respuestaGatillo, respuestaStick } from '../../dominio/configuracion';
import { leerFuente } from '../../dominio/fuentes';
import { CONTROLES, type EstadoCrudo, type EstadoEstandar, type EstadoPad, type InfoMando, type MapeoMando, type SalidaPad } from '../../dominio/tipos';

/**
 * Version reducida de `mapeo::ajustes::aplicar` y del motor (Rust) para el backend simulado. En la
 * app real todo esto lo calcula siempre el nucleo.
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

export function aplicar(m: MapeoMando, e: EstadoCrudo): EstadoEstandar {
  const a = m.asignaciones;
  const s: EstadoEstandar = {
    botones: {},
    ls: respuestaStick(valor(a.LS_X, e), valor(a.LS_Y, e), m.stick_izquierdo),
    rs: respuestaStick(valor(a.RS_X, e), valor(a.RS_Y, e), m.stick_derecho),
    l2: respuestaGatillo(gatillo(a.L2, e), m.gatillo_izquierdo),
    r2: respuestaGatillo(gatillo(a.R2, e), m.gatillo_derecho),
  };
  for (const c of CONTROLES) {
    if (c.startsWith('LS_') || c.startsWith('RS_')) continue;
    s.botones[c] = (c === 'L2' ? s.l2 : c === 'R2' ? s.r2 : valor(a[c], e)) > 0.5;
  }
  return s;
}

/** Entradas crudas que no usa el mapeo estandar (como `motor::entradas_extra`). */
export function entradasExtra(info: InfoMando, m: MapeoMando): string[] {
  const usadas = Object.values(m.asignaciones).map((f) => leerFuente(f ?? '')).filter((f) => f !== null);
  const usada = (texto: string) => {
    const f = leerFuente(texto);
    return usadas.some((u) => {
      if (!f || u.tipo !== f.tipo || u.indice !== f.indice) return false;
      if (u.tipo === 'hat' && f.tipo === 'hat') return (u.mascara & f.mascara) !== 0;
      if (u.tipo === 'eje' && f.tipo === 'eje') return u.mitad === 'completa' || u.mitad === f.mitad;
      return true;
    });
  };
  const extra: string[] = [];
  for (const b of info.botones) if (!usada(`b${b.indice}`)) extra.push(`b${b.indice}`);
  for (const e of info.ejes) for (const s of ['+', '-']) if (!usada(`${s}a${e.indice}`)) extra.push(`${s}a${e.indice}`);
  for (let h = 0; h < info.hats; h++) for (const k of [1, 2, 4, 8]) if (!usada(`h${h}.${k}`)) extra.push(`h${h}.${k}`);
  return extra;
}

function aplicarSalida(p: EstadoPad, s: SalidaPad, v: number) {
  switch (s) {
    case 'L2': p.l2 = Math.max(p.l2, v); break;
    case 'R2': p.r2 = Math.max(p.r2, v); break;
    case 'LS_UP': p.ls[1] = Math.min(p.ls[1], -v); break;
    case 'LS_DOWN': p.ls[1] = Math.max(p.ls[1], v); break;
    case 'LS_LEFT': p.ls[0] = Math.min(p.ls[0], -v); break;
    case 'LS_RIGHT': p.ls[0] = Math.max(p.ls[0], v); break;
    case 'RS_UP': p.rs[1] = Math.min(p.rs[1], -v); break;
    case 'RS_DOWN': p.rs[1] = Math.max(p.rs[1], v); break;
    case 'RS_LEFT': p.rs[0] = Math.min(p.rs[0], -v); break;
    case 'RS_RIGHT': p.rs[0] = Math.max(p.rs[0], v); break;
    default: if (v > 0.5) p.botones |= bit(s);
  }
}

/** Mando virtual simulado: acciones normales y turbo (sin macros ni capas). */
export function pad(m: MapeoMando, est: EstadoEstandar, crudo: EstadoCrudo, t: number): EstadoPad {
  const p: EstadoPad = { botones: 0, ls: [...est.ls], rs: [...est.rs], l2: 0, r2: 0 };
  if (m.direccion.intercambiar_sticks) [p.ls, p.rs] = [p.rs, p.ls];
  const entradas = [...ENTRADAS_ESTANDAR, ...Object.keys(m.acciones).filter((e) => !(ENTRADAS_ESTANDAR as readonly string[]).includes(e))];
  for (const e of entradas) {
    const accion = accionDe(m, e);
    if (accion.tipo !== 'pad') continue;
    const v = e === 'L2' ? est.l2 : e === 'R2' ? est.r2 : (ENTRADAS_ESTANDAR as readonly string[]).includes(e)
      ? Number(est.botones[e as keyof EstadoEstandar['botones']] ?? false)
      : Math.min(1, Math.max(0, valor(e, crudo)));
    if (accion.modo === 'turbo') {
      if (v > 0.5 && Math.floor(t / (500 / accion.turbo_hz)) % 2 === 0) aplicarSalida(p, accion.salida, 1);
    } else {
      aplicarSalida(p, accion.salida, v);
    }
  }
  return p;
}
