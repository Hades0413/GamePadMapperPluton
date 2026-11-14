import { COMMENT_MAX } from '@domain/community/Community';
import {
  MAX_TAGS, PROFILE_TAGS, profileFileName, type GameProfile, type ProfileTag,
} from '@domain/profile/GameProfile';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { errorMessage } from '../../lib/errorMessage';
import { downloadText } from '../../lib/files';
import { useT } from '../../i18n/I18nContext';
import { useFormat } from '../../lib/useFormat';
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
  const t = useT();
  const shown = max ? tags.slice(0, max) : tags;
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((tag) => (
        <span key={tag} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs text-primary">{t(TAG_LABEL[tag])}</span>
      ))}
    </>
  );
}

/** El autor elige hasta 4 etiquetas de la lista. */
export function TagEditor({ profileId, tags }: { profileId: string; tags: readonly ProfileTag[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<readonly ProfileTag[]>(tags);
  const save = useSetTags();
  const toggle = (tag: ProfileTag) =>
    setPicked((p) => (p.includes(tag) ? p.filter((x) => x !== tag) : p.length < MAX_TAGS ? [...p, tag] : p));
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setPicked(tags); setOpen(true); }}>
        {tags.length ? t('Editar etiquetas') : t('Añadir etiquetas')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('Etiquetas del perfil')}>
        <p className="text-sm text-muted">{t('Ayudan a otros a encontrarlo. Elige hasta {n}.', { n: MAX_TAGS })}</p>
        <div className="flex flex-wrap gap-2">
          {PROFILE_TAGS.map((tag) => {
            const on = picked.includes(tag);
            return (
              <button key={tag} type="button" aria-pressed={on} onClick={() => toggle(tag)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-primary bg-primary/15 text-ink' : 'border-line text-muted hover:text-ink'}`}>
                {t(TAG_LABEL[tag])}
              </button>
            );
          })}
        </div>
        {save.error && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>{t('Cancelar')}</Button>
          <Button loading={save.isPending}
            onClick={() => save.mutate({ profileId, tags: picked }, { onSuccess: () => setOpen(false) })}>
            {t('Guardar')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/** Destacar en la portada (solo admins). */
export function FeatureToggle({ profileId, featured }: { profileId: string; featured: boolean }) {
  const t = useT();
  const feature = useFeatureProfile();
  return (
    <Button size="sm" variant="secondary" loading={feature.isPending}
      onClick={() => feature.mutate({ profileId, on: !featured })}>
      {featured ? t('Quitar de destacados') : t('Destacar')}
    </Button>
  );
}

/** Versiones anteriores del perfil (se cargan al abrir). */
export function VersionsSection({ profile }: { profile: GameProfile }) {
  const t = useT();
  const { formatDate } = useFormat();
  const [open, setOpen] = useState(false);
  const versions = useVersions(profile.id, open);
  return (
    <details className="card p-4" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-sm font-medium">{t('Historial de versiones')}</summary>
      <div className="mt-3 space-y-2">
        {versions.isPending && open && <p className="text-sm text-muted">{t('Cargando…')}</p>}
        {versions.error && <Alert tone="error">{errorMessage(versions.error)}</Alert>}
        {versions.data?.length === 0 && <p className="text-sm text-muted">{t('Sin versiones guardadas.')}</p>}
        {versions.data?.map((v, i) => (
          <div key={v.version} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 text-sm last:border-0">
            <span>
              <strong>v{v.version}</strong> · {formatDate(v.createdAt)}
              {i === 0 && <span className="ml-2 rounded bg-success/15 px-1.5 py-0.5 text-xs text-success">{t('actual')}</span>}
            </span>
            {i > 0 && (
              <button type="button" className="text-primary hover:underline"
                onClick={() => downloadText(profileFileName({ packageName: profile.packageName, title: `${v.title} v${v.version}` }), v.conf)}>
                {t('Descargar esta versión')}
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
  const t = useT();
  const { timeAgo } = useFormat();
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
      <h2 id="comments" className="font-semibold">{t('Comentarios')}{comments.data?.length ? ` (${comments.data.length})` : ''}</h2>
      {account ? (
        <form onSubmit={submit} className="space-y-2">
          <textarea className="input min-h-20" maxLength={COMMENT_MAX} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={t('¿Te funcionó? ¿Algún consejo para este perfil?')} aria-label={t('Comentario')} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">{body.length}/{COMMENT_MAX}</span>
            <Button type="submit" size="sm" loading={add.isPending} disabled={body.trim().length < 2}>{t('Comentar')}</Button>
          </div>
          {add.error && <Alert tone="error">{errorMessage(add.error)}</Alert>}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {t('Inicia sesión para comentar.')} <SignInButton />
        </div>
      )}
      {remove.error && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
      {comments.error && <Alert tone="error">{errorMessage(comments.error)}</Alert>}
      {comments.data?.length === 0 && <p className="text-sm text-muted">{t('Aún no hay comentarios.')}</p>}
      <ul className="space-y-3">
        {comments.data?.map((c) => (
          <li key={c.id} className="flex gap-3">
            {c.author && <Avatar author={c.author} size={28} />}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">
                {c.author ? <Link to={paths.author(c.author.username)} className="font-medium text-ink hover:underline">{c.author.username}</Link> : t('Usuario')}
                {' · '}{timeAgo(c.createdAt)}
                {canDelete(c.author?.id) && (
                  <button type="button" className="ml-2 text-danger hover:underline" onClick={() => remove.mutate(c.id)}>{t('Borrar')}</button>
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
