import type { ControllerType } from '@domain/profile/GameProfile';
import { useT } from '../../i18n/I18nContext';
import { CONTROLLER_TYPE_LABEL } from '../../lib/labels';
import { GamepadIcon } from '../ui/icons';

/** Color del distintivo de cada tipo (clases fijas para que Tailwind las genere). */
const TONE: Record<ControllerType, string> = {
  xbox: 'bg-success/15 text-success',
  playstation: 'bg-primary/15 text-primary',
  nintendo: 'bg-danger/15 text-danger',
  '8bitdo': 'bg-warning/20 text-warning',
  generico: 'bg-surface text-muted',
  otro: 'bg-surface text-muted',
};

/** Mando con el que se hizo el perfil y su tipo («PlayStation · Wireless Controller (054c:05c4)»). Texto plano. */
export function ControllerBadge({
  model, type, className = '',
}: { model: string | null; type: ControllerType | null; className?: string }) {
  const t = useT();
  if (!model) return null;
  return (
    <span title={t('Mando: {name}', { name: model })}
      className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted ${className}`}>
      <GamepadIcon className="size-3 shrink-0" aria-hidden="true" />
      {type && (
        <span className={`shrink-0 rounded px-1 text-[10px] font-semibold ${TONE[type]}`}>{t(CONTROLLER_TYPE_LABEL[type])}</span>
      )}
      <span className="truncate">{model}</span>
    </span>
  );
}
