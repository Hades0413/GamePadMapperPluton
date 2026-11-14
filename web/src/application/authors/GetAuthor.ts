import type { Author } from '@domain/author/Author';
import type { AuthorRepository } from '../ports/AuthorRepository';

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

export class GetAuthor {
  readonly #authors: AuthorRepository;

  constructor(authors: AuthorRepository) {
    this.#authors = authors;
  }

  async execute(username: string): Promise<Author | null> {
    return USERNAME.test(username) ? this.#authors.findByUsername(username) : null;
  }
}
