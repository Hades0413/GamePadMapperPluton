import { describe, expect, it } from 'vitest';
import { fitScale, fitX, fitY, sameRatio } from './fit';

// Mismos casos y resultados que tests/run.sh (app y gpmapper): las tres implementaciones coinciden.
const S = (width: number, height: number) => ({ width, height });
const cases: [number, number, number, number, number, number, number, number, number][] = [
  [2400, 1080, 2400, 1080, 1932, 960, 1932, 960, 1],
  [2400, 1080, 1200, 540, 1932, 960, 966, 480, 0.5],
  [2400, 1080, 2560, 1080, 1932, 960, 2092, 960, 1],
  [2400, 1080, 2560, 1080, 344, 828, 344, 828, 1],
  [2400, 1080, 2560, 1080, 1200, 300, 1280, 300, 1],
  [2400, 1080, 1920, 1080, 1932, 960, 1452, 960, 1],
  [2400, 1080, 1920, 1080, 344, 828, 344, 828, 1],
  [2400, 1080, 1920, 1080, 1200, 540, 960, 540, 1],
];

describe('fit (adaptar a otra pantalla)', () => {
  it.each(cases)('%i×%i → %i×%i: (%i,%i)', (sw, sh, w, h, x, y, ex, ey, ek) => {
    expect(fitX(x, S(sw, sh), S(w, h))).toBeCloseTo(ex, 1);
    expect(fitY(y, S(sw, sh), S(w, h))).toBeCloseTo(ey, 1);
    expect(fitScale(S(sw, sh), S(w, h))).toBeCloseTo(ek, 4);
  });

  it('reconoce la misma proporción aunque cambie la resolución u orientación', () => {
    expect(sameRatio(S(2400, 1080), S(1200, 540))).toBe(true);
    expect(sameRatio(S(2400, 1080), S(1080, 2400))).toBe(true);
    expect(sameRatio(S(2400, 1080), S(1920, 1080))).toBe(false);
  });
});
