import type { ProfileRepository } from '../ports/ProfileRepository';
import { requireId } from '../shared/guards';

export class GetLikedProfiles {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  async execute(ids: readonly string[]): Promise<ReadonlySet<string>> {
    const unique = [...new Set(ids.map(requireId))].slice(0, 100);
    return unique.length === 0 ? new Set() : this.#profiles.likedAmong(unique);
  }
}
