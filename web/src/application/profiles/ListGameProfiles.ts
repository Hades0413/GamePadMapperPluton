import { isValidPackage } from '@domain/game/Game';
import {
  isProfileTag, PROFILE_SORTS, type GameProfileSummary, type ProfileFilters, type ProfileSort,
} from '@domain/profile/GameProfile';
import { normalizePage, type Page, type PageRequest } from '@domain/shared/Page';
import type { ProfileRepository } from '../ports/ProfileRepository';

/** Texto de busqueda seguro: solo letras, numeros y espacios (nada de comodines ni sintaxis). */
const cleanSearch = (s: string | undefined, max: number) =>
  (s ?? '').normalize('NFC').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Modelo o marca: los mismos caracteres que admite la base de datos. */
const cleanDevice = (s: string | undefined) => (s ?? '').replace(/[^A-Za-z0-9 ._()+/-]+/g, '').trim().slice(0, 60);

export class ListGameProfiles {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  async execute(
    input: { packageName: string; sort?: ProfileSort } & Partial<ProfileFilters> & Partial<PageRequest>,
  ): Promise<Page<GameProfileSummary>> {
    if (!isValidPackage(input.packageName)) return { items: [], hasMore: false };
    const sort: ProfileSort = input.sort && PROFILE_SORTS.includes(input.sort) ? input.sort : 'popular';
    const ratio = input.ratio && Number.isFinite(input.ratio) && input.ratio >= 1 && input.ratio <= 4 ? input.ratio : null;
    return this.#profiles.listByGame(input.packageName, sort, normalizePage(input), {
      search: cleanSearch(input.search, 40),
      brand: cleanDevice(input.brand),
      model: cleanDevice(input.model),
      ratio,
      tag: input.tag && isProfileTag(input.tag) ? input.tag : '',
    });
  }
}

export class ListDeviceModels {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  async execute(packageName: string): Promise<readonly string[]> {
    return isValidPackage(packageName) ? this.#profiles.listDeviceModels(packageName) : [];
  }
}
