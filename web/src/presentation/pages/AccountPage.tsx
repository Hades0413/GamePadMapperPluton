import type { Account } from '@domain/author/Author';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { ProfileCard } from '../components/profile/ProfileCard';
import { Alert, ErrorAlert } from '../components/ui/Alert';
import { errorMessage } from '../lib/errorMessage';
import { Avatar } from '../components/ui/Avatar';
import { Button, ButtonLink } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadMore } from '../components/ui/LoadMore';
import { PageSpinner } from '../components/ui/Spinner';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useDeleteAccount, useSignOut } from '../queries/account';
import { useAuthorProfiles } from '../queries/profiles';
import { paths } from '../routes/paths';

function DeleteAccount({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const remove = useDeleteAccount();
  const navigate = useNavigate();
  return (
    <section className="card space-y-3 border-danger/30 p-5">
      <h2 className="font-semibold text-danger">Borrar mi cuenta</h2>
      <p className="text-sm text-muted">Borra tu cuenta, todos tus perfiles, tus «me gusta» y tus reportes. No se puede deshacer.</p>
      <Button variant="danger" onClick={() => setOpen(true)}>Borrar mi cuenta</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="¿Borrar tu cuenta para siempre?">
        <p className="text-sm text-muted">Escribe <strong className="text-ink">{account.username}</strong> para confirmar.</p>
        <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Nombre de usuario"
          autoComplete="off" />
        {remove.error && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="danger" disabled={confirm.trim() !== account.username} loading={remove.isPending}
            onClick={() => remove.mutate(undefined, { onSuccess: () => void navigate(paths.home, { replace: true }) })}>
            Borrar todo
          </Button>
        </div>
      </Dialog>
    </section>
  );
}

function MyProfiles({ account }: { account: Account }) {
  const profiles = useAuthorProfiles(account.id);
  const items = profiles.data?.pages.flatMap((p) => p.items) ?? [];
  if (profiles.isPending) return <PageSpinner />;
  if (profiles.error) return <ErrorAlert error={profiles.error} onRetry={() => void profiles.refetch()} />;
  if (items.length === 0) {
    return <EmptyState title="Aún no has subido perfiles" action={<ButtonLink to={paths.upload()}>Subir mi primer perfil</ButtonLink>} />;
  }
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => <ProfileCard key={p.id} profile={p} showGame />)}
      </div>
      <LoadMore hasMore={!!profiles.hasNextPage} loading={profiles.isFetchingNextPage} onClick={() => void profiles.fetchNextPage()} />
    </>
  );
}

export default function AccountPage() {
  useDocumentTitle('Mi cuenta');
  const signOut = useSignOut();
  return (
    <RequireAccount reason="Inicia sesión para ver tus perfiles.">
      {(account) => (
        <div className="space-y-10">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar author={account} size={64} />
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{account.username}</h1>
              <p className="text-sm text-muted">Sesión iniciada con GitHub</p>
            </div>
            <Button variant="secondary" loading={signOut.isPending} onClick={() => signOut.mutate()}>Cerrar sesión</Button>
          </div>
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Mis perfiles</h2>
              <ButtonLink to={paths.upload()} size="sm">Subir otro</ButtonLink>
            </div>
            <MyProfiles account={account} />
          </section>
          <DeleteAccount account={account} />
        </div>
      )}
    </RequireAccount>
  );
}
