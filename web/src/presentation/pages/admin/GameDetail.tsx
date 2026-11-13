import type { Game } from '@domain/game/Game';
import type { GameImageKind } from '@domain/game/GameImage';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { GameIcon } from '../../components/profile/GameIcon';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { errorMessage } from '../../lib/errorMessage';
import { prepareGameImage } from '../../lib/images';
import { useImportGame, useSetGameImage, useUpdateGame } from '../../queries/moderation';
import { paths } from '../../routes/paths';
import { FilePicker } from './FilePicker';
import { Feedback, Step } from './Step';

/** Subir / quitar una imagen del juego, con su vista previa y mensajes. */
function useImageActions(packageName: string, kind: GameImageKind) {
  const set = useSetGameImage();
  const [prepError, setPrepError] = useState<string | null>(null);
  const upload = (file: File) => {
    setPrepError(null);
    prepareGameImage(file, kind).then(
      (img) => set.mutate({ packageName, kind, file: img }),
      (err: unknown) => setPrepError(errorMessage(err)),
    );
  };
  const remove = () => set.mutate({ packageName, kind, file: null });
  const error = prepError ?? (set.error ? errorMessage(set.error) : null);
  return { upload, remove, pending: set.isPending, error, done: set.isSuccess };
}

function IconStep({ game }: { game: Game }) {
  const importer = useImportGame();
  const image = useImageActions(game.packageName, 'icon');
  return (
    <Step n={1} title="Icono" done={!!game.iconUrl}>
      <div className="flex flex-wrap items-center gap-5">
        <GameIcon name={game.name} iconUrl={game.iconUrl} size={88} />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-muted">
            Lo más fácil: traerlo de Google Play. Si el juego no está en la tienda, sube una imagen (se recorta en cuadrado).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" loading={importer.isPending}
              onClick={() => importer.mutate({ packageName: game.packageName, updateName: true })}>
              Traer de Google Play
            </Button>
            <FilePicker disabled={image.pending} onFile={image.upload}>
              {image.pending ? 'Subiendo…' : 'Subir imagen'}
            </FilePicker>
            {game.iconUrl && <Button size="sm" variant="ghost" onClick={image.remove}>Quitar</Button>}
          </div>
          <Feedback ok={(importer.isSuccess && 'Icono y nombre traídos de Google Play') || (image.done && 'Icono actualizado')}
            error={importer.error ? errorMessage(importer.error) : image.error} />
        </div>
      </div>
    </Step>
  );
}

function BackgroundStep({ game }: { game: Game }) {
  const image = useImageActions(game.packageName, 'background');
  return (
    <Step n={2} title="Captura del juego" done={!!game.backgroundUrl}>
      <p className="text-sm text-muted">
        Se usa para la vista previa «Sobre el juego». Haz una captura <strong className="text-ink">en horizontal y en
        partida</strong> (con los controles táctiles a la vista), sin tu nombre ni el chat.
      </p>
      {game.backgroundUrl ? (
        <img src={game.backgroundUrl} alt={`Captura de ${game.name}`}
          className="aspect-video w-full rounded-xl border border-line object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
          Aún no tiene captura
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <FilePicker variant="primary" disabled={image.pending} onFile={image.upload}>
          {image.pending ? 'Subiendo…' : game.backgroundUrl ? 'Cambiar captura' : 'Subir captura'}
        </FilePicker>
        {game.backgroundUrl && <Button size="sm" variant="ghost" onClick={image.remove}>Quitar</Button>}
      </div>
      <Feedback ok={image.done && 'Captura actualizada'} error={image.error} />
    </Step>
  );
}

function NameStep({ game }: { game: Game }) {
  const update = useUpdateGame();
  const [name, setName] = useState(game.name);
  const [confirmHide, setConfirmHide] = useState(false);
  const save = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({ packageName: game.packageName, name, hidden: false });
  };
  return (
    <Step n={3} title="Nombre" done optional>
      <form className="flex flex-wrap gap-2" onSubmit={save}>
        <input className="input min-w-0 flex-1" value={name} maxLength={60} onChange={(e) => setName(e.target.value)}
          aria-label="Nombre del juego" />
        <Button type="submit" size="md" variant="secondary" loading={update.isPending}
          disabled={name.trim() === game.name}>
          Guardar
        </Button>
      </form>
      <Feedback ok={update.isSuccess && !confirmHide && 'Nombre guardado'} error={update.error ? errorMessage(update.error) : null} />
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-sm text-muted">Ocultar el juego quita todos sus perfiles de la web y la app, y no admite nuevos.</p>
        <Button size="sm" variant="danger" className="shrink-0 whitespace-nowrap" onClick={() => setConfirmHide(true)}>Ocultar juego</Button>
      </div>
      <Dialog open={confirmHide} onClose={() => setConfirmHide(false)} title={`¿Ocultar ${game.name}?`}>
        <p className="text-sm text-muted">
          Desaparecerá de la comunidad con todos sus perfiles. Solo se puede volver a mostrar desde el panel de Supabase.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmHide(false)}>Cancelar</Button>
          <Button variant="danger" loading={update.isPending} onClick={() =>
            update.mutate({ packageName: game.packageName, name: game.name, hidden: true },
              { onSuccess: () => setConfirmHide(false) })}>
            Ocultar
          </Button>
        </div>
      </Dialog>
    </Step>
  );
}

export function GameDetail({ game, onBack }: { game: Game; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-muted hover:text-ink lg:hidden">← Todos los juegos</button>
      <header className="flex items-center gap-4">
        <GameIcon name={game.name} iconUrl={game.iconUrl} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold">{game.name}</h2>
          <p className="truncate font-mono text-xs text-muted">{game.packageName}</p>
        </div>
        <Link to={paths.game(game.packageName)} className="text-sm text-primary hover:underline">Ver en la web</Link>
      </header>
      {/* key: al cambiar de juego se reinician formularios y mensajes */}
      <IconStep key={`i-${game.packageName}`} game={game} />
      <BackgroundStep key={`b-${game.packageName}`} game={game} />
      <NameStep key={`n-${game.packageName}-${game.name}`} game={game} />
    </div>
  );
}
