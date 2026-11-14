import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from '@domain/report/ReportReason';
import { useState } from 'react';
import { useT } from '../../i18n/I18nContext';
import { useAccount } from '../../queries/account';
import { useReportProfile } from '../../queries/profiles';
import { REPORT_REASON_LABEL } from '../../lib/labels';
import { SignInButton } from '../auth/SignInButton';
import { errorMessage } from '../../lib/errorMessage';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { FlagIcon } from '../ui/icons';

export function ReportButton({ id }: { id: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" icon={<FlagIcon />} onClick={() => setOpen(true)}>{t('Reportar')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('Reportar este perfil')}>
        {open && <ReportForm id={id} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function ReportForm({ id, onDone }: { id: string; onDone: () => void }) {
  const t = useT();
  const { data: account } = useAccount();
  const report = useReportProfile();
  const [reason, setReason] = useState<ReportReason>('broken');
  const [details, setDetails] = useState('');

  if (!account) {
    return (
      <div className="space-y-4 text-sm text-muted">
        <p>{t('Para evitar reportes falsos, hace falta iniciar sesión con GitHub.')}</p>
        <SignInButton />
      </div>
    );
  }
  if (report.isSuccess) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t('Gracias. Lo revisaremos; con varios reportes el perfil se oculta automáticamente.')}</Alert>
        <Button onClick={onDone}>{t('Cerrar')}</Button>
      </div>
    );
  }
  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      report.mutate({ id, reason, details });
    }}>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm text-muted">{t('Motivo')}</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)}
              className="accent-primary-strong" />
            <span className="text-sm">{t(REPORT_REASON_LABEL[r])}</span>
          </label>
        ))}
      </fieldset>
      <input className="input" placeholder={t('Detalles (opcional)')} maxLength={REPORT_DETAILS_MAX} value={details}
        onChange={(e) => setDetails(e.target.value)} />
      {report.error && <Alert tone="error">{errorMessage(report.error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>{t('Cancelar')}</Button>
        <Button type="submit" variant="danger" loading={report.isPending}>{t('Enviar reporte')}</Button>
      </div>
    </form>
  );
}
