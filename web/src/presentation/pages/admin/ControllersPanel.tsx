import type { MappingStatus } from '@domain/controller/ControllerMapping';
import { sdlFields } from '@domain/controller/sdlMapping';
import { useState } from 'react';
import { MappingFields, StatusBadge } from '../../components/controllers/MappingParts';
import { Alert, ErrorAlert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { errorMessage } from '../../lib/errorMessage';
import { formatDate } from '../../lib/format';
import { useDeleteMapping, useMappingsForReview, useReviewMapping } from '../../queries/controllers';

const FILTERS: [MappingStatus, string][] = [['pending', 'Pendientes'], ['approved', 'Aprobados'], ['rejected', 'Rechazados']];

/**
 * Mandos enviados por la comunidad (lineas SDL). Al aprobar uno, el que estuviera aprobado
 * antes para el mismo GUID y plataforma se borra (lo sustituye).
 */
export function ControllersPanel() {
  const [status, setStatus] = useState<MappingStatus>('pending');
  const list = useMappingsForReview(status);
  const review = useReviewMapping();
  const remove = useDeleteMapping();
  const busy = (id: string) => (review.isPending && review.variables?.id === id) || (remove.isPending && remove.variables === id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Estado">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${status === value ? 'border-primary bg-primary/15 text-ink' : 'border-line text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>
      {review.error && <Alert tone="error">{errorMessage(review.error)}</Alert>}
      {remove.error && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
      {list.isPending ? <PageSpinner /> : list.error ? <ErrorAlert error={list.error} onRetry={() => void list.refetch()} /> :
        list.data.length === 0 ? <EmptyState title="No hay mandos en esta lista" /> : (
          <ul className="space-y-3">
            {list.data.map((m) => (
              <li key={m.id} className="card min-w-0 space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold break-words">{m.name}</span>
                      <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{m.platform}</span>
                      <StatusBadge status={m.status} />
                    </p>
                    <p className="font-mono text-xs break-all text-muted">GUID {m.guid}</p>
                    <p className="text-xs text-muted">
                      @{m.author?.username ?? '?'} · enviado {formatDate(m.createdAt)}
                      {m.reviewedAt && <> · revisado {formatDate(m.reviewedAt)}</>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {m.status !== 'approved' && (
                      <Button size="sm" loading={busy(m.id)} onClick={() => review.mutate({ id: m.id, approve: true })}>Aprobar</Button>
                    )}
                    {m.status !== 'rejected' && (
                      <Button size="sm" variant="danger" loading={busy(m.id)} onClick={() => review.mutate({ id: m.id, approve: false })}>
                        {m.status === 'approved' ? 'Retirar (rechazar)' : 'Rechazar'}
                      </Button>
                    )}
                    {m.status === 'rejected' && (
                      <Button size="sm" variant="ghost" loading={busy(m.id)} onClick={() => remove.mutate(m.id)}>Borrar</Button>
                    )}
                  </div>
                </div>
                <MappingFields fields={sdlFields(m.mapping)} />
                <details>
                  <summary className="cursor-pointer text-sm text-muted">Ver línea</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-bg p-3 font-mono text-xs break-all whitespace-pre-wrap text-muted">{m.mapping}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
