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
import type { GameImageKind } from '@domain/game/GameImage';
import { prepareGameImage } from '../lib/images';
import { useGame } from '../queries/games';
import {
  useBanAuthor, useImportGame, useModerateProfile, useReportedProfiles, useSetGameImage, useUpdateGame,
} from '../queries/moderation';
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

function ImageSlot({
  label, hint, url, kind, packageName, aspect,
}: {
  label: string; hint: string; url: string | null; kind: GameImageKind; packageName: string; aspect: string;
}) {
  const set = useSetGameImage();
  const [prepError, setPrepError] = useState<string | null>(null);
  const error = prepError ?? (set.error ? errorMessage(set.error) : null);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className={`flex items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-2 ${aspect}`}>
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-muted">Sin imagen</span>}
      </div>
      <p className="text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap gap-2">
        <label className={`${set.isPending ? 'pointer-events-none opacity-50' : ''} cursor-pointer rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-sm hover:border-primary`}>
          {set.isPending ? 'Subiendo…' : 'Subir imagen'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setPrepError(null);
            prepareGameImage(file, kind).then(
              (img) => set.mutate({ packageName, kind, file: img }),
              (err: unknown) => setPrepError(errorMessage(err)),
            );
          }} />
        </label>
        {url && <Button size="sm" variant="ghost" onClick={() => set.mutate({ packageName, kind, file: null })}>Quitar</Button>}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function GameDetails({ packageName }: { packageName: string }) {
  const { data: game, isPending, error } = useGame(packageName);
  const update = useUpdateGame();
  const importer = useImportGame();
  const [name, setName] = useState<string | null>(null);
  const [hidden, setHidden] = useState<boolean | null>(null);
  if (isPending) return <PageSpinner />;
  if (error) return <Alert tone="error">{errorMessage(error)}</Alert>;
  if (!game) return <p className="text-sm text-muted">Ese juego no existe todavía en la comunidad (se crea con su primer perfil).</p>;
  const currentName = name ?? game.name;
  const currentHidden = hidden ?? false;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" loading={importer.isPending}
          onClick={() => importer.mutate({ packageName, updateName: true }, { onSuccess: (r) => r.name && setName(r.name) })}>
          Obtener nombre e icono de Google Play
        </Button>
        {importer.isSuccess && <span className="text-sm text-success">Actualizado desde Google Play</span>}
        {importer.error && <span className="text-sm text-danger">{errorMessage(importer.error)}</span>}
      </div>
      <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
        <ImageSlot label="Icono" hint="Se recorta en cuadrado (256 px)." url={game.iconUrl} kind="icon"
          packageName={packageName} aspect="aspect-square" />
        <ImageSlot label="Fondo para la vista previa"
          hint="Captura real del juego en horizontal, sin datos personales (nombres, chat). Se reduce y se le quitan los metadatos."
          url={game.backgroundUrl} kind="background" packageName={packageName} aspect="aspect-video" />
      </div>
      <form className="grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={(e: FormEvent) => {
        e.preventDefault();
        update.mutate({ packageName, name: currentName, hidden: currentHidden });
      }}>
        <input className="input" value={currentName} onChange={(e) => setName(e.target.value)} aria-label="Nombre" />
        <Button type="submit" loading={update.isPending}>Guardar nombre</Button>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={currentHidden} onChange={(e) => setHidden(e.target.checked)} className="accent-primary-strong" />
          Ocultar el juego y no admitir perfiles nuevos
        </label>
        {update.isSuccess && <span className="text-sm text-success">Guardado</span>}
        {update.error && <div className="sm:col-span-2"><Alert tone="error">{errorMessage(update.error)}</Alert></div>}
      </form>
    </div>
  );
}

function GameEditor() {
  const [input, setInput] = useState('');
  const [pkg, setPkg] = useState('');
  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-semibold">Editar un juego</h2>
      <form className="flex gap-2" onSubmit={(e: FormEvent) => {
        e.preventDefault();
        setPkg(input.trim());
      }}>
        <input className="input font-mono text-sm" placeholder="Paquete (com.empresa.juego)" value={input}
          onChange={(e) => setInput(e.target.value)} aria-label="Paquete" />
        <Button type="submit" variant="secondary">Abrir</Button>
      </form>
      {pkg && <GameDetails key={pkg} packageName={pkg} />}
    </section>
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
