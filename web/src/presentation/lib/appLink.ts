import { CONF_MAX_BYTES } from '@domain/profile/conf/ProfileConfig';
import { isValidControllerModel, isValidDeviceModel } from '@domain/profile/GameProfile';
import { decodeBase64Url } from './files';

const FROM_APP = 'gpm.fromApp';

export interface AppLink {
  /** Texto .conf que envio la app (o null si no venia ninguno valido). */
  readonly conf: string | null;
  /** Modelo del telefono que envio la app (o null). */
  readonly model: string | null;
  /** Mando que envio la app («Wireless Controller (054c:05c4)») o null. */
  readonly controller: string | null;
}

/** Valor de texto del enlace (#...&clave=valor), decodificado; null si falta o no se puede leer. */
function hashValue(hash: string, key: string): string | null {
  const raw = new RegExp(`(?:^#|&)${key}=([^&]{1,180})`).exec(hash)?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).replace(/\s+/g, ' ').trim().slice(0, 60) || null;
  } catch {
    return null;   // mal codificado: se ignora
  }
}

/**
 * Lee lo que la app envia en el enlace (#conf=<base64url>&modelo=...&mando=...) y lo quita de la barra de
 * direcciones. Va en el "#" para que nunca se envie a ningun servidor. Si venia un perfil, se
 * recuerda en esta pestana que el usuario vino desde la app (para ofrecerle volver al terminar,
 * aunque entre medias inicie sesion con GitHub).
 */
export function readAppLink(): AppLink {
  const hash = window.location.hash;
  const match = /(?:^#|&)conf=([^&]+)/.exec(hash);
  const conf = match?.[1] ? decodeBase64Url(match[1], CONF_MAX_BYTES) : null;
  // Modelo y mando: solo si cumplen las reglas de la base de datos (si no, se ignoran).
  const rawModel = hashValue(hash, 'modelo');
  const rawController = hashValue(hash, 'mando');
  const model = rawModel && isValidDeviceModel(rawModel) ? rawModel : null;
  const controller = rawController && isValidControllerModel(rawController) ? rawController : null;
  if (match) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  if (conf) setFromApp(true);
  return { conf, model, controller };
}

export function cameFromApp(): boolean {
  try {
    return sessionStorage.getItem(FROM_APP) === '1';
  } catch {
    return false;
  }
}

export function setFromApp(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(FROM_APP, '1');
    else sessionStorage.removeItem(FROM_APP);
  } catch {
    // sin almacenamiento: no pasa nada
  }
}

/** Enlace que devuelve a la app el id del perfil publicado (para poder actualizarlo desde alli). */
export const appPublishedLink = (id: string) => `gpmapper://subido/${id}`;

/** Estado de navegacion: el perfil se acaba de publicar o actualizar desde la app. */
export interface PublishedState {
  readonly published?: 'created' | 'updated';
  readonly fromApp?: boolean;
}
