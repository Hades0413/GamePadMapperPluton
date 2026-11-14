import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SDL_ERROR_MESSAGE, SDL_KEY_LABEL } from '@domain/controller/sdlMapping';
import { BINDING_TYPE_LABEL, buttonLabel, REPORT_REASON_LABEL } from '../lib/labels';
import { compactNumber, formatDate, timeAgo } from '../lib/format';
import { EN } from './en';
import { detectLang, interpolate, translate } from './translate';

const SRC = join(__dirname, '..');

/** Todos los .ts/.tsx de presentation, salvo el panel de moderacion (no se traduce) y los tests. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'admin' ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.|AdminPage|[\\/]en\.ts$/.test(path) ? [path] : [];
  });
}

describe('diccionario en.ts', () => {
  it('no tiene valores vacios ni claves vacias', () => {
    for (const [es, en] of Object.entries(EN)) {
      expect(es.trim(), 'clave vacia').not.toBe('');
      expect(en.trim(), `traduccion vacia: ${es}`).not.toBe('');
    }
  });

  it('conserva los {marcadores} y las etiquetas de cada texto', () => {
    const marks = (s: string) => (s.match(/\{\w+\}|<\/?[bc]>/g) ?? []).sort().join(',');
    for (const [es, en] of Object.entries(EN)) expect(marks(en), es).toBe(marks(es));
  });

  it('traduce los ejemplos conocidos', () => {
    expect(translate('en', '{n} me gusta', { n: 3 })).toBe('3 likes');
    expect(translate('en', 'Subir mi perfil')).toBe('Upload my profile');
    expect(translate('en', 'Encaja con tu pantalla')).toBe('Fits your screen');
    expect(translate('en', 'Perfiles de la comunidad')).toBe('Community profiles');
    expect(translate('en', BINDING_TYPE_LABEL.stick)).toBe('Joystick');
    expect(translate('en', BINDING_TYPE_LABEL.look)).toBe('Camera');
    expect(buttonLabel('DPAD_UP', (es, vars) => translate('en', es, vars))).toBe('D-pad ↑');
  });

  it('tiene traduccion para todos los textos fijos que se muestran', () => {
    const missing: string[] = [];
    // Textos escritos como t('...') / tr('...') en el codigo.
    for (const file of sources(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\btr?\(\s*'((?:[^'\\]|\\.)*)'/g)) {
        const key = (m[1] ?? '').replace(/\\'/g, "'");
        if (!(key in EN)) missing.push(`${file.slice(SRC.length)}: ${key}`);
      }
    }
    // Textos que viven en constantes y se pasan por t() al mostrarlos.
    for (const es of [...Object.values(BINDING_TYPE_LABEL), ...Object.values(REPORT_REASON_LABEL),
      ...Object.values(SDL_ERROR_MESSAGE), ...Object.values(SDL_KEY_LABEL)]) {
      if (!(es in EN)) missing.push(es);
    }
    expect(missing).toEqual([]);
  });
});

describe('interpolacion y respaldo', () => {
  it('sustituye {variables} despues de buscar la traduccion', () => {
    expect(translate('en', '{n} perfiles', { n: 5 })).toBe('5 profiles');
    expect(translate('es', '{n} perfiles', { n: 5 })).toBe('5 perfiles');
    expect(translate('en', 'Perfiles de {name}', { name: 'Hades' })).toBe("Hades's profiles");
  });

  it('deja el marcador si falta la variable y no toca textos sin marcadores', () => {
    expect(interpolate('Hola {name}', {})).toBe('Hola {name}');
    expect(interpolate('Hola {name}')).toBe('Hola {name}');
    expect(interpolate('Sin variables', { n: 1 })).toBe('Sin variables');
  });

  it('si falta la clave en ingles cae al espanol (y tambien interpola)', () => {
    expect(translate('en', 'Texto sin traducir')).toBe('Texto sin traducir');
    expect(translate('en', 'Sin traducir {n}', { n: 2 })).toBe('Sin traducir 2');
    expect(translate('en', 'x {n}', { n: 1 }, { 'x {n}': 'y {n}' })).toBe('y 1');
  });
});

describe('idioma inicial', () => {
  it('manda lo guardado', () => {
    expect(detectLang('en', 'es-ES')).toBe('en');
    expect(detectLang('es', 'en-US')).toBe('es');
  });
  it('sin guardado, usa el idioma del navegador: es* -> es, el resto -> en', () => {
    expect(detectLang(null, 'es-MX')).toBe('es');
    expect(detectLang(null, 'ES')).toBe('es');
    expect(detectLang(null, 'en-GB')).toBe('en');
    expect(detectLang(null, 'fr')).toBe('en');
    expect(detectLang(null, undefined)).toBe('en');
    expect(detectLang('xx', 'es')).toBe('es');
  });
});

describe('formatos segun el idioma', () => {
  const now = Date.UTC(2026, 10, 13, 12);
  it('timeAgo', () => {
    expect(timeAgo(new Date(now), now, 'es')).toBe('ahora');
    expect(timeAgo(new Date(now), now, 'en')).toBe('now');
    expect(timeAgo(new Date(now - 3 * 86400_000), now, 'en')).toBe('3 days ago');
    expect(timeAgo(new Date(now - 3 * 86400_000), now, 'es')).toBe('hace 3 días');
  });
  it('fechas y numeros', () => {
    expect(formatDate(new Date(now), 'en')).toMatch(/Nov/);
    expect(formatDate(new Date(now), 'es')).toMatch(/nov/);
    expect(compactNumber(1500, 'en')).toBe('1.5K');
  });
});
