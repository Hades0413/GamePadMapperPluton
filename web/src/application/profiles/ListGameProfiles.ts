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
    input: { packageName: string; sort?: ProfileSort; ratio?: number | null } & Partial<PageRequest>,
  ): Promise<Page<GameProfileSummary>> {
    if (!isValidPackage(input.packageName)) return { items: [], hasMore: false };
    const sort: ProfileSort = input.sort === 'recent' ? 'recent' : 'popular';
    const ratio = input.ratio && Number.isFinite(input.ratio) && input.ratio >= 1 && input.ratio <= 4 ? input.ratio : null;
    return this.#profiles.listByGame(input.packageName, sort, normalizePage(input), ratio);
  }
}
