/** Usuario de GitHub que ha subido perfiles. Solo datos publicos. */
export interface Author {
  readonly id: string;
  readonly username: string;
  readonly avatarUrl: string | null;
}

/** Cuenta de la persona con sesion iniciada. */
export interface Account extends Author {
  readonly isAdmin: boolean;
}

export function githubUrl(author: Pick<Author, 'username'>): string {
  return `https://github.com/${encodeURIComponent(author.username)}`;
}
