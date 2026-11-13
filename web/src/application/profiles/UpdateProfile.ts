import type { ProfileChanges, ProfileRepository } from '../ports/ProfileRepository';
import { requireId } from '../shared/guards';
import { checkConf, checkDescription, checkTitle } from './profileInput';

export class UpdateProfile {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  execute(input: { id: string; packageName: string } & ProfileChanges): Promise<void> {
    return this.#profiles.update(requireId(input.id), {
      title: checkTitle(input.title),
      description: checkDescription(input.description),
      conf: checkConf(input.conf, input.packageName),
    });
  }
}
