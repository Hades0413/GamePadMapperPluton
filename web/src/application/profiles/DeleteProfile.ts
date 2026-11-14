import type { ProfileRepository } from '../ports/ProfileRepository';
import { requireId } from '../shared/guards';

export class DeleteProfile {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  execute(id: string): Promise<void> {
    return this.#profiles.delete(requireId(id));
  }
}
