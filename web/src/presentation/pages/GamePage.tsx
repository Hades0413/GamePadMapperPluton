import { useDeferredValue, useState } from 'react';
import { useParams } from 'react-router';
import { ratioLabel, ratioOf, visitorScreen } from '../lib/device';
import { GameIcon } from '../components/profile/GameIcon';
import { ProfileCard } from '../components/profile/ProfileCard';
import { ProfileFiltersBar } from '../components/profile/ProfileFiltersBar';
import { ErrorAlert } from '../components/ui/Alert';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { UploadIcon } from '../components/ui/icons';
import { LoadMore } from '../components/ui/LoadMore';
import { PageSpinner } from '../components/ui/Spinner';
import { useT } from '../i18n/I18nContext';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { NO_FILTERS, useProfileFilterParams } from '../lib/useProfileFilterParams';
import { useGame } from '../queries/games';
import { useDeviceModels, useGameProfiles, useLiked } from '../queries/profiles';
import { paths } from '../routes/paths';
import NotFoundPage from './NotFoundPage';

export default function GamePage() {
  const t = useT();
  const { packageName = '' } = useParams();
  const [myScreen] = useState(visitorScreen);
  // El estado de los filtros vive en la URL: se puede compartir y volver atras.
  const [filters, update] = useProfileFilterParams(myScreen !== null);
  const deferredSearch = useDeferredValue(filters.search.trim());

  const game = useGame(packageName);
  const devices = useDeviceModels(packageName);
  const profiles = useGameProfiles(packageName, filters.sort, {
    search: deferredSearch,
    brand: filters.brand,
    model: filters.model,
    ratio: filters.onlyMine && myScreen ? ratioOf(myScreen) : null,
    tag: filters.tag,
    controllerType: filters.controllerType,
  });
  const items = profiles.data?.pages.flatMap((p) => p.items) ?? [];
  const liked = useLiked(items.map((p) => p.id));
  const filtering = !!(filters.search || filters.brand || filters.model || filters.onlyMine || filters.tag || filters.controllerType);
  useDocumentTitle(game.data?.name, game.data ? t('Perfiles de mando para {name}.', { name: game.data.name }) : undefined);

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
        <ButtonLink to={paths.upload(game.data.packageName)} icon={<UploadIcon />}>{t('Subir mi perfil')}</ButtonLink>
      </div>

      <ProfileFiltersBar value={filters} onChange={update} models={devices.data ?? []}
        myScreenLabel={myScreen ? ratioLabel(myScreen) : null} />

      {profiles.isPending ? <PageSpinner /> : profiles.error ? (
        <ErrorAlert error={profiles.error} onRetry={() => void profiles.refetch()} />
      ) : items.length === 0 ? (
        filtering ? (
          <EmptyState title={t('Ningún perfil coincide con esos filtros')}
            action={<button type="button" className="text-primary hover:underline"
              onClick={() => update(NO_FILTERS)}>{t('Quitar filtros')}</button>} />
        ) : (
          <EmptyState title={t('Aún no hay perfiles para este juego')}
            action={<ButtonLink to={paths.upload(game.data.packageName)}>{t('Subir el primero')}</ButtonLink>} />
        )
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
