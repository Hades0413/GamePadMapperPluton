import type { ProfileSort } from '@domain/profile/GameProfile';
import { useSearchParams } from 'react-router';
import type { FilterState } from '../components/profile/ProfileFiltersBar';

const SORT_PARAM: Record<ProfileSort, string> = { popular: '', installs: 'instalados', rating: 'valorados', recent: 'recientes' };

function sortFromParam(v: string | null): ProfileSort {
  const found = (Object.entries(SORT_PARAM) as [ProfileSort, string][]).find(([, p]) => p && p === v);
  return found ? found[0] : 'popular';
}

export const NO_FILTERS: Partial<FilterState> = { search: '', brand: '', model: '', onlyMine: false, tag: '' };

/**
 * Filtros de una lista de perfiles guardados en la URL (?q=&orden=&marca=&modelo=&pantalla=&etiqueta=):
 * se pueden compartir y el boton atras funciona. Los valores se sanean despues, en el caso de uso.
 */
export function useProfileFilterParams(hasScreen: boolean): [FilterState, (patch: Partial<FilterState>) => void] {
  const [params, setParams] = useSearchParams();
  const filters: FilterState = {
    search: (params.get('q') ?? '').slice(0, 40),
    sort: sortFromParam(params.get('orden')),
    brand: (params.get('marca') ?? '').slice(0, 60),
    model: (params.get('modelo') ?? '').slice(0, 60),
    onlyMine: params.get('pantalla') === 'mia' && hasScreen,
    tag: (params.get('etiqueta') ?? '').slice(0, 30),
  };
  const update = (patch: Partial<FilterState>) => setParams((p) => {
    const next = new URLSearchParams(p);
    const v = { ...filters, ...patch };
    const put = (k: string, val: string) => (val ? next.set(k, val) : next.delete(k));
    put('q', v.search);
    put('orden', SORT_PARAM[v.sort]);
    put('marca', v.brand);
    put('modelo', v.model);
    put('pantalla', v.onlyMine ? 'mia' : '');
    put('etiqueta', v.tag);
    return next;
  }, { replace: true });
  return [filters, update];
}
