import type { Game } from '@domain/game/Game';
import { normalizePage, type Page, type PageRequest } from '@domain/shared/Page';
import type { GameRepository } from '../ports/GameRepository';

export class ListGames {
  readonly #games: GameRepository;

  constructor(games: GameRepository) {
    this.#games = games;
  }

  execute(input: { search?: string } & Partial<PageRequest> = {}): Promise<Page<Game>> {
    // Solo letras, numeros y espacios: nada de comodines ni sintaxis de filtros.
    const search = (input.search ?? '').normalize('NFC').replace(/[^\p{L}\p{N} ]+/gu, ' ').trim().slice(0, 40);
    return this.#games.list({ search, ...normalizePage(input) });
  }
}
