import type { Author } from '@domain/author/Author';

export interface AuthorRepository {
  findByUsername(username: string): Promise<Author | null>;
}
