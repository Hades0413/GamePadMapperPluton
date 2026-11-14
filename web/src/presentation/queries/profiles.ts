import type { NewProfile, ProfileChanges } from '@application/ports/ProfileRepository';
import type { GameProfile, ProfileFilters, ProfileSort } from '@domain/profile/GameProfile';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUseCases } from '../di/ServicesContext';
import { useAccount } from './account';
import { keys } from './keys';

export function useGameProfiles(packageName: string, sort: ProfileSort, filters: ProfileFilters) {
  const { listGameProfiles } = useUseCases();
  return useInfiniteQuery({
    queryKey: [...keys.gameProfiles(packageName, sort), filters.search, filters.brand, filters.model, filters.ratio?.toFixed(3) ?? ''],
    queryFn: ({ pageParam }) => listGameProfiles.execute({ packageName, sort, ...filters, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useDeviceModels(packageName: string) {
  const { listDeviceModels } = useUseCases();
  return useQuery({
    queryKey: ['profiles', 'devices', packageName],
    queryFn: () => listDeviceModels.execute(packageName),
    staleTime: 10 * 60_000,
  });
}

export function useAuthorProfiles(authorId: string | undefined) {
  const { listAuthorProfiles } = useUseCases();
  return useInfiniteQuery({
    queryKey: keys.authorProfiles(authorId ?? ''),
    queryFn: ({ pageParam }) => listAuthorProfiles.execute({ authorId: authorId ?? '', page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    enabled: !!authorId,
  });
}

export function useProfile(id: string | undefined) {
  const { getProfile } = useUseCases();
  return useQuery({ queryKey: keys.profile(id ?? ''), queryFn: () => getProfile.execute(id ?? ''), enabled: !!id });
}

export function useLiked(ids: readonly string[]) {
  const { getLikedProfiles } = useUseCases();
  const { data: account } = useAccount();
  return useQuery({
    queryKey: keys.liked(ids),
    queryFn: () => getLikedProfiles.execute(ids),
    enabled: !!account && ids.length > 0,
  });
}

export function usePublishProfile() {
  const { publishProfile } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: NewProfile) => publishProfile.execute(input),
    onSuccess: (_id, input) => {
      void client.invalidateQueries({ queryKey: keys.allProfiles });
      void client.invalidateQueries({ queryKey: ['games'] });
      void client.invalidateQueries({ queryKey: keys.game(input.packageName) });
    },
  });
}

export function useUpdateProfile() {
  const { updateProfile } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; packageName: string } & ProfileChanges) => updateProfile.execute(input),
    onSuccess: (_r, input) => {
      void client.invalidateQueries({ queryKey: keys.profile(input.id) });
      void client.invalidateQueries({ queryKey: keys.allProfiles });
    },
  });
}

export function useDeleteProfile() {
  const { deleteProfile } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProfile.execute(id),
    onSuccess: (_r, id) => {
      client.removeQueries({ queryKey: keys.profile(id) });
      void client.invalidateQueries({ queryKey: keys.allProfiles });
      void client.invalidateQueries({ queryKey: ['games'] });
    },
  });
}

/**
 * «Me gusta» con respuesta inmediata: el corazon y el numero cambian al pulsar (optimista) y luego
 * se usa el total exacto que devuelve el servidor. Si falla, se deshace. No recarga las listas
 * (sus contadores se recalculan en el servidor cada minuto): menos peticiones con mucha gente.
 */
export function useToggleLike() {
  const { toggleLike } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => toggleLike.execute(id),
    onMutate: async (id) => {
      const likedKey = keys.liked([id]);
      await client.cancelQueries({ queryKey: likedKey });
      const prevLiked = client.getQueryData<ReadonlySet<string>>(likedKey);
      const prevProfile = client.getQueryData<GameProfile | null>(keys.profile(id));
      const wasLiked = prevLiked?.has(id) ?? false;
      client.setQueryData<ReadonlySet<string>>(likedKey, wasLiked ? new Set() : new Set([id]));
      client.setQueryData<GameProfile | null>(keys.profile(id), (p) =>
        p ? { ...p, likeCount: Math.max(0, p.likeCount + (wasLiked ? -1 : 1)) } : p);
      return { prevLiked, prevProfile };
    },
    onError: (_e, id, ctx) => {
      client.setQueryData(keys.liked([id]), ctx?.prevLiked);
      client.setQueryData(keys.profile(id), ctx?.prevProfile);
    },
    onSuccess: (result, id) => {
      client.setQueryData<ReadonlySet<string>>(keys.liked([id]), result.liked ? new Set([id]) : new Set());
      client.setQueryData<GameProfile | null>(keys.profile(id), (p) => (p ? { ...p, likeCount: result.likeCount } : p));
    },
  });
}

export function useReportProfile() {
  const { reportProfile } = useUseCases();
  return useMutation({
    mutationFn: (input: { id: string; reason: string; details: string }) => reportProfile.execute(input),
  });
}

export function useAuthor(username: string | undefined) {
  const { getAuthor } = useUseCases();
  return useQuery({
    queryKey: keys.author(username ?? ''),
    queryFn: () => getAuthor.execute(username ?? ''),
    enabled: !!username,
  });
}
