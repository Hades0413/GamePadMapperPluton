import type { ProfileRepository } from '@application/ports/ProfileRepository';
import type { ProfileFilters, ProfileSort } from '@domain/profile/GameProfile';
import type { PageRequest } from '@domain/shared/Page';
import { describe, expect, it } from 'vitest';
import { ListDeviceModels, SearchProfiles } from './ListGameProfiles';

/** Repositorio falso que guarda lo que recibe la busqueda. */
function fakeRepo() {
  const calls: { sort: ProfileSort; page: PageRequest; filters: ProfileFilters }[] = [];
  const devices: (string | null)[] = [];
  const repo = {
    search: async (sort: ProfileSort, page: PageRequest, filters: ProfileFilters) => {
      calls.push({ sort, page, filters });
      return { items: [], hasMore: false };
    },
    listDeviceModels: async (pkg: string | null) => {
      devices.push(pkg);
      return [];
    },
  } as unknown as ProfileRepository;
  return { repo, calls, devices };
}

describe('SearchProfiles', () => {
  it('sanea el texto: sin comodines ni sintaxis de PostgREST', async () => {
    const { repo, calls } = fakeRepo();
    await new SearchProfiles(repo).execute({ search: '  brawl*,stars).or(title.eq.x%_  ' });
    expect(calls[0]?.filters.search).toBe('brawl stars or title eq x');
  });

  it('limita longitudes, etiquetas, proporcion, orden y pagina', async () => {
    const { repo, calls } = fakeRepo();
    await new SearchProfiles(repo).execute({
      search: 'x'.repeat(100), brand: 'Redmi<script>', model: 'A'.repeat(80), tag: 'hack', ratio: 9,
      sort: 'nope' as ProfileSort, page: -3, size: 1000,
    });
    const call = calls[0];
    expect(call?.filters.search).toHaveLength(40);
    expect(call?.filters.brand).toBe('Redmiscript');
    expect(call?.filters.model).toHaveLength(60);
    expect(call?.filters.tag).toBe('');
    expect(call?.filters.ratio).toBeNull();
    expect(call?.sort).toBe('popular');
    expect(call?.page).toEqual({ page: 0, size: 50 });
  });

  it('deja pasar filtros validos', async () => {
    const { repo, calls } = fakeRepo();
    await new SearchProfiles(repo).execute({ search: 'Fútbol 2', tag: 'zurdo', ratio: 2.22, sort: 'installs', model: 'Redmi Note 9' });
    expect(calls[0]).toMatchObject({
      sort: 'installs',
      filters: { search: 'Fútbol 2', tag: 'zurdo', ratio: 2.22, model: 'Redmi Note 9' },
    });
  });
});

describe('ListDeviceModels', () => {
  it('sin juego pide los modelos de todos; con paquete invalido no pide nada', async () => {
    const { repo, devices } = fakeRepo();
    const uc = new ListDeviceModels(repo);
    await uc.execute('');
    await uc.execute('com.x.y');
    expect(await uc.execute('no valido')).toEqual([]);
    expect(devices).toEqual([null, 'com.x.y']);
  });
});
