import { recentlyBroken, worksShare, type GameProfileSummary } from '@domain/profile/GameProfile';
import { validateConf } from '@domain/profile/conf/validateConf';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { appPublishedLink, type PublishedState } from '../lib/appLink';
import { BindingTable } from '../components/profile/BindingTable';
import {
  CommentsSection, FeatureToggle, TagChips, TagEditor, VersionsSection,
} from '../components/profile/CommunitySections';
import { LikeButton } from '../components/profile/LikeButton';
import { ProfileActions } from '../components/profile/ProfileActions';
import { PreviewPanel } from '../components/profile/PreviewPanel';
import { ReportButton } from '../components/profile/ReportDialog';
import { Alert, ErrorAlert } from '../components/ui/Alert';
import { errorMessage } from '../lib/errorMessage';
import { Avatar } from '../components/ui/Avatar';
import { Button, ButtonLink } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { PageSpinner } from '../components/ui/Spinner';
import { canShare } from '../lib/files';
import { useFormat } from '../lib/useFormat';
import { useRich, useT } from '../i18n/I18nContext';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useAccount } from '../queries/account';
import { useGame } from '../queries/games';
import { useDeleteProfile, useProfile } from '../queries/profiles';
import { paths } from '../routes/paths';
import NotFoundPage from './NotFoundPage';

