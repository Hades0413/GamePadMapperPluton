import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { addStep, blankConfig, moveHandle, newBinding, nextFreeKey, removeStep, retype } from './editConf';
import { serializeConf } from './serializeConf';
import { validateConf } from './validateConf';

const presets = fileURLToPath(new URL('../../../../../presets', import.meta.url));

function parsed(text: string) {
  const r = validateConf(text);
  if (!r.ok) throw new Error(r.error);
  return r.config;
}

const ALL = `
package = com.x.y
name = Todo
screen = 2400x1080
deadzone = 0.18
ls_axes = 0,1
rs_axes = 2,5
ls_deadzone = 0.15
rs_deadzone = 0.2
ls_curve = 1.5
rs_curve = 1
look_y = 1.25
look_invert = 1
aim_button = L2
aim_scale = 0.5
look_accel = 0.5
controller = xbox
rumble = 0.5
gyro = 1
gyro_button = L2
gyro_invert = 1
mouse = 2
players = 2
A = tap 1980 895
B = turbo 1700 900 12
X = toggle 1500 700
Y = swipe 1800 500 1800 200 150
Z = quick 100 100
R1 = burst 900 400 6 90
L2+A = tap 1000 300
AXIS_9+ = tap 372 398
BTN_13A = tap 550 85
KB_W = tap 300 700
MOUSE_LEFT = tap 1900 800
P2_A = tap 900 700
P2_LS = stick 300 800 120
L1 = macro 100 100 0 40; 200 150.5 100 60; 300 200
LS = stick 405 735 150 dpad
RS = look 1500 500 14
`;

describe('serializeConf', () => {
  it('cada ajuste y cada tipo de boton sobreviven al ciclo interpretar -> serializar -> interpretar', () => {
    const first = parsed(ALL);
    const text = serializeConf(first);
    const second = parsed(text);
    expect(second.bindings).toEqual(first.bindings);
    expect(second.settings).toEqual(first.settings);
    expect(second.screen).toEqual(first.screen);
    expect(second.packageName).toBe('com.x.y');
    expect(second.name).toBe('Todo');
    expect(first.bindings.map((b) => b.type)).toEqual(
      expect.arrayContaining(['tap', 'quick', 'burst', 'turbo', 'toggle', 'swipe', 'macro', 'stick', 'look']),
    );
    // Es estable: serializar de nuevo da el mismo texto.
    expect(serializeConf(second)).toBe(text);
  });

  it('mantiene capas, ejes como boton y teclas', () => {
    const bindings = parsed(serializeConf(parsed(ALL))).bindings;
    expect(bindings.map((b) => b.key)).toEqual(
      expect.arrayContaining(['L2+A', 'AXIS_9+', 'KB_W', 'MOUSE_LEFT', 'P2_A', 'P2_LS']),
    );
    expect(bindings.find((b) => b.key === 'L2+A')?.modifier).toBe('L2');
  });

  it('el texto serializado es valido y acaba en salto de linea', () => {
    const text = serializeConf(parsed(ALL));
    expect(text.endsWith('\n')).toBe(true);
    expect(validateConf(text).ok).toBe(true);
  });

  it.each(readdirSync(presets).filter((f) => f.endsWith('.conf')))('conserva el perfil oficial %s', (file) => {
    const first = parsed(readFileSync(join(presets, file), 'utf8'));
    const second = parsed(serializeConf(first));
    expect(second.bindings).toEqual(first.bindings);
    expect(second.settings).toEqual(first.settings);
  });

  it('no escribe ajustes vacios y redondea los decimales', () => {
    const base = parsed(ALL);
    const config = { ...base, settings: { ...base.settings, gyro_button: '' } };
    expect(serializeConf(config)).not.toMatch(/gyro_button/);
    const moved = { ...config, bindings: [{ ...newBinding('A', config.screen), at: { x: 10.123456, y: 20 } }] };
    expect(serializeConf(moved)).toContain('A = tap 10.12 20');
  });
});

describe('editConf', () => {
  const screen = { width: 2400, height: 1080 };

  it('un perfil en blanco con un boton nuevo es valido', () => {
    const blank = blankConfig('com.x.y', screen);
    expect(validateConf(serializeConf(blank)).ok).toBe(false);
    const config = { ...blank, bindings: [newBinding(nextFreeKey(blank.bindings), screen)] };
    expect(validateConf(serializeConf(config)).ok).toBe(true);
  });

  it('cambiar de tipo da siempre un perfil valido', () => {
    const types = ['tap', 'quick', 'burst', 'turbo', 'toggle', 'swipe', 'macro', 'stick', 'look'] as const;
    for (const type of types) {
      const b = retype(newBinding('A', screen), type, screen);
      const config = { ...blankConfig('com.x.y', screen), bindings: [b] };
      const r = validateConf(serializeConf(config));
      expect(r.ok, `${type}: ${r.ok ? '' : r.error}`).toBe(true);
    }
  });

  it('mueve el primer paso de una macro junto con el boton y limita los pasos', () => {
    const macro = retype(newBinding('A', screen), 'macro', screen);
    if (macro.type !== 'macro') throw new Error('no es macro');
    const moved = moveHandle(macro, { kind: 'at' }, { x: 5, y: 6 });
    expect(moved.type === 'macro' && moved.steps[0]?.at).toEqual({ x: 5, y: 6 });
    expect(moved.at).toEqual({ x: 5, y: 6 });
    const more = addStep(macro, screen, 3);
    expect(addStep(addStep(more, screen, 3), screen, 3).steps).toHaveLength(3);
    expect(removeStep(macro, 1).steps).toHaveLength(1);
    expect(removeStep(removeStep(macro, 1), 0).steps).toHaveLength(1);
  });

  it('el siguiente boton libre salta los ya usados', () => {
    const b = [newBinding('A', screen), newBinding('B', screen)];
    expect(nextFreeKey(b)).toBe('X');
  });
});
