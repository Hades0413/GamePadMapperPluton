import { COMMENT_MAX } from '@domain/community/Community';
import {
  MAX_TAGS, PROFILE_TAGS, profileFileName, type GameProfile, type ProfileTag,
} from '@domain/profile/GameProfile';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../lib/errorMessage';
import { downloadText } from '../../lib/files';
import { formatDate, timeAgo } from '../../lib/format';
import { TAG_LABEL } from '../../lib/labels';
import { useAccount } from '../../queries/account';
import {
  useAddComment, useComments, useDeleteComment, useFeatureProfile, useSetTags, useVersions,
} from '../../queries/community';
import { paths } from '../../routes/paths';
import { Alert } from '../ui/Alert';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { SignInButton } from '../auth/SignInButton';

/** Etiquetas del perfil como pastillas. */
export function TagChips({ tags, max }: { tags: readonly ProfileTag[]; max?: number }) {
  const shown = max ? tags.slice(0, max) : tags;
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((t) => (
        <span key={t} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">{TAG_LABEL[t]}</span>
      ))}
    </>
  );
}

/** El autor elige hasta 4 etiquetas de la lista. */
export function TagEditor({ profileId, tags }: { profileId: string; tags: readonly ProfileTag[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<readonly ProfileTag[]>(tags);
  const save = useSetTags();
  const toggle = (t: ProfileTag) =>
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : p.length < MAX_TAGS ? [...p, t] : p));
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setPicked(tags); setOpen(true); }}>
        {tags.length ? 'Editar etiquetas' : 'Añadir etiquetas'}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Etiquetas del perfil">
        <p className="text-sm text-muted">Ayudan a otros a encontrarlo. Elige hasta {MAX_TAGS}.</p>
        <div className="flex flex-wrap gap-2">
          {PROFILE_TAGS.map((t) => {
            const on = picked.includes(t);
            return (
              <button key={t} type="button" aria-pressed={on} onClick={() => toggle(t)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-primary bg-primary/15 text-ink' : 'border-line text-muted hover:text-ink'}`}>
                {TAG_LABEL[t]}
              </button>
            );
          })}
        </div>
        {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button loading={save.isPending}
            onClick={() => save.mutate({ profileId, tags: picked }, { onSuccess: () => setOpen(false) })}>
            Guardar
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/** Destacar en la portada (solo admins). */
export function FeatureToggle({ profileId, featured }: { profileId: string; featured: boolean }) {
  const feature = useFeatureProfile();
  return (
    <Button size="sm" variant="secondary" loading={feature.isPending}
      onClick={() => feature.mutate({ profileId, on: !featured })}>
      {featured ? 'Quitar de destacados' : 'Destacar'}
    </Button>
  );
}

/** Versiones anteriores del perfil (se cargan al abrir). */
export function VersionsSection({ profile }: { profile: GameProfile }) {
  const [open, setOpen] = useState(false);
  const versions = useVersions(profile.id, open);
  return (
    <details className="card p-4" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-medium">Historial de versiones</summary>
      <div className="mt-3 space-y-2">
        {versions.isPending && open && <p className="text-sm text-muted">Cargando…</p>}
        {versions.error && <Alert tone="error">{errorMessage(versions.error)}</Alert>}
        {versions.data?.length === 0 && <p className="text-sm text-muted">Sin versiones guardadas.</p>}
        {versions.data?.map((v, i) => (
          <div key={v.version} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 text-sm last:border-0">
            <span>
              <strong>v{v.version}</strong> · {formatDate(v.createdAt)}
              {i === 0 && <span className="ml-2 rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">actual</span>}
            </span>
            {i > 0 && (
              <button type="button" className="text-primary hover:underline"
                onClick={() => downloadText(profileFileName({ packageName: profile.packageName, title: `${v.title} v${v.version}` }), v.conf)}>
                Descargar esta versión
              </button>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

/** Comentarios cortos: cualquiera los lee; para escribir hace falta GitHub. */
export function CommentsSection({ profileId, profileAuthorId }: { profileId: string; profileAuthorId: string | null }) {
  const { data: account } = useAccount();
  const comments = useComments(profileId);
  const add = useAddComment(profileId);
  const remove = useDeleteComment(profileId);
  const [body, setBody] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(body, { onSuccess: () => setBody('') });
  };
  const canDelete = (authorId: string | undefined) =>
    !!account && (account.id === authorId || account.id === profileAuthorId || account.isAdmin);

  return (
    <section className="card space-y-4 p-4" aria-labelledby="comments">
      <h2 id="comments" className="font-semibold">Comentarios{comments.data?.length ? ` (${comments.data.length})` : ''}</h2>
      {account ? (
        <form onSubmit={submit} className="space-y-2">
          <textarea className="input min-h-20" maxLength={COMMENT_MAX} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="¿Te funcionó? ¿Algún consejo para este perfil?" aria-label="Comentario" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">{body.length}/{COMMENT_MAX}</span>
            <Button type="submit" size="sm" loading={add.isPending} disabled={body.trim().length < 2}>Comentar</Button>
          </div>
          {add.error && <Alert tone="error">{errorMessage(add.error)}</Alert>}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          Inicia sesión para comentar. <SignInButton />
        </div>
      )}
      {remove.error && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
      {comments.error && <Alert tone="error">{errorMessage(comments.error)}</Alert>}
      {comments.data?.length === 0 && <p className="text-sm text-muted">Aún no hay comentarios.</p>}
      <ul className="space-y-3">
        {comments.data?.map((c) => (
          <li key={c.id} className="flex gap-3">
            {c.author && <Avatar author={c.author} size={28} />}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {c.author ? <Link to={paths.author(c.author.username)} className="font-medium text-ink hover:underline">{c.author.username}</Link> : 'Usuario'}
                {' · '}{timeAgo(c.createdAt)}
                {canDelete(c.author?.id) && (
                  <button type="button" className="ml-2 text-danger hover:underline" onClick={() => remove.mutate(c.id)}>Borrar</button>
                )}
              </p>
              <p className="text-sm break-words whitespace-pre-line">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
