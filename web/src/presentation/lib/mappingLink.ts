import { SDL_MAX_BYTES } from '@domain/controller/sdlMapping';
import { loadDraft, saveDraft } from './sessionDraft';

/** Borrador del formulario «Enviar un mando» (/mandos): sobrevive al ir y volver de GitHub. */
export const MAPPING_DRAFT_KEY = 'gpm.mappingDraft';

/**
 * Linea SDL que llega en el fragmento (#linea=<encodeURIComponent(linea)>), o null si no viene,
 * esta mal codificada o pasa de 1024 bytes. Es solo texto: nunca se interpreta como HTML.
 */
export function parseMappingFragment(hash: string): string | null {
  const raw = /(?:^#|&)linea=([^&]*)/.exec(hash)?.[1];
  // Cada byte ocupa como mucho 3 caracteres codificado (%XX): corta antes de decodificar.
  if (!raw || raw.length > SDL_MAX_BYTES * 3) return null;
  let line: string;
  try {
    line = decodeURIComponent(raw.replace(/\+/g, '%20'));
  } catch {
    return null;
  }
  if (new TextEncoder().encode(line).length > SDL_MAX_BYTES) return null;
  return line.trim() || null;
}

export interface MappingLink {
  /** Linea inicial del formulario (la del enlace o la del borrador). */
  readonly line: string;
  /** La linea venia en el enlace (desde la app de escritorio), ahora o antes de iniciar sesion. */
  readonly fromLink: boolean;
}

/**
 * Lee la linea que envia la app de escritorio en el enlace y la quita de la barra de direcciones
 * (va en el "#": nunca llega a ningun servidor). Se guarda como borrador en esta pestana para no
 * perderla si hay que iniciar sesion con GitHub.
 */
export function readMappingLink(): MappingLink {
  const hash = window.location.hash;
  const present = /(?:^#|&)linea=/.test(hash);
  const line = present ? parseMappingFragment(hash) : null;
  if (present) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  if (line) {
    saveDraft(MAPPING_DRAFT_KEY, { line, app: '1' });
    return { line, fromLink: true };
  }
  // Al volver de GitHub: el borrador recuerda si la linea venia de la app (y no se ha tocado).
  const draft = loadDraft(MAPPING_DRAFT_KEY, { line: '', app: '' });
  const draftLine = draft.line.slice(0, SDL_MAX_BYTES * 2);
  return { line: draftLine, fromLink: !!draftLine && draft.app === '1' };
}
