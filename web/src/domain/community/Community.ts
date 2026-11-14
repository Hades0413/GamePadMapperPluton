import type { Author } from '@domain/author/Author';

export const COMMENT_MIN = 2;
export const COMMENT_MAX = 280;

/** Comentario corto en un perfil. */
export interface Comment {
  readonly id: string;
  readonly profileId: string;
  readonly body: string;
  readonly author: Author | null;
  readonly createdAt: Date;
}

/** Version anterior de un perfil (se guarda cada vez que cambia su .conf). */
export interface ProfileVersion {
  readonly version: number;
  readonly title: string;
  readonly conf: string;
  readonly createdAt: Date;
}
