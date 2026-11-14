import { useDeferredValue } from 'react';
import { useSearchParams } from 'react-router';
import { GameCard } from '../components/profile/GameCard';
import { ErrorAlert } from '../components/ui/Alert';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SearchIcon } from '../components/ui/icons';
import { LoadMore } from '../components/ui/LoadMore';
import { PageSpinner } from '../components/ui/Spinner';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useGames } from '../queries/games';
import { paths } from '../routes/paths';

export default function GamesPage() {
  useDocumentTitle('Juegos', 'Perfiles de mando para juegos de Android subidos por la comunidad.');
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  // Espera a que el usuario deje de escribir antes de buscar (menos peticiones).
  const deferred = useDeferredValue(search);
  const { data, isPending, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useGames(deferred.trim());
  const games = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Juegos</h1>
          <p className="mt-1 text-muted">Elige tu juego para ver los perfiles que ha subido la comunidad.</p>
        </div>
        <ButtonLink to={paths.upload()} variant="secondary">Subir un perfil</ButtonLink>
      </div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input type="search" className="input pl-9" placeholder="Buscar juego…" aria-label="Buscar juego"
          maxLength={40} value={search}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })} />
      </div>
      {isPending ? <PageSpinner /> : error ? <ErrorAlert error={error} onRetry={() => void refetch()} /> : games.length === 0 ? (
        <EmptyState title={search ? 'No hay juegos con ese nombre' : 'Todavía no hay perfiles'}>
          ¿No está tu juego? Crea el perfil con la burbuja de la app y súbelo.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => <GameCard key={g.packageName} game={g} />)}
          </div>
          <LoadMore hasMore={!!hasNextPage} loading={isFetchingNextPage} onClick={() => void fetchNextPage()} />
        </>
      )}
    </div>
  );
}
