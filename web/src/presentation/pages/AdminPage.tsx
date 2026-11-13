import type { ReportedProfile } from '@application/ports/ModerationRepository';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { Alert, ErrorAlert } from '../components/ui/Alert';
import { errorMessage } from '../lib/errorMessage';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { timeAgo } from '../lib/format';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useBanAuthor, useModerateProfile, useReportedProfiles, useUpdateGame } from '../queries/moderation';
import { useDeleteProfile } from '../queries/profiles';
import { paths } from '../routes/paths';

function ReportedRow({ item }: { item: ReportedProfile }) {
  const moderate = useModerateProfile();
  const remove = useDeleteProfile();
  const ban = useBanAuthor();
  const error = moderate.error ?? remove.error ?? ban.error;
  return (
    <li className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={paths.profile(item.id)} className="font-semibold hover:text-primary">{item.title}</Link>
          <p className="text-xs text-muted">{item.packageName} · @{item.username} · {timeAgo(item.createdAt)}</p>
        </div>
        <span className={`rounded px-2 py-0.5 text-xs ${item.status === 'hidden' ? 'bg-warning/20 text-warning' : 'bg-success/15 text-success'}`}>
          {item.status === 'hidden' ? 'Oculto' : 'Publicado'} · {item.reportCount} reportes
        </span>
      </div>
      {item.reasons.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-muted">{item.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}
      {error && <Alert tone="error">{errorMessage(error)}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={moderate.isPending}
          onClick={() => moderate.mutate({ id: item.id, status: 'published', clearReports: true })}>Publicar y descartar reportes</Button>
        <Button size="sm" variant="secondary" disabled={item.status === 'hidden'}
          onClick={() => moderate.mutate({ id: item.id, status: 'hidden', clearReports: false })}>Ocultar</Button>
        <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate(item.id)}>Borrar</Button>
        <Button size="sm" variant="danger" loading={ban.isPending}
          onClick={() => window.confirm(`¿Bloquear a @${item.username}? Se ocultarán todos sus perfiles.`) &&
            ban.mutate({ authorId: item.authorId, banned: true })}>
          Bloquear autor
        </Button>
      </div>
    </li>
  );
}

function GameEditor() {
  const update = useUpdateGame();
  const [form, setForm] = useState({ packageName: '', name: '', iconUrl: '', hidden: false });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(form);
  };
  return (
    <form onSubmit={submit} className="card grid gap-3 p-5 sm:grid-cols-2">
      <h2 className="font-semibold sm:col-span-2">Editar un juego</h2>
      <input className="input font-mono text-sm" placeholder="Paquete (com.empresa.juego)" value={form.packageName}
        onChange={(e) => setForm({ ...form, packageName: e.target.value })} aria-label="Paquete" />
      <input className="input" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
        aria-label="Nombre" />
      <input className="input sm:col-span-2" placeholder="Icono https://… (opcional)" value={form.iconUrl}
        onChange={(e) => setForm({ ...form, iconUrl: e.target.value })} aria-label="Icono" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })}
          className="accent-primary-strong" />
        Ocultar el juego y no admitir perfiles nuevos
      </label>
      <div className="flex items-center justify-end gap-3">
        {update.isSuccess && <span className="text-sm text-success">Guardado</span>}
        <Button type="submit" loading={update.isPending}>Guardar</Button>
      </div>
      {update.error && <div className="sm:col-span-2"><Alert tone="error">{errorMessage(update.error)}</Alert></div>}
    </form>
  );
}

function Reported() {
  const { data, isPending, error, refetch } = useReportedProfiles();
  if (isPending) return <PageSpinner />;
  if (error) return <ErrorAlert error={error} onRetry={() => void refetch()} />;
  if (data.length === 0) return <EmptyState title="No hay perfiles reportados ni ocultos" />;
  return <ul className="space-y-3">{data.map((item) => <ReportedRow key={item.id} item={item} />)}</ul>;
}

export default function AdminPage() {
  useDocumentTitle('Moderación');
  return (
    <RequireAccount admin reason="Inicia sesión como administrador.">
      {() => (
        <div className="space-y-8">
          <h1 className="text-3xl font-bold">Moderación</h1>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Perfiles reportados u ocultos</h2>
            <Reported />
          </section>
          <GameEditor />
        </div>
      )}
    </RequireAccount>
  );
}
