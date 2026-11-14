import type { Author } from '@domain/author/Author';

export type ProfileStatus = 'published' | 'hidden';
export type ProfileSort = 'popular' | 'recent' | 'installs' | 'rating';
export const PROFILE_SORTS: readonly ProfileSort[] = ['popular', 'installs', 'rating', 'recent'];

/** Filtros de la lista de perfiles de un juego. */
export interface ProfileFilters {
  /** Texto en el titulo o la descripcion. */
  readonly search: string;
  /** Marca (primera palabra del modelo: «Redmi», «Samsung»...). */
  readonly brand: string;
  /** Modelo exacto («Redmi Note 9»). */
  readonly model: string;
  /** Proporcion de pantalla (lado largo / corto) o null. */
  readonly ratio: number | null;
  /** Etiqueta ('' = todas). */
  readonly tag?: string;
}

/** Etiquetas de perfil (lista cerrada; mismas que private.valid_tags). */
export const PROFILE_TAGS = [
  'competitivo', 'casual', 'zurdo', 'una-mano', 'sin-gatillos', 'tablet', 'giroscopio', 'teclado-raton', 'xbox', 'playstation',
] as const;
export type ProfileTag = (typeof PROFILE_TAGS)[number];
export const MAX_TAGS = 4;
export const isProfileTag = (t: string): t is ProfileTag => (PROFILE_TAGS as readonly string[]).includes(t);


/** Marca de un modelo: su primera palabra. */
export function brandOf(model: string): string {
  return model.trim().split(/\s+/)[0] ?? '';
}

export const TITLE_MIN = 3;
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 500;
export const MAX_PROFILES_PER_AUTHOR = 100;
export const DEVICE_MIN = 2;
export const DEVICE_MAX = 60;
const DEVICE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._()+/-]*$/;

/** Modelo del telefono valido (mismas reglas que private.clean_device). */
export function isValidDeviceModel(value: string): boolean {
  return value.length >= DEVICE_MIN && value.length <= DEVICE_MAX && DEVICE_PATTERN.test(value);
}

/** Perfil tal como aparece en un listado (sin el texto .conf). */
export interface GameProfileSummary {
  readonly id: string;
  readonly packageName: string;
  readonly gameName: string | null;
  readonly title: string;
  readonly description: string;
  readonly author: Author | null;
  readonly screen: { readonly width: number; readonly height: number };
  /** Modelo del telefono con el que se hizo (opcional). */
  readonly deviceModel: string | null;
  readonly bindingCount: number;
  readonly likeCount: number;
  /** Instalaciones desde la app y respuestas «¿te funcionó?» (orientativos). */
  readonly installCount: number;
  readonly worksYes: number;
  readonly worksNo: number;
  /** Respuestas de los ultimos 30 dias (para avisar si ha dejado de funcionar). */
  readonly recentYes: number;
  readonly recentNo: number;
  readonly tags: readonly ProfileTag[];
  /** Fecha en que un admin lo destaco (o null). */
  readonly featuredAt: Date | null;
  readonly status: ProfileStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Votos minimos para mostrar el porcentaje «funciona» (con menos no es fiable). */
export const MIN_VOTES = 3;

/** Porcentaje (0-100) de quienes dicen que les funciona, o null si aun hay pocos votos. */
export function worksShare(p: Pick<GameProfileSummary, 'worksYes' | 'worksNo'>): number | null {
  const total = p.worksYes + p.worksNo;
  return total < MIN_VOTES ? null : Math.round((p.worksYes * 100) / total);
}

/** ¿La mayoria de los votos recientes dice que ya no funciona? (con al menos 3 votos). */
export function recentlyBroken(p: Pick<GameProfileSummary, 'recentYes' | 'recentNo'>): boolean {
  return p.recentNo >= MIN_VOTES && p.recentNo > p.recentYes;
}

/** Resultado de dar o quitar «me gusta»: estado final y total exacto en ese momento. */
export interface LikeResult {
  readonly liked: boolean;
  readonly likeCount: number;
}

/** Perfil completo, con el texto .conf que importa la app. */
export interface GameProfile extends GameProfileSummary {
  readonly conf: string;
}

/** Nombre de archivo seguro para descargar el perfil. */
export function profileFileName(profile: Pick<GameProfile, 'packageName' | 'title'>): string {
  const slug = profile.title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40);
  return `${profile.packageName}${slug ? `-${slug}` : ''}.conf`;
}
