import { isValidPackage } from '@domain/game/Game';
import type { GameRepository } from '../ports/GameRepository';

/** Trae de Google Play el icono y una captura del juego si aun no los tiene. */
export class FillGameImages {
  readonly #games: GameRepository;

  constructor(games: GameRepository) {
    this.#games = games;
  }

  async execute(packageName: string): Promise<void> {
    if (isValidPackage(packageName)) await this.#games.fillImagesFromPlay(packageName);
  }
}
