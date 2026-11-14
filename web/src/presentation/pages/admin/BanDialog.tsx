import { BAN_DAYS, MODERATION_REASON_MAX, type BanDays } from '@domain/moderation/Moderation';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { errorMessage } from '../../lib/errorMessage';
import { useBanAuthor } from '../../queries/moderation';

const DURATION_LABEL: Record<BanDays, string> = { 1: '1 día', 7: '7 días', 30: '30 días' };

/** Bloquear a un autor: temporal (1, 7 o 30 dias) o para siempre, con un motivo opcional. */
export function BanDialog({
  open, onClose, authorId, username,
}: { open: boolean; onClose: () => void; authorId: string; username: string }) {
  const ban = useBanAuthor();
  const [days, setDays] = useState<BanDays | 'siempre'>(7);
  const [reason, setReason] = useState('');
  const permanent = days === 'siempre';
  return (
    <Dialog open={open} onClose={onClose} title={`¿Bloquear a @${username}?`}>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm text-muted">Duración</legend>
        {[...BAN_DAYS, 'siempre' as const].map((d) => (
          <label key={d} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1 hover:bg-surface-2">
            <input type="radio" name={`ban-${authorId}`} checked={days === d} onChange={() => setDays(d)} className="accent-primary-strong" />
            <span className="text-sm">{d === 'siempre' ? 'Para siempre' : DURATION_LABEL[d]}</span>
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-muted">
        {permanent
          ? 'Se ocultarán todos sus perfiles y no podrá volver a participar, aunque borre la cuenta y vuelva a entrar.'
          : 'Mientras dure no podrá publicar, comentar, dar «me gusta», reportar ni enviar mandos. Su contenido sigue visible.'}
      </p>
      <input className="input" placeholder="Motivo (opcional, queda en el historial)" maxLength={MODERATION_REASON_MAX}
        value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo" />
      {ban.error && <Alert tone="error">{errorMessage(ban.error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" loading={ban.isPending} onClick={() => ban.mutate(
          { authorId, days: permanent ? null : days, reason },
          { onSuccess: () => { setReason(''); onClose(); } },
        )}>
          Bloquear
        </Button>
      </div>
    </Dialog>
  );
}
