import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useGames } from '../queries/games';
import { useMappingsForReview } from '../queries/controllers';
import { useReportedComments, useReportedProfiles } from '../queries/moderation';
import { BansPanel } from './admin/BansPanel';
import { CommentsPanel } from './admin/CommentsPanel';
import { ControllersPanel } from './admin/ControllersPanel';
import { DiagnosticsPanel } from './admin/DiagnosticsPanel';
import { GamesPanel } from './admin/GamesPanel';
import { HistoryPanel } from './admin/HistoryPanel';
import { ReportsPanel } from './admin/ReportsPanel';

const TABS = ['juegos', 'reportes', 'comentarios', 'mandos', 'bloqueos', 'historial', 'diagnosticos'] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => (TABS as readonly (string | null)[]).includes(v);

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const reported = useReportedProfiles();
  const games = useGames('');
  const toFix = (games.data?.pages.flatMap((p) => p.items) ?? []).filter((g) => !g.iconUrl || !g.backgroundUrl).length;
  const pending = reported.data?.length ?? 0;
  const mappings = useMappingsForReview('pending');
  const pendingMappings = mappings.data?.length ?? 0;
  const comments = useReportedComments();
  const pendingComments = comments.data?.length ?? 0;
  const items: [Tab, string, number, string][] = [
    ['juegos', 'Juegos', toFix, 'bg-warning/20 text-warning'],
    ['reportes', 'Reportes', pending, 'bg-danger/20 text-danger'],
    ['comentarios', 'Comentarios', pendingComments, 'bg-danger/20 text-danger'],
    ['mandos', 'Mandos', pendingMappings, 'bg-warning/20 text-warning'],
    ['bloqueos', 'Bloqueos', 0, ''],
    ['historial', 'Historial', 0, ''],
    ['diagnosticos', 'Diagnósticos', 0, ''],
  ];
  return (
    <div role="tablist" aria-label="Secciones" className="flex gap-1 overflow-x-auto border-b border-line">
      {items.map(([value, label, count, badge]) => (
        <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => onChange(value)}
          className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === value ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
          {label}
          {count > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${badge}`}>{count}</span>}
        </button>
      ))}
    </div>
  );
}

export default function AdminPage() {
  useDocumentTitle('Moderación');
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = isTab(raw) ? raw : 'juegos';
  const panels: Record<Tab, () => ReactNode> = {
    juegos: () => <GamesPanel />,
    reportes: () => <ReportsPanel />,
    comentarios: () => <CommentsPanel />,
    mandos: () => <ControllersPanel />,
    bloqueos: () => <BansPanel />,
    historial: () => <HistoryPanel />,
    diagnosticos: () => <DiagnosticsPanel />,
  };
  return (
    <RequireAccount admin reason="Inicia sesión como administrador.">
      {() => (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Moderación</h1>
            <p className="mt-1 text-muted">Completa los juegos (icono y captura), revisa perfiles y comentarios reportados, aprueba los mandos enviados y consulta el historial.</p>
          </div>
          <Tabs tab={tab} onChange={(t) => setParams(t === 'juegos' ? {} : { tab: t }, { replace: true })} />
          {panels[tab]()}
        </div>
      )}
    </RequireAccount>
  );
}
