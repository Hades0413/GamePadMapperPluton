import type { Binding, ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import type { TFunction } from '../../i18n/translate';
import { useT } from '../../i18n/I18nContext';
import { BINDING_TYPE_LABEL, buttonLabel } from '../../lib/labels';

function detail(b: Binding, t: TFunction): string {
  switch (b.type) {
    case 'burst': return t('{count} toques cada {gap} ms', { count: b.count, gap: b.gapMs });
    case 'turbo': return t('{rate} toques/s', { rate: b.rate });
    case 'swipe': return `${b.durationMs} ms`;
    case 'macro': return t('{n} pasos', { n: b.steps.length });
    case 'stick': return b.dpad ? t('también con la cruceta') : '';
    case 'look': return t('sensibilidad {n}', { n: b.sensitivity });
    default: return '';
  }
}

export function BindingTable({ config }: { config: ProfileConfig }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">{t('Botón')}</th>
            <th scope="col" className="py-2 pr-4 font-medium">{t('Acción')}</th>
            <th scope="col" className="py-2 font-medium">{t('Detalle')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {config.bindings.map((b) => (
            <tr key={b.key}>
              <td className="py-2 pr-4 font-medium whitespace-nowrap">
                {b.modifier && <span className="text-warning">{buttonLabel(b.modifier, t)} + </span>}
                {buttonLabel(b.button, t)}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">{t(BINDING_TYPE_LABEL[b.type])}</td>
              <td className="py-2 text-muted">{detail(b, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
