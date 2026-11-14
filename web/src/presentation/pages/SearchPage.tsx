import { useDeferredValue, useState } from 'react';
import { ProfileCard } from '../components/profile/ProfileCard';
import { ProfileFiltersBar } from '../components/profile/ProfileFiltersBar';
import { ErrorAlert } from '../components/ui/Alert';
import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadMore } from '../components/ui/LoadMore';
import { PageSpinner } from '../components/ui/Spinner';
import { useT } from '../i18n/I18nContext';
import { ratioLabel, ratioOf, visitorScreen } from '../lib/device';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { NO_FILTERS, useProfileFilterParams } from '../lib/useProfileFilterParams';
import { useDeviceModels, useLiked, useSearchProfiles } from '../queries/profiles';
import { paths } from '../routes/paths';

/** Busqueda de perfiles en todos los juegos. Los filtros viven en la URL (se pueden compartir). */
export default function SearchPage() {
  const t = useT();
  const [myScreen] = useState(visitorScreen);
  const [filters, update] = useProfileFilterParams(myScreen !== null);
  const deferredSearch = useDeferredValue(filters.search.trim());
  const devices = useDeviceModels('');
  const profiles = useSearchProfiles(filters.sort, {
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
  useDocumentTitle(t('Buscar perfiles'), t('Busca perfiles de mando en todos los juegos: por texto, etiqueta, marca, modelo o pantalla.'));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('Buscar perfiles')}</h1>
        <p className="mt-1 text-muted">{t('En todos los juegos: por título, descripción o nombre del juego.')}</p>
      </div>

      <div role="search">
        <ProfileFiltersBar value={filters} onChange={update} models={devices.data ?? []}
          myScreenLabel={myScreen ? ratioLabel(myScreen) : null}
          placeholder={t('Buscar perfiles o juegos…')} />
      </div>

      <div aria-busy={profiles.isFetching}>
        {profiles.isPending ? <PageSpinner /> : profiles.error ? (
          <ErrorAlert error={profiles.error} onRetry={() => void profiles.refetch()} />
        ) : items.length === 0 ? (
          filtering ? (
            <EmptyState title={t('Ningún perfil coincide con esos filtros')}
              action={<button type="button" className="text-primary hover:underline" onClick={() => update(NO_FILTERS)}>
                {t('Quitar filtros')}
              </button>} />
          ) : (
            <EmptyState title={t('Aún no hay perfiles')} action={<ButtonLink to={paths.upload()}>{t('Subir el primero')}</ButtonLink>} />
          )
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <ProfileCard key={p.id} profile={p} liked={liked.data?.has(p.id) ?? false} myScreen={myScreen} showGame />
              ))}
            </div>
            <LoadMore hasMore={!!profiles.hasNextPage} loading={profiles.isFetchingNextPage}
              onClick={() => void profiles.fetchNextPage()} />
          </div>
        )}
      </div>
    </div>
  );
}
