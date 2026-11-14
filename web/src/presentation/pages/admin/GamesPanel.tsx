import type { Game } from '@domain/game/Game';
import { useDeferredValue, useState } from 'react';
import { GameIcon } from '../../components/profile/GameIcon';
import { ErrorAlert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchIcon } from '../../components/ui/icons';
import { PageSpinner } from '../../components/ui/Spinner';
import { useGames } from '../../queries/games';
import { GameDetail } from './GameDetail';

const missing = (g: Game) => !g.iconUrl || !g.backgroundUrl;

function missingLabel(g: Game): string | null {
  if (!g.iconUrl && !g.backgroundUrl) return 'Falta icono y captura';
  if (!g.iconUrl) return 'Falta icono';
  if (!g.backgroundUrl) return 'Falta captura';
  return null;
}

function GameRow({ game, selected, onSelect }: { game: Game; selected: boolean; onSelect: () => void }) {
  const label = missingLabel(game);
  return (
    <li>
      <button type="button" onClick={onSelect} aria-current={selected}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
          selected ? 'bg-primary-strong/20 ring-1 ring-primary/60' : 'hover:bg-surface-2'}`}>
        <GameIcon name={game.name} iconUrl={game.iconUrl} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{game.name}</span>
          <span className={`block truncate text-xs ${label ? 'text-warning' : 'text-success'}`}>
            {label ?? 'Completo'} · {game.profileCount} {game.profileCount === 1 ? 'perfil' : 'perfiles'}
          </span>
        </span>
      </button>
    </li>
  );
}

export function GamesPanel() {
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const deferred = useDeferredValue(search.trim());
  const { data, isPending, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useGames(deferred);
  const games = data?.pages.flatMap((p) => p.items) ?? [];
  const pending = games.filter(missing).length;
  const shown = onlyMissing ? games.filter(missing) : games;
  const current = games.find((g) => g.packageName === selected) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:items-start">
      <aside className={`card space-y-3 p-3 lg:sticky lg:top-20 ${current ? 'hidden lg:block' : ''}`}>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input type="search" className="input pl-9" placeholder="Buscar juego…" value={search} maxLength={40}
            onChange={(e) => setSearch(e.target.value)} aria-label="Buscar juego" />
        </div>
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm" role="tablist" aria-label="Filtro">
          {([[false, `Todos (${games.length})`], [true, `Por completar (${pending})`]] as const).map(([value, label]) => (
            <button key={label} type="button" role="tab" aria-selected={onlyMissing === value}
              onClick={() => setOnlyMissing(value)}
              className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${onlyMissing === value ? 'bg-surface text-ink' : 'text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        {isPending ? <PageSpinner /> : error ? <ErrorAlert error={error} onRetry={() => void refetch()} /> : shown.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">
            {onlyMissing ? '¡Todos los juegos tienen icono y captura!' : 'No hay juegos con ese nombre.'}
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
            {shown.map((g) => (
              <GameRow key={g.packageName} game={g} selected={g.packageName === selected}
                onSelect={() => setSelected(g.packageName)} />
            ))}
          </ul>
        )}
        {hasNextPage && (
          <Button size="sm" variant="ghost" className="w-full" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
            Cargar más juegos
          </Button>
        )}
      </aside>

      <div className={current ? '' : 'hidden lg:block'}>
        {current ? (
          <GameDetail game={current} onBack={() => setSelected(null)} />
        ) : (
          <EmptyState title="Elige un juego de la lista">
            Ahí podrás traer su icono de Google Play, subir una captura para la vista previa y cambiar su nombre.
          </EmptyState>
        )}
      </div>
    </div>
  );
}
