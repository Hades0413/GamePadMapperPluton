import type { GameImageFile, GameImageKind } from '@domain/game/GameImage';
import type { BanDays, CommentAction } from '@domain/moderation/Moderation';
import type { ProfileStatus } from '@domain/profile/GameProfile';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUseCases } from '../di/ServicesContext';
import { useAccount } from './account';
import { keys } from './keys';

export function useReportedProfiles() {
  const { listReportedProfiles } = useUseCases();
  const { data: account } = useAccount();
  return useQuery({
    queryKey: keys.reported,
    queryFn: () => listReportedProfiles.execute(),
    enabled: !!account?.isAdmin,
    staleTime: 0,
  });
}

function useAdminMutation<T>(fn: (input: T) => Promise<void>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.reported });
      void client.invalidateQueries({ queryKey: ['moderation'] });
      void client.invalidateQueries({ queryKey: ['comments'] });
      void client.invalidateQueries({ queryKey: keys.allProfiles });
      void client.invalidateQueries({ queryKey: ['games'] });
      void client.invalidateQueries({ queryKey: ['game'] });
    },
  });
}

export function useModerateProfile() {
  const { moderateProfile } = useUseCases();
  return useAdminMutation((i: { id: string; status: ProfileStatus; clearReports: boolean }) => moderateProfile.execute(i));
}

export function useBanAuthor() {
  const { banAuthor } = useUseCases();
  return useAdminMutation((i: { authorId: string; days: BanDays | null; reason: string }) => banAuthor.execute(i));
}

export function useUnbanAuthor() {
  const { unbanAuthor } = useUseCases();
  return useAdminMutation((i: { authorId: string; reason: string }) => unbanAuthor.execute(i));
}

export function useBannedAuthors() {
  const { listBannedAuthors } = useUseCases();
  const { data: account } = useAccount();
  return useQuery({
    queryKey: keys.bannedAuthors,
    queryFn: () => listBannedAuthors.execute(),
    enabled: !!account?.isAdmin,
    staleTime: 0,
  });
}

export function useReportedComments() {
  const { listReportedComments } = useUseCases();
  const { data: account } = useAccount();
  return useQuery({
    queryKey: keys.reportedComments,
    queryFn: () => listReportedComments.execute(),
    enabled: !!account?.isAdmin,
    staleTime: 0,
  });
}

export function useModerateComment() {
  const { moderateComment } = useUseCases();
  return useAdminMutation((i: { commentId: string; action: CommentAction; reason: string }) => moderateComment.execute(i));
}

const LOG_PAGE = 50;

/** Historial de moderacion por paginas (del mas reciente al mas antiguo). */
export function useModerationLog(enabled: boolean) {
  const { listModerationLog } = useUseCases();
  const { data: account } = useAccount();
  return useInfiniteQuery({
    queryKey: keys.moderationLog,
    queryFn: ({ pageParam }) => listModerationLog.execute({ before: pageParam, limit: LOG_PAGE }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length === LOG_PAGE ? (last[last.length - 1]?.id ?? null) : null),
    enabled: enabled && !!account?.isAdmin,
    staleTime: 0,
  });
}

export function useUpdateGame() {
  const { updateGame } = useUseCases();
  return useAdminMutation((i: { packageName: string; name: string; hidden: boolean }) => updateGame.execute(i));
}

export function useImportGame() {
  const { importGameFromPlay } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (i: { packageName: string; updateName: boolean }) => importGameFromPlay.execute(i),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['games'] });
      void client.invalidateQueries({ queryKey: ['game'] });
    },
  });
}

export function useSetGameImage() {
  const { setGameImage } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (i: { packageName: string; kind: GameImageKind; file: GameImageFile | null }) => setGameImage.execute(i),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['games'] });
      void client.invalidateQueries({ queryKey: ['game'] });
    },
  });
}

export function usePlayScreenshots(packageName: string, enabled: boolean) {
  const { listPlayScreenshots } = useUseCases();
  return useQuery({
    queryKey: ['moderation', 'play-screenshots', packageName],
    queryFn: () => listPlayScreenshots.execute(packageName),
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useBackgroundFromPlay() {
  const { useBackgroundFromPlay: fromPlay } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (i: { packageName: string; screenshotId: string }) => fromPlay.execute(i),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['games'] });
      void client.invalidateQueries({ queryKey: ['game'] });
    },
  });
}

export function useDiagnostics(enabled: boolean) {
  const { listDiagnostics } = useUseCases();
  const { data: account } = useAccount();
  return useQuery({
    queryKey: ['diagnostics'],
    queryFn: () => listDiagnostics.execute(),
    enabled: enabled && !!account?.isAdmin,
    staleTime: 0,
  });
}

export function useDeleteDiagnostic() {
  const { deleteDiagnostic } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDiagnostic.execute(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['diagnostics'] }),
  });
}