function DeleteButton({ id, packageName }: { id: string; packageName: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const remove = useDeleteProfile();
  const navigate = useNavigate();
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>{t('Borrar')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('¿Borrar este perfil?')}>
        <p className="text-sm text-muted">{t('Se borra para siempre, con sus «me gusta». No se puede deshacer.')}</p>
        {remove.error && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>{t('Cancelar')}</Button>
          <Button variant="danger" loading={remove.isPending}
            onClick={() => remove.mutate(id, { onSuccess: () => void navigate(paths.game(packageName), { replace: true }) })}>
            {t('Borrar')}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export default function ProfilePage() {
  const t = useT();
  const { formatDate } = useFormat();
  const { id = '' } = useParams();
  const { data: profile, isPending, error, refetch } = useProfile(id);
  const { data: account } = useAccount();
  const parsed = useMemo(() => (profile ? validateConf(profile.conf) : null), [profile]);
  const { data: game } = useGame(profile?.packageName);
  const justPublished = (useLocation().state ?? null) as PublishedState | null;
  useDocumentTitle(profile ? `${profile.title} — ${profile.gameName ?? profile.packageName}` : undefined,
    profile?.description || undefined);

  if (isPending) return <PageSpinner />;
  if (error) return <ErrorAlert error={error} onRetry={() => void refetch()} />;
  if (!profile) return <NotFoundPage />;

  const isOwner = account?.id === profile.author?.id;
  const canModerate = isOwner || !!account?.isAdmin;

  return (
    <article className="space-y-8">
      <nav aria-label={t('Ruta')} className="text-sm text-muted">
        <Link to={paths.games} className="hover:text-ink">{t('Juegos')}</Link> /{' '}
        <Link to={paths.game(profile.packageName)} className="hover:text-ink">{profile.gameName ?? profile.packageName}</Link>
      </nav>

      {justPublished?.published && (
        <Alert tone="success" action={justPublished.fromApp ? (
          // Devuelve a la app el id del perfil: asi luego puede actualizarlo con un toque.
          <a href={appPublishedLink(profile.id)} className="font-semibold underline">{t('Volver a la app')}</a>
        ) : undefined}>
          {justPublished.published === 'created' ? t('¡Perfil publicado!') : t('Cambios publicados.')}
          {justPublished.fromApp && ` ${t('Vuelve a la app para que recuerde este perfil y puedas actualizarlo desde allí.')}`}
        </Alert>
      )}

      {profile.status === 'hidden' && (
        <Alert tone="warning">{t('Este perfil está oculto: solo lo ves tú. Puede deberse a reportes de otros usuarios.')}</Alert>
      )}

      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 space-y-3">
          <h1 className="text-3xl font-bold break-words">{profile.title}</h1>
          {profile.author && (
            <Link to={paths.author(profile.author.username)} className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink">
              <Avatar author={profile.author} size={24} />
              {profile.author.username}
            </Link>
          )}
          <p className="text-xs text-muted">
            {t('Publicado el {date}', { date: formatDate(profile.createdAt) })}
            {profile.updatedAt.getTime() - profile.createdAt.getTime() > 60_000 && ` · ${t('actualizado el {date}', { date: formatDate(profile.updatedAt) })}`}
            {' · '}{t('pantalla {w}×{h}', { w: profile.screen.width, h: profile.screen.height })}
            {profile.deviceModel && ` · ${profile.deviceModel}`}
          </p>
          <ProfileStats profile={profile} />
          <div className="flex flex-wrap items-center gap-1.5">
            {profile.featuredAt && <span className="rounded-md bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">★ {t('Destacado')}</span>}
            <TagChips tags={profile.tags} />
            {isOwner && <TagEditor profileId={profile.id} tags={profile.tags} />}
          </div>
        </div>
        <LikeButton id={profile.id} count={profile.likeCount} />
      </header>

      {recentlyBroken(profile) && (
        <Alert tone="warning">
          {t('Últimamente varios jugadores dicen que este perfil no les funciona (quizá el juego cambió sus controles).')}
          {' '}{isOwner ? t('Revisa las posiciones y actualízalo.') : t('Mira otros perfiles del juego o los comentarios.')}
        </Alert>
      )}

      {profile.description && <p className="max-w-3xl whitespace-pre-line text-muted">{profile.description}</p>}

      <section className="space-y-3">
        <ProfileActions profile={profile} />
        <p className="text-xs text-muted">
          {canShare()
            ? <>{t('«Abrir en la app» muestra el perfil en Gamepad Mapper Plutón para instalarlo; «Enviar a la app» lo comparte por el menú de Android.')} </>
            : <>{t('Abre esta página en tu teléfono Android para enviarlo directamente a la app.')} </>}
          {t('Las posiciones se adaptan solas a la resolución de tu pantalla.')}
        </p>
      </section>

      {parsed?.ok ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="lg:col-span-3" aria-label={t('Vista previa')}>
            <PreviewPanel config={parsed.config} background={game?.backgroundUrl ?? null} />
          </section>
          <section className="card space-y-3 p-4 lg:col-span-2" aria-labelledby="bindings">
            <h2 id="bindings" className="font-semibold">{t('Botones ({n})', { n: parsed.config.bindings.length })}</h2>
            <BindingTable config={parsed.config} />
          </section>
        </div>
      ) : (
        <Alert tone="warning">{t('No se pudo dibujar la vista previa de este perfil.')}</Alert>
      )}

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-medium">{t('Ver el archivo .conf')}</summary>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-bg p-3 font-mono text-xs leading-relaxed text-muted">
          {profile.conf}
        </pre>
      </details>

      <VersionsSection profile={profile} />

      <CommentsSection profileId={profile.id} profileAuthorId={profile.author?.id ?? null} />

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        {!isOwner ? <ReportButton id={profile.id} /> : <span />}
        {canModerate && (
          <div className="flex gap-2">
            {account?.isAdmin && <FeatureToggle profileId={profile.id} featured={!!profile.featuredAt} />}
            {isOwner && <ButtonLink to={paths.editProfile(profile.id)} variant="secondary" size="sm">{t('Editar')}</ButtonLink>}
            <DeleteButton id={profile.id} packageName={profile.packageName} />
          </div>
        )}
      </footer>
    </article>
  );
}

/** Instalaciones desde la app y «¿te funcionó?» (orientativos). */
function ProfileStats({ profile }: { profile: GameProfileSummary }) {
  const t = useT();
  const tr = useRich();
  const { fullNumber } = useFormat();
  const share = worksShare(profile);
  const votes = profile.worksYes + profile.worksNo;
  if (profile.installCount === 0 && votes === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {profile.installCount > 0 && (
        <span>{profile.installCount === 1 ? t('1 instalación desde la app') : t('{n} instalaciones desde la app', { n: fullNumber(profile.installCount) })}</span>
      )}
      {share !== null ? (
        <span>{tr('<b>{share} %</b> dice que le funciona ({votes} votos)', { share, votes })}</span>
      ) : votes > 0 && <span>{votes === 1 ? t('1 voto sobre si funciona (pocos aún)') : t('{n} votos sobre si funciona (pocos aún)', { n: votes })}</span>}
    </p>
  );
}
