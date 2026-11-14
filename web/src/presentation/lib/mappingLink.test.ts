import { describe, expect, it } from 'vitest';
import { parseMappingFragment } from './mappingLink';

const SDL = '03000000c82d00000161000000000000,8BitDo SN30 Pro,a:b1,b:b0,x:b4,y:b3,back:b10,start:b11,platform:Linux,';

describe('parseMappingFragment', () => {
  it('lee la linea codificada con encodeURIComponent', () => {
    expect(parseMappingFragment(`#linea=${encodeURIComponent(SDL)}`)).toBe(SDL);
    expect(parseMappingFragment(`#otro=1&linea=${encodeURIComponent(SDL)}&x=2`)).toBe(SDL);
    expect(parseMappingFragment('#linea=8BitDo+SN30')).toBe('8BitDo SN30');
  });

  it('sin linea o vacia: null', () => {
    expect(parseMappingFragment('')).toBeNull();
    expect(parseMappingFragment('#conf=abc')).toBeNull();
    expect(parseMappingFragment('#linea=')).toBeNull();
    expect(parseMappingFragment('#xlinea=abc')).toBeNull();
  });

  it('rechaza lo que pasa de 1024 bytes (antes y despues de decodificar)', () => {
    expect(parseMappingFragment(`#linea=${'a'.repeat(1025)}`)).toBeNull();
    expect(parseMappingFragment(`#linea=${'a'.repeat(5000)}`)).toBeNull();
    expect(parseMappingFragment(`#linea=${encodeURIComponent('ñ'.repeat(513))}`)).toBeNull();
    expect(parseMappingFragment(`#linea=${'a'.repeat(1024)}`)).toHaveLength(1024);
  });

  it('codificacion rota: null (no lanza)', () => {
    expect(parseMappingFragment('#linea=%E0%A4%A')).toBeNull();
    expect(parseMappingFragment('#linea=%zz')).toBeNull();
    expect(parseMappingFragment('#linea=%')).toBeNull();
  });

  it('el HTML se queda como texto (lo pinta un textarea)', () => {
    expect(parseMappingFragment(`#linea=${encodeURIComponent('<img src=x onerror=alert(1)>')}`)).toBe('<img src=x onerror=alert(1)>');
  });
});
