import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  accionDe, accionPad, bit, completarMapeo, conAccion, EJE_DEFECTO, idDeNombre, pulsadoPad, respuestaEje, respuestaGatillo,
  respuestaStick, STICK_DEFECTO, TECLAS,
} from './configuracion';
import { SALIDAS } from './tipos';

const RUST = fileURLToPath(new URL('../../../nucleo/src/mapeo/acciones.rs', import.meta.url));

describe('configuracion avanzada', () => {
  it('las teclas y las salidas son las mismas que en Rust', () => {
    const fuente = readFileSync(RUST, 'utf8');
    const teclas = [...fuente.matchAll(/^\s+\("([A-Z0-9]+)", \d+, 0x[0-9A-F]+\),$/gm)].map((m) => m[1]);
    expect(teclas).toEqual(TECLAS);
    const todas = fuente.slice(fuente.indexOf('pub const TODAS'), fuente.indexOf('];', fuente.indexOf('pub const TODAS')));
    const salidas = [...todas.matchAll(/SalidaPad::(\w+)/g)].map((m) => (m[1] ?? '').replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase());
    expect(salidas).toEqual([...SALIDAS]);
  });

  it('responde como AjusteEje en Rust', () => {
    const eje = { zona_muerta: 0.2, anti_zona_muerta: 0.3, sensibilidad: 1, saturacion: 0.8 };
    expect(respuestaEje(0.1, eje)).toBe(0);
    expect(respuestaEje(-0.5, eje)).toBeCloseTo(-0.65);
    expect(respuestaEje(0.9, eje)).toBe(1);
    expect(respuestaEje(0.5, EJE_DEFECTO)).toBeCloseTo(0.5);
    const [x, y] = respuestaStick(0.5, 0.5, { ...STICK_DEFECTO, zona_muerta: 0, eje_x: eje });
    expect(x).toBeCloseTo(0.65);
    expect(y).toBeCloseTo(0.5);
    expect(respuestaGatillo(0.35, { zona_muerta: 0.1, anti_zona_muerta: 0, maximo: 0.6 })).toBeCloseTo(0.5);
  });

  it('acciones por defecto y cambios', () => {
    const m = completarMapeo({ guid: 'g', nombre: 'n' });
    expect(accionDe(m, 'A')).toEqual(accionPad('A'));
    expect(accionDe(m, 'b12')).toEqual({ tipo: 'ignorar' });
    const turbo = { ...accionPad('A'), modo: 'turbo' as const };
    const conTurbo = conAccion(m.acciones, 'A', turbo);
    expect(conTurbo).toEqual({ A: turbo });
    // Volver a la de por defecto la quita.
    expect(conAccion(conTurbo, 'A', accionPad('A'))).toEqual({});
    expect(conAccion({}, 'b3', { tipo: 'ignorar' })).toEqual({});
  });

  it('bits del mando virtual e identificadores de juego', () => {
    expect(bit('A')).toBe(1);
    expect(bit('RS_RIGHT')).toBe(1 << 26);
    expect(pulsadoPad({ botones: bit('X') | bit('HOME'), ls: [0, 0], rs: [0, 0], l2: 0, r2: 0 }, 'HOME')).toBe(true);
    expect(idDeNombre('Hollow Knight: Silksong')).toBe('hollow-knight-silksong');
    expect(idDeNombre('Pokémon Ñ')).toBe('pokemon-n');
    expect(idDeNombre('***')).toBe('juego');
    expect(idDeNombre('a'.repeat(50))).toHaveLength(40);
  });
});
