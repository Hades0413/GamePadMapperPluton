import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateConf } from './validateConf';

const presets = fileURLToPath(new URL('../../../../../presets', import.meta.url));

const conf = (lines: string[]) => ['package = com.x.y', 'screen = 1000x500', ...lines].join('\n');

describe('validateConf', () => {
  it.each(readdirSync(presets).filter((f) => f.endsWith('.conf')))('acepta el perfil oficial %s', (file) => {
    const result = validateConf(readFileSync(join(presets, file), 'utf8'));
    expect(result.ok, result.ok ? '' : result.error).toBe(true);
  });

  it('interpreta todos los tipos de boton', () => {
    const result = validateConf(conf([
      'A = macro 1 1 0 40; 5 5 100', 'LS = stick 100 100 50 dpad', 'Y = swipe 1 1 9 9 100',
      'L2+A = burst 3 3 5 80', 'AXIS_9+ = tap 4 4', 'RS = look 500 250 14', 'B = turbo 10 10 12',
      'X = toggle 2 2', 'R1 = quick 3 3',
    ]));
    if (!result.ok) throw new Error(result.error);
    const types = Object.fromEntries(result.config.bindings.map((b) => [b.key, b.type]));
    expect(types).toEqual({
      A: 'macro', LS: 'stick', Y: 'swipe', 'L2+A': 'burst', 'AXIS_9+': 'tap', RS: 'look', B: 'turbo', X: 'toggle', R1: 'quick',
    });
    const layer = result.config.bindings.find((b) => b.key === 'L2+A');
    expect(layer?.modifier).toBe('L2');
    expect(layer?.button).toBe('A');
  });

  it.each([
    [conf(['A = tap 2000 10']), 'fuera de la pantalla'],
    [conf(['A = fly 1 1']), 'desconocido'],
    [conf(['A = tap 1 1', 'A = tap 2 2']), 'repetido'],
    [conf(['deadzone = abc', 'A = tap 1 1']), 'entre 0 y 0.95'],
    [conf([]), 'ningún botón'],
    ['screen = 1000x500\nA = tap 1 1', 'package'],
    ['package = com.x.y\nA = tap 1 1', 'screen'],
    [conf(['A tap 1 1']), 'falta «='],
    [conf(['A = tap 1 1\u0007']), 'caracteres'],
    [conf(['A = tap dpad 1']), 'números'],
  ])('rechaza perfiles mal formados (%#)', (text, message) => {
    const result = validateConf(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it('marca como sensibles las apps del sistema y de root', async () => {
    const { isSensitivePackage } = await import('@domain/game/Game');
    for (const p of ['com.android.vending', 'com.google.android.permissioncontroller', 'android', 'com.miui.securitycenter',
      'com.topjohnwu.magisk', 'moe.shizuku.privileged.api', 'com.gamepadmapper.app']) expect(isSensitivePackage(p), p).toBe(true);
    for (const p of ['com.supercell.brawlstars', 'com.miHoYo.GenshinImpact', 'com.androidgames.x']) expect(isSensitivePackage(p), p).toBe(false);
  });

  it('comprueba que el perfil sea del juego indicado', () => {
    const result = validateConf(conf(['A = tap 1 1']), 'com.otro.juego');
    expect(result.ok).toBe(false);
  });

  it('normaliza saltos de linea de Windows', () => {
    const result = validateConf(conf(['A = tap 1 1']).replace(/\n/g, '\r\n'));
    expect(result.ok && result.normalized.includes('\r')).toBe(false);
  });
});
