import type { GameProfile } from '@domain/profile/GameProfile';
import { AppError } from '@domain/shared/AppError';
import type { ProfileRepository } from '../ports/ProfileRepository';
import { requireId } from '../shared/guards';

export class GetProfile {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  async execute(id: string): Promise<GameProfile | null> {
    try {
      return await this.#profiles.findById(requireId(id));
    } catch (error) {
      if (AppError.is(error) && error.code === 'NOT_FOUND') return null;
      throw error;
    }
  }
}
