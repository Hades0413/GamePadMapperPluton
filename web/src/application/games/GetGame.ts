import { isValidPackage, type Game } from '@domain/game/Game';
import type { GameRepository } from '../ports/GameRepository';

export class GetGame {
  readonly #games: GameRepository;

  constructor(games: GameRepository) {
    this.#games = games;
  }

  async execute(packageName: string): Promise<Game | null> {
    return isValidPackage(packageName) ? this.#games.findByPackage(packageName) : null;
  }
}
