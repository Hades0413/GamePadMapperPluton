import { isValidPackage } from '@domain/game/Game';
import type { GameProfileSummary, ProfileSort } from '@domain/profile/GameProfile';
import { normalizePage, type Page, type PageRequest } from '@domain/shared/Page';
import type { ProfileRepository } from '../ports/ProfileRepository';

export class ListGameProfiles {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  async execute(
    input: { packageName: string; sort?: ProfileSort } & Partial<PageRequest>,
  ): Promise<Page<GameProfileSummary>> {
    if (!isValidPackage(input.packageName)) return { items: [], hasMore: false };
    const sort: ProfileSort = input.sort === 'recent' ? 'recent' : 'popular';
    return this.#profiles.listByGame(input.packageName, sort, normalizePage(input));
  }
}
