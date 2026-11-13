import type { Game } from '@domain/game/Game';
import type { Page, PageRequest } from '@domain/shared/Page';

export interface GameQuery extends PageRequest {
  /** Texto a buscar en el nombre (ya saneado por el caso de uso). */
  readonly search: string;
}

export interface GameRepository {
  list(query: GameQuery): Promise<Page<Game>>;
  findByPackage(packageName: string): Promise<Game | null>;
  /** Completa icono y captura desde Google Play si el juego aun no los tiene (no sustituye nada). */
  fillImagesFromPlay(packageName: string): Promise<void>;
}
