import { useState } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { PageSpinner } from '../../components/ui/Spinner';
import { errorMessage } from '../../lib/errorMessage';
import { useBackgroundFromPlay, usePlayScreenshots } from '../../queries/moderation';

/**
 * Galeria con las capturas de la ficha de Google Play del juego. Al elegir una se copia al
 * Storage del proyecto y queda como fondo. Muchas son de marketing: conviene elegir una partida.
 */
export function PlayGallery({ packageName, gameName }: { packageName: string; gameName: string }) {
  const [open, setOpen] = useState(false);
  const shots = usePlayScreenshots(packageName, open);
  const choose = useBackgroundFromPlay();
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Elegir de Google Play</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Capturas de ${gameName} en Google Play`}>
        <p className="text-sm text-muted">
          Las 3 primeras capturas de la ficha. Elige una en la que se vea <strong className="text-ink">la partida</strong>;
          si son promocionales, los botones no coincidirán con el juego (mejor sube una captura tuya).
        </p>
        {shots.isPending ? <PageSpinner /> : shots.error ? (
          <Alert tone="error">{errorMessage(shots.error)}</Alert>
        ) : shots.data.length === 0 ? (
          <p className="text-sm text-muted">La ficha no tiene capturas horizontales.</p>
        ) : (
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
            {shots.data.map((s) => (
              <button key={s.id} type="button" onClick={() => setPicked(s.id)} aria-pressed={picked === s.id}
                className={`overflow-hidden rounded-lg border-2 transition-colors ${picked === s.id ? 'border-primary' : 'border-transparent hover:border-line'}`}>
                <img src={s.thumbUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-auto w-full" />
              </button>
            ))}
          </div>
        )}
        {choose.error && <Alert tone="error">{errorMessage(choose.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button disabled={!picked} loading={choose.isPending} onClick={() => picked && choose.mutate(
            { packageName, screenshotId: picked },
            { onSuccess: () => { setOpen(false); setPicked(null); } },
          )}>
            Usar como fondo
          </Button>
        </div>
      </Dialog>
    </>
  );
}
