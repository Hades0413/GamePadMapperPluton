import type { ModerationAction, ModerationLogEntry } from '@domain/moderation/Moderation';
import { Link } from 'react-router';
import { ErrorAlert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadMore } from '../../components/ui/LoadMore';
import { PageSpinner } from '../../components/ui/Spinner';
import { formatDate } from '../../lib/format';
import { useModerationLog } from '../../queries/moderation';
import { paths } from '../../routes/paths';

const ACTION_LABEL: Record<ModerationAction, string> = {
  profile_publish: 'Publicó el perfil',
  profile_hide: 'Ocultó el perfil',
  profile_delete: 'Borró el perfil',
  profile_feature: 'Destacó el perfil',
  profile_unfeature: 'Quitó de destacados',
  author_ban: 'Bloqueó a',
  author_unban: 'Desbloqueó a',
  game_update: 'Editó el juego',
  game_images: 'Cambió las imágenes de',
  comment_hide: 'Ocultó el comentario',
  comment_restore: 'Mostró el comentario',
  comment_delete: 'Borró el comentario',
  mapping_approve: 'Aprobó el mando',
  mapping_reject: 'Rechazó el mando',
  mapping_delete: 'Borró el mando',
  diagnostic_delete: 'Borró el diagnóstico',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Enlace al objetivo si todavia tiene pagina (los borrados solo muestran su nombre). */
function Target({ entry }: { entry: ModerationLogEntry }) {
  const label = entry.targetLabel || entry.targetId;
  const deleted = entry.action.endsWith('_delete');
  if (!deleted && entry.targetType === 'profile' && UUID.test(entry.targetId)) {
    return <Link to={paths.profile(entry.targetId)} className="font-medium text-ink hover:underline">{label}</Link>;
  }
  if (entry.targetType === 'game') return <Link to={paths.game(entry.targetId)} className="font-medium text-ink hover:underline">{label}</Link>;
  return <span className="font-medium text-ink">{label}</span>;
}

/** Historial de moderacion: cada accion de un admin (solo lo ven los admins). */
export function HistoryPanel() {
  const log = useModerationLog(true);
  if (log.isPending) return <PageSpinner />;
  if (log.error) return <ErrorAlert error={log.error} onRetry={() => void log.refetch()} />;
  const items = log.data.pages.flat();
  if (items.length === 0) return <EmptyState title="Sin acciones todavía" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Las entradas se borran solas al año.</p>
      <ol className="space-y-2">
        {items.map((e) => (
          <li key={e.id} className="card space-y-1 p-3 text-sm">
            <p className="break-words">
              <span className="font-semibold">@{e.adminName}</span>{' '}
              <span className="text-muted">{ACTION_LABEL[e.action]}</span>{' '}
              <Target entry={e} />
            </p>
            {e.reason && <p className="text-xs break-words text-muted">Motivo: {e.reason}</p>}
            <p className="text-xs text-muted">{formatDate(e.createdAt)} · {e.createdAt.toLocaleTimeString('es')}</p>
          </li>
        ))}
      </ol>
      <LoadMore hasMore={!!log.hasNextPage} loading={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()} />
    </div>
  );
}
