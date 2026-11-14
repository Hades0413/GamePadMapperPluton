import type { ProfileSort } from '@domain/profile/GameProfile';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ratioLabel, ratioOf, visitorScreen } from '../lib/device';
import { GameIcon } from '../components/profile/GameIcon';
import { ProfileCard } from '../components/profile/ProfileCard';
import { ErrorAlert } from '../components/ui/Alert';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { UploadIcon } from '../components/ui/icons';
import { LoadMore } from '../components/ui/LoadMore';
import { PageSpinner } from '../components/ui/Spinner';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useGame } from '../queries/games';
import { useGameProfiles, useLiked } from '../queries/profiles';
import { paths } from '../routes/paths';
import NotFoundPage from './NotFoundPage';

const SORTS: [ProfileSort, string][] = [['popular', 'Populares'], ['recent', 'Recientes']];

export default function GamePage() {
  const { packageName = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const sort: ProfileSort = params.get('orden') === 'recientes' ? 'recent' : 'popular';
  const game = useGame(packageName);
  const [myScreen] = useState(visitorScreen);
  const onlyMine = params.get('pantalla') === 'mia' && myScreen !== null;
  const profiles = useGameProfiles(packageName, sort, onlyMine && myScreen ? ratioOf(myScreen) : null);
  const items = profiles.data?.pages.flatMap((p) => p.items) ?? [];
  const liked = useLiked(items.map((p) => p.id));
  useDocumentTitle(game.data?.name, game.data ? `Perfiles de mando para ${game.data.name}.` : undefined);

  if (game.isPending) return <PageSpinner />;
  if (game.error) return <ErrorAlert error={game.error} onRetry={() => void game.refetch()} />;
  if (!game.data) return <NotFoundPage />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <GameIcon name={game.data.name} iconUrl={game.data.iconUrl} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">{game.data.name}</h1>
          <p className="truncate font-mono text-sm text-muted">{game.data.packageName}</p>
        </div>
        <ButtonLink to={paths.upload(game.data.packageName)} icon={<UploadIcon />}>Subir mi perfil</ButtonLink>
      </div>

      <div role="tablist" aria-label="Orden" className="inline-flex rounded-xl border border-line bg-surface p-1">
        {SORTS.map(([value, label]) => (
          <button key={value} role="tab" type="button" aria-selected={sort === value}
            onClick={() => setParams((p) => {
              const next = new URLSearchParams(p);
              if (value === 'recent') next.set('orden', 'recientes'); else next.delete('orden');
              return next;
            }, { replace: true })}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${sort === value ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {myScreen && (
        <label className="ml-0 inline-flex cursor-pointer items-center gap-2 text-sm sm:ml-3">
          <input type="checkbox" className="accent-primary-strong" checked={onlyMine} onChange={(e) => setParams((p) => {
            const next = new URLSearchParams(p);
            if (e.target.checked) next.set('pantalla', 'mia'); else next.delete('pantalla');
            return next;
          }, { replace: true })} />
          Solo los que encajan con mi pantalla ({ratioLabel(myScreen)})
        </label>
      )}

      {profiles.isPending ? <PageSpinner /> : profiles.error ? (
        <ErrorAlert error={profiles.error} onRetry={() => void profiles.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={onlyMine ? 'No hay perfiles hechos con tu proporción de pantalla' : 'Aún no hay perfiles para este juego'}
          action={<ButtonLink to={paths.upload(game.data.packageName)}>Subir el primero</ButtonLink>} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => <ProfileCard key={p.id} profile={p} liked={liked.data?.has(p.id) ?? false} myScreen={myScreen} />)}
          </div>
          <LoadMore hasMore={!!profiles.hasNextPage} loading={profiles.isFetchingNextPage}
            onClick={() => void profiles.fetchNextPage()} />
        </>
      )}
    </div>
  );
}
