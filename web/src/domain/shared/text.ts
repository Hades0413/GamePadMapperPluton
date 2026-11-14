import { AppError } from './AppError';

// eslint-disable-next-line no-control-regex -- a proposito: elimina caracteres de control
const CONTROL = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const ANGLE = /[<>]/;

/** Texto de una linea: espacios colapsados, longitud y sin < >. Igual que private.clean_line. */
export function cleanLine(value: string, min: number, max: number, field: string): string {
  const v = value.replace(/\s+/g, ' ').trim();
  if (v.length < min || v.length > max) {
    throw new AppError('INVALID_INPUT', `El campo «${field}» debe tener entre ${min} y ${max} caracteres.`);
  }
  if (ANGLE.test(v)) throw new AppError('INVALID_INPUT', `El campo «${field}» no puede contener < ni >.`);
  return v;
}

/** Texto de varias lineas. Igual que private.clean_text. */
export function cleanText(value: string, max: number, field: string): string {
  const v = value.replace(/\r\n/g, '\n').trim().replace(CONTROL, '').replace(/\n{3,}/g, '\n\n');
  if (v.length > max) throw new AppError('INVALID_INPUT', `El campo «${field}» admite como mucho ${max} caracteres.`);
  if (ANGLE.test(v)) throw new AppError('INVALID_INPUT', `El campo «${field}» no puede contener < ni >.`);
  return v;
}
