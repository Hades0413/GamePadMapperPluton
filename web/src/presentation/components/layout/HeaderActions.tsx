import { NavLink } from 'react-router';
import { useT } from '../../i18n/I18nContext';
import { useAccount } from '../../queries/account';
import { useUnreadNotifications } from '../../queries/notifications';
import { paths } from '../../routes/paths';
import { BellIcon, SearchIcon } from '../ui/icons';

const iconClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 hover:text-ink ${
    isActive ? 'bg-surface-2 text-ink' : 'text-muted'}`;

/** Acceso a la busqueda de perfiles de todos los juegos. */
export function SearchLink() {
  const t = useT();
  return (
    <NavLink to={paths.search()} className={iconClass} aria-label={t('Buscar perfiles')} title={t('Buscar perfiles')}>
      <SearchIcon className="size-5" />
    </NavLink>
  );
}

/** Campana de avisos con el numero de avisos sin leer (solo con sesion iniciada). */
export function NotificationBell() {
  const t = useT();
  const { data: account } = useAccount();
  const unread = useUnreadNotifications();
  if (!account) return null;
  const count = unread.data ?? 0;
  const label = count > 0 ? t('Avisos: {n} sin leer', { n: count }) : t('Avisos');
  return (
    <NavLink to={paths.notifications} className={iconClass} aria-label={label} title={label}>
      <BellIcon className="size-5" />
      {count > 0 && (
        <span aria-hidden="true"
          className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-bold text-bg">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
}
