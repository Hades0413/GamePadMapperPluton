import type { LikeResult } from '@domain/profile/GameProfile';
import type { ProfileRepository } from '../ports/ProfileRepository';
import { requireId } from '../shared/guards';

export class ToggleLike {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  execute(id: string): Promise<LikeResult> {
    return this.#profiles.toggleLike(requireId(id));
  }
}
