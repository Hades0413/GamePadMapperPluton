import { useSearchParams } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useGames } from '../queries/games';
import { useReportedProfiles } from '../queries/moderation';
import { GamesPanel } from './admin/GamesPanel';
import { ReportsPanel } from './admin/ReportsPanel';

type Tab = 'juegos' | 'reportes';

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const reported = useReportedProfiles();
  const games = useGames('');
  const toFix = (games.data?.pages.flatMap((p) => p.items) ?? []).filter((g) => !g.iconUrl || !g.backgroundUrl).length;
  const pending = reported.data?.length ?? 0;
  const items: [Tab, string, number, string][] = [
    ['juegos', 'Juegos', toFix, 'bg-warning/20 text-warning'],
    ['reportes', 'Reportes', pending, 'bg-danger/20 text-danger'],
  ];
  return (
    <div role="tablist" aria-label="Secciones" className="flex gap-1 border-b border-line">
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
  const tab: Tab = params.get('tab') === 'reportes' ? 'reportes' : 'juegos';
  return (
    <RequireAccount admin reason="Inicia sesión como administrador.">
      {() => (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Moderación</h1>
            <p className="mt-1 text-muted">Completa los juegos (icono y captura) y revisa los perfiles reportados.</p>
          </div>
          <Tabs tab={tab} onChange={(t) => setParams(t === 'juegos' ? {} : { tab: t }, { replace: true })} />
          {tab === 'juegos' ? <GamesPanel /> : <ReportsPanel />}
        </div>
      )}
    </RequireAccount>
  );
}
