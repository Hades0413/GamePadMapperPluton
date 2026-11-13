import type { Author } from '@domain/author/Author';

export type ProfileStatus = 'published' | 'hidden';
export type ProfileSort = 'popular' | 'recent';

export const TITLE_MIN = 3;
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 500;
export const MAX_PROFILES_PER_AUTHOR = 100;

/** Perfil tal como aparece en un listado (sin el texto .conf). */
export interface GameProfileSummary {
  readonly id: string;
  readonly packageName: string;
  readonly gameName: string | null;
  readonly title: string;
  readonly description: string;
  readonly author: Author | null;
  readonly screen: { readonly width: number; readonly height: number };
  readonly bindingCount: number;
  readonly likeCount: number;
  readonly status: ProfileStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
