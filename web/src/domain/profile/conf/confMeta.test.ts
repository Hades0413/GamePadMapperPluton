import { describe, expect, it } from 'vitest';
import { leadingComments, readConfMeta } from './confMeta';
import { serializeConf } from './serializeConf';
import { validateConf } from './validateConf';

const APP = '# modelo: Redmi Note 9\n# mando: Wireless Controller (054c:05c4)\n# pantalla: 2400x1080\n'
  + 'package = com.ejemplo.juego\nscreen = 2400x1080\nA = tap 100 200\n';

describe('datos del perfil en comentarios (# modelo, # mando)', () => {
  it('lee el modelo y el mando que pone la app', () => {
    expect(readConfMeta(APP)).toEqual({ model: 'Redmi Note 9', controller: 'Wireless Controller (054c:05c4)' });
  });

  it('el perfil sigue siendo valido y los comentarios no cambian nada', () => {
    const a = validateConf(APP);
    const b = validateConf(APP.split('\n').slice(3).join('\n'));
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(serializeConf(a.config)).toBe(serializeConf(b.config));
  });

  it('ignora valores no validos (HTML, comillas, demasiado largos) y lo que no esta al principio', () => {
    expect(readConfMeta('# modelo: <script>alert(1)</script>\n# mando: x\';drop\npackage = a.b\n'))
      .toEqual({ model: null, controller: null });
    expect(readConfMeta(`# mando: ${'a'.repeat(61)}\npackage = a.b\n`).controller).toBeNull();
    expect(readConfMeta('package = a.b\n# modelo: Pixel 7\n# mando: Xbox\n')).toEqual({ model: null, controller: null });
  });

  it('acepta mayusculas, espacios y CRLF; se queda con el primero', () => {
    expect(readConfMeta('#MODELO:  Pixel   7\r\n# Mando : 8BitDo Pro 2\r\n# mando: Otro\r\npackage = a.b'))
      .toEqual({ model: 'Pixel 7', controller: '8BitDo Pro 2' });
  });

  it('conserva los comentarios del principio al volver a escribir el perfil', () => {
    expect(leadingComments(APP)).toBe('# modelo: Redmi Note 9\n# mando: Wireless Controller (054c:05c4)\n# pantalla: 2400x1080\n');
    expect(leadingComments('package = a.b\n# no\n')).toBe('');
    expect(leadingComments('\n# Mi perfil\n\npackage = a.b')).toBe('# Mi perfil\n');
  });
});
