import { describe, expect, it } from 'vitest';
import { actividad, describirFuente, escribirFuente, leerFuente, opcionesPara, valorEje } from './fuentes';
import type { InfoMando } from './tipos';

const info: InfoMando = {
  id: 1, nombre: 'Prueba', guid: '0'.repeat(32), vendedor: 0, producto: 0, version: 0,
  conexion: 'usb', plataforma: 'evdev', ruta: '/dev/input/event5',
  botones: [{ indice: 0, codigo: 0x130, nombre: 'BTN_SOUTH' }, { indice: 1, codigo: 0x131, nombre: 'BTN_EAST' }],
  ejes: [{ indice: 0, codigo: 0, nombre: 'ABS_X' }, { indice: 1, codigo: 2, nombre: 'ABS_Z' }],
  hats: 1, vibracion: false,
};

describe('fuentes SDL', () => {
  it('ida y vuelta', () => {
    for (const s of ['b0', 'b12', 'a3', '+a2', '-a7', 'a1~', '-a1~', 'h0.1', 'h1.8']) {
      const f = leerFuente(s);
      expect(f).not.toBeNull();
      if (f) expect(escribirFuente(f)).toBe(s);
    }
  });

  it('rechaza lo que no es SDL', () => {
    for (const s of ['', 'b', 'x1', '+b1', 'h0', 'h0.0', 'h0.16', 'a1~~']) expect(leerFuente(s)).toBeNull();
  });

  it('describe con los nombres del mando', () => {
    expect(describirFuente('b0', info)).toBe('b0 · BTN_SOUTH');
    expect(describirFuente('+a1', info)).toBe('+a1 · ABS_Z');
    expect(describirFuente('h0.8', info)).toBe('h0 ←');
    expect(describirFuente('b9', info)).toBe('b9');
  });

  it('mide la actividad', () => {
    const crudo = { botones: [true, false], ejes: [-0.5, 0.75], hats: [1 | 2] };
    expect(actividad('b0', crudo)).toBe(1);
    expect(actividad('b1', crudo)).toBe(0);
    expect(actividad('h0.2', crudo)).toBe(1);
    expect(actividad('h0.4', crudo)).toBe(0);
    expect(actividad('-a0', crudo)).toBe(0.5);
    expect(actividad('+a0', crudo)).toBe(0);
    expect(actividad('a0~', crudo)).toBe(0.5);
  });

  it('da el valor con signo de un eje', () => {
    const crudo = { botones: [], ejes: [0.4], hats: [] };
    expect(valorEje('a0', crudo)).toBe(0.4);
    expect(valorEje('a0~', crudo)).toBe(-0.4);
    expect(valorEje('b0', crudo)).toBe(0);
    expect(valorEje(undefined, crudo)).toBe(0);
  });

  it('ofrece opciones segun el tipo de control', () => {
    expect(opcionesPara('LS_X', info)).toEqual(['a0', 'a0~', 'a1', 'a1~']);
    const boton = opcionesPara('A', info);
    expect(boton.slice(0, 2)).toEqual(['b0', 'b1']);
    expect(boton).toContain('h0.4');
    expect(boton).toContain('-a1');
    expect(boton).not.toContain('a1');
    expect(opcionesPara('L2', info)).toContain('a1');
  });
});
