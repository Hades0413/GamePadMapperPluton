import type { GameProfileSummary } from '@domain/profile/GameProfile';
import { normalizePage, type Page, type PageRequest } from '@domain/shared/Page';
import type { ProfileRepository } from '../ports/ProfileRepository';
import { requireId } from '../shared/guards';

export class ListAuthorProfiles {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  execute(input: { authorId: string } & Partial<PageRequest>): Promise<Page<GameProfileSummary>> {
    return this.#profiles.listByAuthor(requireId(input.authorId), normalizePage(input));
  }
}
