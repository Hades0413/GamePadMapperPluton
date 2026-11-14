import type { Game } from '@domain/game/Game';
import { Link } from 'react-router';
import { useT } from '../../i18n/I18nContext';
import { paths } from '../../routes/paths';
import { GameIcon } from './GameIcon';

export function GameCard({ game }: { game: Game }) {
  const t = useT();
  return (
    <Link to={paths.game(game.packageName)}
      className="card group flex items-center gap-4 p-4 transition-colors hover:border-primary/60">
      <GameIcon name={game.name} iconUrl={game.iconUrl} />
      <div className="min-w-0">
        <p className="truncate font-semibold group-hover:text-primary">{game.name}</p>
        <p className="text-sm text-muted">
          {game.profileCount === 1 ? t('1 perfil') : t('{n} perfiles', { n: game.profileCount })}
        </p>
      </div>
    </Link>
  );
}
