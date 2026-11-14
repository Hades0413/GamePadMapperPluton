import { useState } from 'react';
import { ErrorAlert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageSpinner } from '../../components/ui/Spinner';
import { formatDate } from '../../lib/format';
import { useDeleteDiagnostic, useDiagnostics } from '../../queries/moderation';

/** Diagnosticos que mandan los usuarios desde la app (se borran solos a los 30 dias). */
export function DiagnosticsPanel() {
  const list = useDiagnostics(true);
  const remove = useDeleteDiagnostic();
  const [search, setSearch] = useState('');
  if (list.isPending) return <PageSpinner />;
  if (list.error) return <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />;
  const code = search.trim().toLowerCase();
  const items = code ? list.data.filter((d) => d.id.startsWith(code)) : list.data;
  return (
    <div className="space-y-4">
      <input className="input max-w-xs" placeholder="Buscar por código (p. ej. 1A2B3C4D)" value={search}
        onChange={(e) => setSearch(e.target.value)} aria-label="Código del diagnóstico" />
      {items.length === 0 ? <EmptyState title={code ? 'Ningún diagnóstico con ese código' : 'No hay diagnósticos'} /> : (
        <ul className="space-y-3">
          {items.map((d) => (
            <li key={d.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-mono font-semibold">{d.id.slice(0, 8).toUpperCase()}</span>
                  <span className="text-muted"> · {formatDate(d.createdAt)} · app {d.appVersion} · {d.android} · {d.device} · {d.mode}</span>
                </p>
                <Button size="sm" variant="ghost" loading={remove.isPending && remove.variables === d.id}
                  onClick={() => remove.mutate(d.id)}>Borrar</Button>
              </div>
              {d.message && <p className="text-sm whitespace-pre-line break-words">«{d.message}»</p>}
              <details>
                <summary className="cursor-pointer text-sm text-muted">Ver informe</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-bg p-3 font-mono text-xs whitespace-pre-wrap text-muted">{d.log}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
