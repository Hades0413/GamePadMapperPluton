import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useAccount, useSignOut } from '../../queries/account';
import { paths } from '../../routes/paths';
import { SignInButton } from '../auth/SignInButton';
import { Avatar } from '../ui/Avatar';
import { UploadIcon } from '../ui/icons';

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
  if (!account) return <SignInButton label="Entrar" size="sm" />;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-primary/50"
        aria-label={`Cuenta de ${account.username}`}>
        <Avatar author={account} size={34} />
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-50 mt-2 w-56 overflow-hidden p-1 shadow-xl shadow-black/40">
          <p className="truncate px-3 py-2 text-sm text-muted">@{account.username}</p>
          <Link role="menuitem" to={paths.account} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
            Mis perfiles y cuenta
          </Link>
          <Link role="menuitem" to={paths.author(account.username)} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
            Mi página pública
          </Link>
          {account.isAdmin && (
            <Link role="menuitem" to={paths.admin} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
              Moderación
            </Link>
          )}
          <button role="menuitem" type="button" onClick={() => signOut.mutate()}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface-2">
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
        <Logo />
        <nav className="flex items-center gap-1" aria-label="Principal">
          <NavLink to={paths.games} className={navClass}>Juegos</NavLink>
          <NavLink to={paths.upload()} className={navClass}>
            <span className="flex items-center gap-1.5"><UploadIcon /><span className="hidden sm:inline">Subir perfil</span><span className="sm:hidden">Subir</span></span>
          </NavLink>
          <div className="ml-2"><AccountMenu /></div>
        </nav>
      </div>
    </header>
  );
}
