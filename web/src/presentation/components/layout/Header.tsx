import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useT } from '../../i18n/I18nContext';
import { useAccount, useSignOut } from '../../queries/account';
import { paths } from '../../routes/paths';
import { SignInButton } from '../auth/SignInButton';
import { Avatar } from '../ui/Avatar';
import { UploadIcon } from '../ui/icons';
import { LanguageSwitcher } from './LanguageSwitcher';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-ink bg-surface-2' : 'text-muted hover:text-ink'}`;

export function Logo() {
  return (
    <Link to={paths.home} className="flex items-center gap-2.5 font-bold tracking-tight">
      <span className="flex size-9 items-center justify-center overflow-hidden rounded-xl bg-brand">
        <img src={`${import.meta.env.BASE_URL}icon-fg.png`} alt="" width={36} height={36} className="scale-150" />
      </span>
      <span className="hidden sm:inline">Gamepad Mapper <span className="text-primary">Plutón</span></span>
    </Link>
  );
}

function AccountMenu() {
  const { data: account, isPending } = useAccount();
  const signOut = useSignOut();
  const t = useT();
  const location = useLocation();
  // El menu se cierra solo al cambiar de pagina: recuerda en que ruta se abrio.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === location.pathname;
  const setOpen = (value: boolean | ((v: boolean) => boolean)) =>
    setOpenAt((typeof value === 'function' ? value(open) : value) ? location.pathname : null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpenAt(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  if (isPending) return <span className="size-9" />;
  if (!account) return <SignInButton label={t('Entrar')} size="sm" />;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-primary/50"
        aria-label={t('Cuenta de {name}', { name: account.username })}>
        <Avatar author={account} size={34} />
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-50 mt-2 w-56 overflow-hidden p-1 shadow-xl shadow-black/40">
          <p className="truncate px-3 py-2 text-sm text-muted">@{account.username}</p>
          <Link role="menuitem" to={paths.account} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
            {t('Mis perfiles y cuenta')}
          </Link>
          <Link role="menuitem" to={paths.author(account.username)} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
            {t('Mi página pública')}
          </Link>
          {account.isAdmin && (
            <Link role="menuitem" to={paths.admin} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
              {t('Moderación')}
            </Link>
          )}
          <button role="menuitem" type="button" onClick={() => signOut.mutate()}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface-2">
            {t('Cerrar sesión')}
          </button>
        </div>
      )}
    </div>
  );
}

function NavLinks({ mobile }: { mobile?: boolean }) {
  const t = useT();
  const cls = (a: { isActive: boolean }) => navClass(a) + (mobile ? ' flex min-h-11 items-center' : '');
  return (
    <>
      <NavLink to={paths.games} className={cls}>{t('Juegos')}</NavLink>
      <NavLink to={paths.editor} className={cls}>{t('Editor visual')}</NavLink>
      <NavLink to={paths.upload()} className={cls}>
        <span className="flex items-center gap-1.5"><UploadIcon />{t('Subir perfil')}</span>
      </NavLink>
    </>
  );
}

export function Header() {
  const t = useT();
  const location = useLocation();
  // El menu movil se cierra solo al cambiar de pagina: recuerda en que ruta se abrio.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === location.pathname;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpenAt(null);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Logo />
        <div className="flex min-w-0 items-center gap-1">
          <nav className="hidden items-center gap-1 lg:flex" aria-label={t('Principal')}>
            <NavLinks />
          </nav>
          <div className="ml-2 hidden lg:block"><LanguageSwitcher /></div>
          <div className="ml-1 lg:ml-2"><AccountMenu /></div>
          <button ref={buttonRef} type="button" aria-expanded={open} aria-controls="menu-movil"
            aria-label={open ? t('Cerrar menú') : t('Abrir menú')}
            onClick={() => setOpenAt(open ? null : location.pathname)}
            className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink lg:hidden">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div id="menu-movil" className="border-t border-line/70 bg-bg lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            <nav className="flex flex-col gap-1" aria-label={t('Principal')}>
              <NavLinks mobile />
            </nav>
            <div className="mt-2 self-start"><LanguageSwitcher /></div>
          </div>
        </div>
      )}
    </header>
  );
}
