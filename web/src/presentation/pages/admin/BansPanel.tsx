import type { BannedAuthor } from '@domain/moderation/Moderation';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert, ErrorAlert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { errorMessage } from '../../lib/errorMessage';
import { formatDate } from '../../lib/format';
import { useBannedAuthors, useUnbanAuthor } from '../../queries/moderation';
import { useAuthor } from '../../queries/profiles';
import { paths } from '../../routes/paths';
import { BanDialog } from './BanDialog';

const USERNAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

/** Buscar a un usuario por su nombre de GitHub para bloquearlo. */
function BanByName() {
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const author = useAuthor(name || undefined);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = input.trim().replace(/^@/, '');
    if (USERNAME.test(clean)) setName(clean);
  };
  return (
    <section className="card space-y-3 p-4" aria-labelledby="bloquear-usuario">
      <h2 id="bloquear-usuario" className="font-semibold">Bloquear a un usuario</h2>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Usuario de GitHub" value={input} maxLength={40}
          onChange={(e) => setInput(e.target.value)} aria-label="Usuario de GitHub" />
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>
      {name && author.isPending && <p className="text-sm text-muted">Buscando…</p>}
      {author.error && <Alert tone="error">{errorMessage(author.error)}</Alert>}
      {name && author.data === null && <p className="text-sm text-muted">No existe o ya está bloqueado para siempre.</p>}
      {author.data && (
        <div className="flex flex-wrap items-center gap-3">
          <Link to={paths.author(author.data.username)} className="font-medium hover:underline">@{author.data.username}</Link>
          <Button size="sm" variant="danger" onClick={() => setOpen(true)}>Bloquear…</Button>
          <BanDialog open={open} onClose={() => setOpen(false)} authorId={author.data.id} username={author.data.username} />
        </div>
      )}
    </section>
  );
}

function BannedRow({ item }: { item: BannedAuthor }) {
  const unban = useUnbanAuthor();
  const [reason, setReason] = useState('');
  return (
    <li className="card space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">@{item.username}</span>
          <span className="text-muted"> · {item.permanent || !item.bannedUntil ? 'para siempre' : `hasta el ${formatDate(item.bannedUntil)} ${item.bannedUntil.toLocaleTimeString('es')}`}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-48 py-1.5 text-sm" placeholder="Motivo (opcional)" maxLength={300} value={reason}
            onChange={(e) => setReason(e.target.value)} aria-label={`Motivo para desbloquear a @${item.username}`} />
          <Button size="sm" variant="secondary" loading={unban.isPending}
            onClick={() => unban.mutate({ authorId: item.id, reason })}>Desbloquear</Button>
        </div>
      </div>
      {unban.error && <Alert tone="error">{errorMessage(unban.error)}</Alert>}
    </li>
  );
}

/** Cuentas bloqueadas (temporal o para siempre) y bloqueo por nombre de usuario. */
export function BansPanel() {
  const list = useBannedAuthors();
  return (
    <div className="space-y-6">
      <BanByName />
      {list.isPending ? <PageSpinner /> : list.error ? <ErrorAlert error={list.error} onRetry={() => void list.refetch()} /> : (
        list.data.length === 0 ? <EmptyState title="No hay cuentas bloqueadas" /> : (
          <ul className="space-y-2">{list.data.map((b) => <BannedRow key={b.id} item={b} />)}</ul>
        )
      )}
    </div>
  );
}
