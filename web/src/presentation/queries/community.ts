import type { ProfileTag } from '@domain/profile/GameProfile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUseCases } from '../di/ServicesContext';
import { keys } from './keys';

export function useComments(profileId: string) {
  const { listComments } = useUseCases();
  return useQuery({ queryKey: ['comments', profileId], queryFn: () => listComments.execute(profileId) });
}

export function useAddComment(profileId: string) {
  const { addComment } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addComment.execute({ profileId, body }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['comments', profileId] }),
  });
}

export function useDeleteComment(profileId: string) {
  const { deleteComment } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment.execute(commentId),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['comments', profileId] }),
  });
}

export function useVersions(profileId: string, enabled: boolean) {
  const { listVersions } = useUseCases();
  return useQuery({ queryKey: ['versions', profileId], queryFn: () => listVersions.execute(profileId), enabled });
}

export function useSetTags() {
  const { setProfileTags } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { profileId: string; tags: readonly ProfileTag[] }) => setProfileTags.execute(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.allProfiles }),
  });
}

export function useFeatured() {
  const { listFeaturedProfiles } = useUseCases();
  return useQuery({ queryKey: [...keys.allProfiles, 'featured'], queryFn: () => listFeaturedProfiles.execute(6), staleTime: 5 * 60_000 });
}

export function useFeatureProfile() {
  const { featureProfile } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { profileId: string; on: boolean }) => featureProfile.execute(input),
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.allProfiles }),
  });
}
