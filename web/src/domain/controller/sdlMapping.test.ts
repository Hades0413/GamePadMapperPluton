import { describe, expect, it } from 'vitest';
import { parseSdlLine, sdlErrorText, sdlFields, type SdlErrorCode } from './sdlMapping';

// Mismos casos que supabase/tests/80_mandos_comunidad.sql.
const SDL = '03000000c82d00000161000000000000,8BitDo SN30 Pro,a:b1,b:b0,back:b10,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1,leftshoulder:b6,leftstick:b13,lefttrigger:b8,leftx:a0,lefty:a1,rightshoulder:b7,rightstick:b14,righttrigger:b9,rightx:a2,righty:a3,start:b11,x:b4,y:b3,platform:Linux,';
const BASE = '03000000c82d00000161000000000000,Pad';

function code(line: string): SdlErrorCode | 'OK' {
  const r = parseSdlLine(line);
  return r.ok ? 'OK' : r.code;
}

describe('parseSdlLine', () => {
  it('da la linea canonica (orden fijo, platform al final)', () => {
    const r = parseSdlLine(SDL);
    expect(r.ok && r.value.mapping).toBe('03000000c82d00000161000000000000,8BitDo SN30 Pro,a:b1,b:b0,x:b4,y:b3,back:b10,start:b11,leftstick:b13,rightstick:b14,leftshoulder:b6,rightshoulder:b7,dpup:h0.1,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,leftx:a0,lefty:a1,rightx:a2,righty:a3,lefttrigger:b8,righttrigger:b9,platform:Linux,');
    expect(r.ok && r.value.platform).toBe('Linux');
    expect(r.ok && r.value.fields.length).toBe(20);
  });

  it('pasa el GUID a minusculas, limpia espacios y ordena', () => {
    const r = parseSdlLine('  03000000C82D00000161000000000000,  Pad   X ,platform:Windows,start:b7,leftx:-a0~,y:b3,x:b2,b:b1,a:b0,back:b6\n');
    expect(r.ok && r.value).toMatchObject({
      guid: '03000000c82d00000161000000000000', name: 'Pad X', platform: 'Windows',
      mapping: '03000000c82d00000161000000000000,Pad X,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,leftx:-a0~,platform:Windows,',
    });
  });

  it('rechaza lo mismo que la base de datos', () => {
    const ok = 'a:b0,b:b1,x:b2,y:b3,back:b6,start:b7';
    expect(code('')).toBe('EMPTY');
    expect(code(`03000000c82d0000016100000000000,Pad,${ok},platform:Linux,`)).toBe('BAD_GUID');
    expect(code(`03000000c82d00000161000000000zzz,Pad,${ok},platform:Linux,`)).toBe('BAD_GUID');
    expect(code(`${BASE},a:b0,b:b1,x:b2,y:b3,back:b6,hack:b7,platform:Linux,`)).toBe('UNKNOWN_KEY_SAFE');
    expect(code(`${BASE},a:b0,b:b1,x:b2,y:b3,back:b6,<img>:b7,platform:Linux,`)).toBe('UNKNOWN_KEY');
    expect(code(`${BASE},a:b0,b:b1,x:b2,y:b3,back:b6,start:x7,platform:Linux,`)).toBe('BAD_VALUE');
    expect(code(`${BASE},a:b0,b:b1,x:b2,y:b3,back:b6,start:h0.3,platform:Linux,`)).toBe('BAD_VALUE');
    expect(code(`${BASE},a:b0,b:b1,x:b2,y:b3,back:b6,start:b1234,platform:Linux,`)).toBe('BAD_VALUE');
    expect(code(`03000000c82d00000161000000000000,<script>alert(1)</script>,${ok},platform:Linux,`)).toBe('BAD_NAME_CHARS');
    expect(code(`03000000c82d00000161000000000000,P,${ok},platform:Linux,`)).toBe('BAD_NAME_LENGTH');
    expect(code(`${BASE},${'a:b0,'.repeat(220)}platform:Linux,`)).toBe('TOO_LONG');
    expect(code('x'.repeat(100000))).toBe('TOO_LONG');
    expect(code(`${BASE},${ok},`)).toBe('NO_PLATFORM');
    expect(code(`${BASE},${ok},platform:Mac,`)).toBe('BAD_PLATFORM');
    expect(code(`${BASE},a:b0,b:b1,x:b2,platform:Linux,`)).toBe('TOO_FEW');
    expect(code(`${BASE},a:b0,a:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,`)).toBe('DUPLICATE_KEY');
    expect(code(`${BASE},${ok},platform:Linux,platform:Windows,`)).toBe('DUPLICATE_PLATFORM');
    expect(code(`${BASE},a:b0,b:b1,x:b2,y:b3,back:b6,startb7,platform:Linux,`)).toBe('BAD_FIELD');
    expect(code(`03000000c82d00000161000000000000,Pad\u0007,${ok},platform:Linux,`)).toBe('CONTROL_CHARS');
    expect(code(`${BASE},a:b0,\nb:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,`)).toBe('CONTROL_CHARS');
    expect(code('hola')).toBe('NOT_SDL');
  });

  it('mensajes con el control afectado', () => {
    const r = parseSdlLine(`${BASE},a:b0,a:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,`);
    expect(!r.ok && sdlErrorText(r)).toBe('El control «a» aparece repetido.');
  });

  it('sdlFields lee una linea guardada', () => {
    expect(sdlFields(SDL)[0]).toEqual({ key: 'a', value: 'b1' });
    expect(sdlFields('basura')).toEqual([]);
  });
});
