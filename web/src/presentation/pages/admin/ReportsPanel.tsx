import type { ReportedProfile } from '@application/ports/ModerationRepository';
import { isReportReason } from '@domain/report/ReportReason';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert, ErrorAlert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { errorMessage } from '../../lib/errorMessage';
import { timeAgo } from '../../lib/format';
import { REPORT_REASON_LABEL } from '../../lib/labels';
import { useBanAuthor, useModerateProfile, useReportedProfiles } from '../../queries/moderation';
import { useDeleteProfile } from '../../queries/profiles';
import { paths } from '../../routes/paths';

type Danger = 'delete' | 'ban' | null;

/** "broken: no va" -> "No funciona / está mal hecho: no va" */
function reasonText(raw: string): string {
  const sep = raw.indexOf(':');
  const code = sep >= 0 ? raw.slice(0, sep) : raw;
  const label = isReportReason(code) ? REPORT_REASON_LABEL[code] : code;
  return sep >= 0 ? `${label}:${raw.slice(sep + 1)}` : label;
}

function ReportCard({ item }: { item: ReportedProfile }) {
  const moderate = useModerateProfile();
  const remove = useDeleteProfile();
  const ban = useBanAuthor();
  const [danger, setDanger] = useState<Danger>(null);
  const error = moderate.error ?? remove.error ?? ban.error;
  const hidden = item.status === 'hidden';

  return (
    <li className="card space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={paths.profile(item.id)} className="font-semibold hover:text-primary">{item.title}</Link>
          <p className="text-xs text-muted">
            {item.packageName} · <Link to={paths.author(item.username)} className="hover:text-ink">@{item.username}</Link>
            {' · '}{timeAgo(item.createdAt)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${hidden ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'}`}>
          {hidden ? 'Oculto' : 'Visible'} · {item.reportCount} {item.reportCount === 1 ? 'reporte' : 'reportes'}
        </span>
      </div>

      {item.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.reasons.map((r, i) => (
            <span key={i} className="rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted">{reasonText(r)}</span>
          ))}
        </div>
      )}

      {error && <Alert tone="error">{errorMessage(error)}</Alert>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Button size="sm" loading={moderate.isPending}
          onClick={() => moderate.mutate({ id: item.id, status: 'published', clearReports: true })}>
          Está bien: publicar
        </Button>
        {!hidden && (
          <Button size="sm" variant="secondary"
            onClick={() => moderate.mutate({ id: item.id, status: 'hidden', clearReports: false })}>
            Ocultar
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" className="text-danger! hover:bg-danger/10" onClick={() => setDanger('delete')}>Borrar perfil</Button>
        <Button size="sm" variant="ghost" className="text-danger! hover:bg-danger/10" onClick={() => setDanger('ban')}>Bloquear autor</Button>
      </div>

      <Dialog open={danger !== null} onClose={() => setDanger(null)}
        title={danger === 'ban' ? `¿Bloquear a @${item.username}?` : '¿Borrar este perfil?'}>
        <p className="text-sm text-muted">
          {danger === 'ban'
            ? 'Se ocultarán todos sus perfiles y no podrá subir más, aunque borre la cuenta y vuelva a entrar.'
            : 'Se borra para siempre, con sus «me gusta» y reportes.'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDanger(null)}>Cancelar</Button>
          <Button variant="danger" loading={remove.isPending || ban.isPending} onClick={() => {
            const done = { onSuccess: () => setDanger(null) };
            if (danger === 'ban') ban.mutate({ authorId: item.authorId, banned: true }, done);
            else remove.mutate(item.id, done);
          }}>
            {danger === 'ban' ? 'Bloquear' : 'Borrar'}
          </Button>
        </div>
      </Dialog>
    </li>
  );
}

export function ReportsPanel() {
  const { data, isPending, error, refetch } = useReportedProfiles();
  if (isPending) return <PageSpinner />;
  if (error) return <ErrorAlert error={error} onRetry={() => void refetch()} />;
  if (data.length === 0) {
    return (
      <EmptyState title="Todo en orden">
        No hay perfiles reportados ni ocultos. Con 3 reportes de cuentas con algunos días, un perfil se oculta solo y aparece aquí.
      </EmptyState>
    );
  }
  return <ul className="space-y-3">{data.map((item) => <ReportCard key={item.id} item={item} />)}</ul>;
}
