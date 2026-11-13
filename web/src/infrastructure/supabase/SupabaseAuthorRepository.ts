import type { AuthorRepository } from '@application/ports/AuthorRepository';
import type { Author } from '@domain/author/Author';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parse, unwrap } from './errors';
import { toAuthor } from './mappers';
import { AUTHOR_COLUMNS, authorRow } from './rows';

export class SupabaseAuthorRepository implements AuthorRepository {
  readonly #db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async findByUsername(username: string): Promise<Author | null> {
    // username_key = nombre en minusculas, unico (los nombres de GitHub no distinguen mayusculas).
    const result = await this.#db
      .from('authors')
      .select(AUTHOR_COLUMNS)
      .eq('username_key', username.toLowerCase())
      .maybeSingle();
    const row = unwrap(result);
    return row ? toAuthor(parse(authorRow, row)) : null;
  }
}
