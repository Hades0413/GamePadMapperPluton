import { brandOf, PROFILE_SORTS, type ProfileSort } from '@domain/profile/GameProfile';
import { useMemo } from 'react';
import { useT } from '../../i18n/I18nContext';
import { SearchIcon } from '../ui/icons';

const SORT_LABEL: Record<ProfileSort, string> = {
  popular: 'Más gustados',
  installs: 'Más instalados',
  rating: 'Mejor valorados',
  recent: 'Más recientes',
};

export interface FilterState {
  search: string;
  sort: ProfileSort;
  brand: string;
  model: string;
  onlyMine: boolean;
}

/** Barra de busqueda y filtros de los perfiles de un juego. */
export function ProfileFiltersBar({
  value, onChange, models, myScreenLabel,
}: {
  value: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  models: readonly string[];
  /** «20:9» si se conoce la pantalla del visitante (movil); null si no. */
  myScreenLabel: string | null;
}) {
  const t = useT();
  const brands = useMemo(() => [...new Set(models.map(brandOf).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [models]);
  const brandModels = useMemo(
    () => (value.brand ? models.filter((m) => brandOf(m).toLowerCase() === value.brand.toLowerCase()) : models),
    [models, value.brand],
  );
  const active = value.search || value.brand || value.model || value.onlyMine;
  const select = 'input w-auto min-w-0 py-1.5 text-sm';

  return (
    <div className="card space-y-3 p-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input type="search" className="input pl-9" placeholder={t('Buscar en títulos y descripciones…')} maxLength={40}
          value={value.search} onChange={(e) => onChange({ search: e.target.value })} aria-label={t('Buscar perfil')} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          {t('Ordenar')}
          <select className={select} value={value.sort} onChange={(e) => onChange({ sort: e.target.value as ProfileSort })}>
            {PROFILE_SORTS.map((s) => <option key={s} value={s}>{t(SORT_LABEL[s])}</option>)}
          </select>
        </label>
        <select className={select} value={value.brand} aria-label={t('Marca')}
          onChange={(e) => onChange({ brand: e.target.value, model: '' })} disabled={brands.length === 0}>
          <option value="">{brands.length ? t('Todas las marcas') : t('Sin marcas aún')}</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className={select} value={value.model} aria-label={t('Modelo')}
          onChange={(e) => onChange({ model: e.target.value })} disabled={brandModels.length === 0}>
          <option value="">{brandModels.length ? t('Todos los modelos') : t('Sin modelos aún')}</option>
          {brandModels.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {myScreenLabel && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="accent-primary-strong" checked={value.onlyMine}
              onChange={(e) => onChange({ onlyMine: e.target.checked })} />
            {t('Encajan con mi pantalla ({ratio})', { ratio: myScreenLabel })}
          </label>
        )}
        {active && (
          <button type="button" className="ml-auto text-sm text-primary hover:underline"
            onClick={() => onChange({ search: '', brand: '', model: '', onlyMine: false })}>
            {t('Quitar filtros')}
          </button>
        )}
      </div>
    </div>
  );
}
