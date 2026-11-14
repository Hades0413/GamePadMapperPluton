import { isValidPackage } from '@domain/game/Game';
import {
  isControllerType, isProfileTag, PROFILE_SORTS, type GameProfileSummary, type ProfileFilters, type ProfileSort,
} from '@domain/profile/GameProfile';
import { normalizePage, type Page, type PageRequest } from '@domain/shared/Page';
import type { ProfileRepository } from '../ports/ProfileRepository';

/** Texto de busqueda seguro: solo letras, numeros y espacios (nada de comodines ni sintaxis). */
export const cleanSearch = (s: string | undefined, max: number) =>
  (s ?? '').normalize('NFC').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Modelo o marca: los mismos caracteres que admite la base de datos. */
export const cleanDevice = (s: string | undefined) => (s ?? '').replace(/[^A-Za-z0-9 ._()+/-]+/g, '').trim().slice(0, 60);

export class ListGameProfiles {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  async execute(
    input: { packageName: string; sort?: ProfileSort } & Partial<ProfileFilters> & Partial<PageRequest>,
  ): Promise<Page<GameProfileSummary>> {
    if (!isValidPackage(input.packageName)) return { items: [], hasMore: false };
    return this.#profiles.listByGame(input.packageName, cleanSort(input.sort), normalizePage(input), cleanFilters(input));
  }
}

export const cleanSort = (sort: ProfileSort | undefined): ProfileSort =>
  (sort && PROFILE_SORTS.includes(sort) ? sort : 'popular');

/** Filtros saneados: texto sin sintaxis, modelo con los caracteres permitidos, etiqueta y tipo de mando de la lista. */
export function cleanFilters(input: Partial<ProfileFilters>): ProfileFilters {
  const ratio = input.ratio && Number.isFinite(input.ratio) && input.ratio >= 1 && input.ratio <= 4 ? input.ratio : null;
  return {
    search: cleanSearch(input.search, 40),
    brand: cleanDevice(input.brand),
    model: cleanDevice(input.model),
    ratio,
    tag: input.tag && isProfileTag(input.tag) ? input.tag : '',
    controllerType: input.controllerType && isControllerType(input.controllerType) ? input.controllerType : '',
  };
}

/** Busqueda en todos los juegos (/buscar): mismos filtros y ordenes que la lista de un juego. */
export class SearchProfiles {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  execute(input: { sort?: ProfileSort } & Partial<ProfileFilters> & Partial<PageRequest>): Promise<Page<GameProfileSummary>> {
    return this.#profiles.search(cleanSort(input.sort), normalizePage(input), cleanFilters(input));
  }
}

export class ListDeviceModels {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  /** Sin juego (''): modelos de todos los juegos (busqueda global). */
  async execute(packageName: string): Promise<readonly string[]> {
    if (packageName === '') return this.#profiles.listDeviceModels(null);
    return isValidPackage(packageName) ? this.#profiles.listDeviceModels(packageName) : [];
  }
}
