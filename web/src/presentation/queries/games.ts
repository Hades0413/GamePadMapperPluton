import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
