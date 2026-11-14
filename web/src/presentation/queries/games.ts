import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUseCases } from '../di/ServicesContext';
import { keys } from './keys';

export function useGames(search: string, size?: number) {
  const { listGames } = useUseCases();
  return useInfiniteQuery({
    queryKey: [...keys.games(search), size ?? 0],
    queryFn: ({ pageParam }) => listGames.execute({ search, page: pageParam, ...(size ? { size } : {}) }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
    placeholderData: keepPreviousData,
  });
}

export function useGame(packageName: string | undefined) {
  const { getGame } = useUseCases();
  return useQuery({
    queryKey: keys.game(packageName ?? ''),
    queryFn: () => getGame.execute(packageName ?? ''),
    enabled: !!packageName,
    staleTime: 5 * 60_000,
  });
}

/** Completa icono y captura desde Google Play (solo lo que falte). */
export function useFillGameImages() {
  const { fillGameImages } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (packageName: string) => fillGameImages.execute(packageName),
    onSettled: (_r, _e, packageName) => {
      void client.invalidateQueries({ queryKey: keys.game(packageName) });
      void client.invalidateQueries({ queryKey: ['games'] });
    },
  });
}
