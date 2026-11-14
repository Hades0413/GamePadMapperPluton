import { describe, expect, it } from 'vitest';
import { checkReferenceImage, REFERENCE_MAX_BYTES, sniffImage } from './referenceImage';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];

describe('imagen de referencia (solo en el navegador)', () => {
  it('reconoce JPG, PNG y WebP por sus primeros bytes', () => {
    expect(sniffImage(new Uint8Array(PNG))).toBe('image/png');
    expect(sniffImage(new Uint8Array(JPG))).toBe('image/jpeg');
    expect(sniffImage(new Uint8Array(WEBP))).toBe('image/webp');
  });

  it('rechaza lo que no es una de esas imagenes aunque diga serlo (SVG, HTML, GIF, vacio)', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/png' });
    expect(await checkReferenceImage(svg)).toEqual({ problem: 'type' });
    expect(await checkReferenceImage(new Blob(['<html>'], { type: 'image/jpeg' }))).toEqual({ problem: 'type' });
    expect(await checkReferenceImage(new Blob(['GIF89a......'], { type: 'image/gif' }))).toEqual({ problem: 'type' });
    expect(await checkReferenceImage(new Blob([]))).toEqual({ problem: 'type' });
  });

  it('acepta una imagen valida y rechaza las de mas de 10 MB', async () => {
    expect(await checkReferenceImage(new Blob([new Uint8Array(PNG)], { type: 'text/plain' }))).toEqual({ type: 'image/png' });
    const big = new Blob([new Uint8Array(JPG), new Uint8Array(REFERENCE_MAX_BYTES)]);
    expect(await checkReferenceImage(big)).toEqual({ problem: 'size' });
  });
});
