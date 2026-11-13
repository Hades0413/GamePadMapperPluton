import type { ProfileStatus } from '@domain/profile/GameProfile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  return useAdminMutation((i: { authorId: string; banned: boolean }) => banAuthor.execute(i));
}

export function useUpdateGame() {
  const { updateGame } = useUseCases();
  return useAdminMutation((i: { packageName: string; name: string; iconUrl: string; hidden: boolean }) =>
    updateGame.execute(i),
  );
}
