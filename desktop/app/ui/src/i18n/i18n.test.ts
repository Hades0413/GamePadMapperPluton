import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GRUPOS, INSTRUCCION } from '../dominio/controles';
import { ERROR } from '../dominio/errores';
import { EN } from './en';
import { detectarIdioma, traducir } from './traducir';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.tsx?$/.test(n) && !n.endsWith('.test.ts') ? [ruta] : [];
  });
}

/** Textos que pasan por t('...') en el codigo. */
function textosDelCodigo(): string[] {
  const textos = new Set<string>();
  for (const f of archivos(SRC)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) textos.add((m[1] ?? '').replace(/\\'/g, "'"));
  }
  return [...textos];
}

describe('i18n', () => {
  it('todos los textos tienen traduccion al ingles', () => {
    const faltan = [...textosDelCodigo(), ...Object.values(INSTRUCCION), ...Object.values(ERROR), ...GRUPOS.map((g) => g.titulo)].filter((es) => !(es in EN));
    expect(faltan).toEqual([]);
  });

  it('no sobran traducciones', () => {
    const usados = new Set([...textosDelCodigo(), ...Object.values(INSTRUCCION), ...Object.values(ERROR), ...GRUPOS.map((g) => g.titulo)]);
    expect(Object.keys(EN).filter((k) => !usados.has(k))).toEqual([]);
  });

  it('elige idioma e interpola', () => {
    expect(detectarIdioma(null, 'es-ES')).toBe('es');
    expect(detectarIdioma(null, 'fr')).toBe('en');
    expect(detectarIdioma('es', 'en-US')).toBe('es');
    expect(traducir('en', 'Paso {n} de {total}', { n: 2, total: 21 })).toBe('Step 2 of 21');
    expect(traducir('es', 'Paso {n} de {total}', { n: 2, total: 21 })).toBe('Paso 2 de 21');
  });
});
