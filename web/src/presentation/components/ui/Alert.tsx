import { useT } from '../../i18n/I18nContext';
import { errorMessage } from '../../lib/errorMessage';
import type { ReactNode } from 'react';

type Tone = 'error' | 'info' | 'success' | 'warning';

const TONE: Record<Tone, string> = {
  error: 'border-danger/40 bg-danger/10 text-danger',
  info: 'border-primary/40 bg-primary/10 text-ink',
  success: 'border-success/40 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/10 text-warning',
};

export function Alert({ tone = 'info', children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${TONE[tone]}`}
    >
      <div className="min-w-0 flex-1 whitespace-pre-line">{children}</div>
      {action}
    </div>
  );
}

export function ErrorAlert({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  return (
    <Alert
      tone="error"
      action={
        onRetry && (
          <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
            {t('Reintentar')}
          </button>
        )
      }
    >
      {errorMessage(error)}
    </Alert>
  );
}
