import type { MappingStatus } from '@domain/controller/ControllerMapping';
import { SDL_KEY_LABEL, type SdlField } from '@domain/controller/sdlMapping';
import { useState } from 'react';
import { useT } from '../../i18n/I18nContext';
import { copyText } from '../../lib/files';
import { CopyIcon } from '../ui/icons';
import { Button } from '../ui/Button';

/** Controles de una linea SDL como tabla legible (A → b1, Stick izq. X → a0…). */
export function MappingFields({ fields }: { fields: readonly SdlField[] }) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => (
        <div key={f.key} className="flex min-w-0 items-center justify-between gap-3 border-b border-line/60 py-1 text-sm">
          <span className="min-w-0 truncate text-muted">{t(SDL_KEY_LABEL[f.key])}</span>
          <code className="shrink-0 font-mono text-xs">{f.value}</code>
        </div>
      ))}
    </div>
  );
}

/** La linea SDL completa (sin desbordar en pantallas estrechas) con un boton para copiarla. */
export function MappingLine({ mapping }: { mapping: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <pre className="max-h-48 overflow-auto rounded-lg bg-bg p-3 font-mono text-xs break-all whitespace-pre-wrap text-muted">{mapping}</pre>
      <Button size="sm" variant="secondary" icon={<CopyIcon />}
        onClick={() => void copyText(mapping).then((ok) => setCopied(ok))}>
        {copied ? t('Copiada') : t('Copiar línea')}
      </Button>
    </div>
  );
}

const BADGE: Record<MappingStatus, string> = {
  pending: 'bg-warning/15 text-warning',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-danger/15 text-danger',
};

export function StatusBadge({ status }: { status: MappingStatus }) {
  const t = useT();
  const label = status === 'pending' ? t('Pendiente') : status === 'approved' ? t('Aprobado') : t('Rechazado');
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${BADGE[status]}`}>{label}</span>;
}
