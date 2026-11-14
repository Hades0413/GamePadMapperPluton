import type { GameQuery, GameRepository } from '@application/ports/GameRepository';
import type { Game } from '@domain/game/Game';
import type { Page } from '@domain/shared/Page';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parse, toAppError, unwrap } from './errors';
import { toGame } from './mappers';
import { rangeOf, toPage } from './pagination';
import { GAME_COLUMNS, gameRow } from './rows';

export class SupabaseGameRepository implements GameRepository {
  readonly #db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async list(query: GameQuery): Promise<Page<Game>> {
    const [from, to] = rangeOf(query);
    let request = this.#db
      .from('games')
      .select(GAME_COLUMNS)
      .gt('profile_count', 0)
      .order('profile_count', { ascending: false })
      .order('name')
      .range(from, to);
    // El caso de uso ya dejo solo letras, numeros y espacios: no hay comodines que escapar.
    if (query.search) request = request.ilike('name', `%${query.search}%`);
    const rows = parse(z.array(gameRow), unwrap(await request));
    return toPage(rows.map(toGame), query);
  }

  async fillImagesFromPlay(packageName: string): Promise<void> {
    const { error } = await this.#db.functions.invoke('importar-juego', { body: { package: packageName, action: 'rellenar' } });
    if (error) throw toAppError(error);
  }

  async findByPackage(packageName: string): Promise<Game | null> {
    const result = await this.#db.from('games').select(GAME_COLUMNS).eq('package', packageName).maybeSingle();
    const row = unwrap(result);
    return row ? toGame(parse(gameRow, row)) : null;
  }
}
