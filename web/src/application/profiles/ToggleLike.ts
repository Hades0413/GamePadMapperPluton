import type { ProfileRepository } from '../ports/ProfileRepository';
import { requireId } from '../shared/guards';

export class ToggleLike {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  execute(id: string): Promise<boolean> {
    return this.#profiles.toggleLike(requireId(id));
  }
}
