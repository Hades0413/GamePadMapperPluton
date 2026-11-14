import { MODERATION_REASON_MAX, type ReportedComment } from '@domain/moderation/Moderation';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, ErrorAlert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { errorMessage } from '../../lib/errorMessage';
import { timeAgo } from '../../lib/format';
import { useModerateComment, useReportedComments } from '../../queries/moderation';
import { paths } from '../../routes/paths';
import { BanDialog } from './BanDialog';
import { reasonText } from './reasons';

function CommentCard({ item }: { item: ReportedComment }) {
  const moderate = useModerateComment();
  const [reason, setReason] = useState('');
  const [banning, setBanning] = useState(false);
  const act = (action: 'restore' | 'hide' | 'delete') => moderate.mutate({ commentId: item.id, action, reason });
  const busy = (action: string) => moderate.isPending && moderate.variables.action === action;

  return (
    <li className="card space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 text-xs text-muted">
          <Link to={paths.author(item.username)} className="font-medium text-ink hover:underline">@{item.username}</Link>
          {' en '}
          <Link to={paths.profile(item.profileId)} className="hover:text-ink">«{item.profileTitle}»</Link>
          {' · '}{timeAgo(item.createdAt)}
        </p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${item.hidden ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
          {item.hidden ? 'Oculto' : 'Visible'} · {item.reportCount} {item.reportCount === 1 ? 'reporte' : 'reportes'}
        </span>
      </div>
      {/* Texto del usuario: siempre como texto, nunca como HTML. */}
      <blockquote className="rounded-lg bg-surface-2 px-3 py-2 text-sm break-words whitespace-pre-line">{item.body}</blockquote>
      {item.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.reasons.map((r, i) => <span key={i} className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted">{reasonText(r)}</span>)}
        </div>
      )}
      <input className="input" placeholder="Motivo (opcional, queda en el historial)" maxLength={MODERATION_REASON_MAX}
        value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo" />
      {moderate.error && <Alert tone="error">{errorMessage(moderate.error)}</Alert>}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button size="sm" loading={busy('restore')} onClick={() => act('restore')}>Está bien: mostrar</Button>
        {!item.hidden && <Button size="sm" variant="secondary" loading={busy('hide')} onClick={() => act('hide')}>Ocultar</Button>}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="text-danger! hover:bg-danger/10" loading={busy('delete')}
          onClick={() => act('delete')}>Borrar comentario</Button>
        <Button size="sm" variant="ghost" className="text-danger! hover:bg-danger/10" onClick={() => setBanning(true)}>Bloquear autor</Button>
      </div>
      <BanDialog open={banning} onClose={() => setBanning(false)} authorId={item.authorId} username={item.username} />
    </li>
  );
}

/** Comentarios reportados (con 3 reportes de cuentas con algunos dias se ocultan solos). */
export function CommentsPanel() {
  const { data, isPending, error, refetch } = useReportedComments();
  if (isPending) return <PageSpinner />;
  if (error) return <ErrorAlert error={error} onRetry={() => void refetch()} />;
  if (data.length === 0) {
    return (
      <EmptyState title="Todo en orden">
        No hay comentarios reportados ni ocultos. Con 3 reportes de cuentas con algunos días, un comentario se oculta solo y aparece aquí.
      </EmptyState>
    );
  }
  return <ul className="space-y-3">{data.map((item) => <CommentCard key={item.id} item={item} />)}</ul>;
}
