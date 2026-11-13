import type { Binding, ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { BINDING_TYPE_LABEL, buttonLabel } from '../../lib/labels';

function detail(b: Binding): string {
  switch (b.type) {
    case 'burst': return `${b.count} toques cada ${b.gapMs} ms`;
    case 'turbo': return `${b.rate} toques/s`;
    case 'swipe': return `${b.durationMs} ms`;
    case 'macro': return `${b.steps.length} pasos`;
    case 'stick': return b.dpad ? 'también con la cruceta' : '';
    case 'look': return `sensibilidad ${b.sensitivity}`;
    default: return '';
  }
}

export function BindingTable({ config }: { config: ProfileConfig }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">Botón</th>
            <th scope="col" className="py-2 pr-4 font-medium">Acción</th>
            <th scope="col" className="py-2 font-medium">Detalle</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {config.bindings.map((b) => (
            <tr key={b.key}>
              <td className="py-2 pr-4 font-medium whitespace-nowrap">
                {b.modifier && <span className="text-warning">{buttonLabel(b.modifier)} + </span>}
                {buttonLabel(b.button)}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">{BINDING_TYPE_LABEL[b.type]}</td>
              <td className="py-2 text-muted">{detail(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
