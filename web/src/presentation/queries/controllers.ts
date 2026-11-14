import type { MappingStatus } from '@domain/controller/ControllerMapping';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUseCases } from '../di/ServicesContext';
import { useAccount } from './account';

const ROOT = ['controllers'] as const;

export function useApprovedMappings(search: string) {
  const { listApprovedMappings } = useUseCases();
  return useQuery({
    queryKey: [...ROOT, 'approved', search],
    queryFn: () => listApprovedMappings.execute({ search }),
    staleTime: 60_000,
  });
}

export function useMyMappings() {
  const { listMyMappings } = useUseCases();
  const { data: account } = useAccount();
  return useQuery({
    queryKey: [...ROOT, 'mine', account?.id ?? ''],
    queryFn: () => listMyMappings.execute(account?.id ?? ''),
    enabled: !!account,
    staleTime: 0,
  });
}

function useControllerMutation<T, R>(fn: (input: T) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void client.invalidateQueries({ queryKey: ROOT }),
  });
}

export function useSubmitMapping() {
  const { submitMapping } = useUseCases();
  return useControllerMutation((line: string) => submitMapping.execute(line));
}

export function useDeleteMapping() {
  const { deleteMapping } = useUseCases();
  return useControllerMutation((id: string) => deleteMapping.execute(id));
}

export function useMappingsForReview(status: MappingStatus) {
  const { listMappingsForReview } = useUseCases();
  const { data: account } = useAccount();
  return useQuery({
    queryKey: [...ROOT, 'review', status],
    queryFn: () => listMappingsForReview.execute(status),
    enabled: !!account?.isAdmin,
    staleTime: 0,
  });
}

export function useReviewMapping() {
  const { reviewMapping } = useUseCases();
  return useControllerMutation((input: { id: string; approve: boolean }) => reviewMapping.execute(input));
}
