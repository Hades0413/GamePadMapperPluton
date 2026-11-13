import type { NewProfile, ProfileChanges } from '@application/ports/ProfileRepository';
import type { GameProfile, ProfileSort } from '@domain/profile/GameProfile';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUseCases } from '../di/ServicesContext';
import { useAccount } from './account';
import { keys } from './keys';

export function useGameProfiles(packageName: string, sort: ProfileSort) {
  const { listGameProfiles } = useUseCases();
  return useInfiniteQuery({
    queryKey: keys.gameProfiles(packageName, sort),
    queryFn: ({ pageParam }) => listGameProfiles.execute({ packageName, sort, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
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

/** "Me gusta" con respuesta inmediata en pantalla (se corrige si el servidor falla). */
export function useToggleLike() {
  const { toggleLike } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => toggleLike.execute(id),
    onSuccess: (liked, id) => {
      client.setQueryData<GameProfile | null>(keys.profile(id), (p) =>
        p ? { ...p, likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)) } : p,
      );
      void client.invalidateQueries({ queryKey: keys.allLiked });
      void client.invalidateQueries({ queryKey: keys.allProfiles });
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
