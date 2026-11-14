import { isValidControllerModel, isValidDeviceModel } from '../GameProfile';

/**
 * Datos que la app pone como comentarios al principio del perfil al compartirlo, exportarlo o
 * subirlo (ver ProfileMeta.java):
 *   # modelo: Redmi Note 9
 *   # mando: Wireless Controller (054c:05c4)
 *   # pantalla: 2400x1080
 * Solo se leen las primeras lineas de comentario y solo se aceptan valores que pasan las mismas
 * reglas que la base de datos; lo demas se ignora.
 */
export interface ConfMeta {
  readonly model: string | null;
  readonly controller: string | null;
}

const META = /^\s*#\s*(modelo|mando)\s*:\s*(.*)$/i;
const MAX_HEADER_LINES = 20;

/** Lineas de comentario (y vacias) del principio, hasta la primera linea con contenido. */
function headerLines(conf: string): string[] {
  const out: string[] = [];
  for (const raw of conf.split('\n', 200)) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() !== '' && !line.trimStart().startsWith('#')) break;
    out.push(line);
    if (out.length >= MAX_HEADER_LINES) break;
  }
  return out;
}

export function readConfMeta(conf: string): ConfMeta {
  let model: string | null = null;
  let controller: string | null = null;
  for (const line of headerLines(conf)) {
    const m = META.exec(line);
    if (!m) continue;
    const value = (m[2] ?? '').replace(/\s+/g, ' ').trim();
    if (m[1]?.toLowerCase() === 'modelo') {
      if (model === null && isValidDeviceModel(value)) model = value;
    } else if (controller === null && isValidControllerModel(value)) {
      controller = value;
    }
  }
  return { model, controller };
}

/**
 * Comentarios del principio del perfil (con su salto de linea), para conservarlos al volver a
 * escribir el perfil desde el editor visual (serializeConf no guarda comentarios).
 */
export function leadingComments(conf: string): string {
  const lines = headerLines(conf).filter((l) => l.trim() !== '');
  return lines.length ? `${lines.join('\n')}\n` : '';
}
