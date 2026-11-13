import { profileFileName, type GameProfile } from '@domain/profile/GameProfile';
import { useState } from 'react';
import { useLinks } from '../../di/ServicesContext';
import { appLink, canShare, copyText, downloadText, isAndroid } from '../../lib/files';
import { Button } from '../ui/Button';
import { CopyIcon, DownloadIcon, GamepadIcon, ShareIcon } from '../ui/icons';

/**
 * Formas de llevar el perfil a la app:
 *  - Abrir en la app (Android): abre la ficha del perfil en la app; si no esta instalada, Google Play.
 *  - Enviar a la app: menu "Compartir" de Android -> Gamepad Mapper Pluton lo importa.
 *  - Descargar el archivo .conf o copiar el texto.
 */
export function ProfileActions({ profile }: { profile: GameProfile }) {
  const [copied, setCopied] = useState(false);
  const { playUrl } = useLinks();
  const share = canShare();
  const android = isAndroid();

  return (
    <div className="flex flex-wrap gap-2">
      {android && (
        <a href={appLink(profile.id, playUrl)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-strong px-4 text-sm font-medium text-white shadow-lg shadow-primary-strong/20 hover:bg-primary">
          <GamepadIcon />
          Abrir en la app
        </a>
      )}
      {share && (
        <Button variant={android ? 'secondary' : 'primary'} icon={<ShareIcon />} onClick={() => {
          navigator.share({ title: profile.title, text: profile.conf }).catch(() => undefined);
        }}>
          Enviar a la app
        </Button>
      )}
      <Button variant={share || android ? 'secondary' : 'primary'} icon={<DownloadIcon />}
        onClick={() => downloadText(profileFileName(profile), `${profile.conf}\n`)}>
        Descargar .conf
      </Button>
      <Button variant="secondary" icon={<CopyIcon />} onClick={() => {
        void copyText(profile.conf).then((ok) => {
          setCopied(ok);
          if (ok) setTimeout(() => setCopied(false), 2000);
        });
      }}>
        {copied ? '¡Copiado!' : 'Copiar'}
      </Button>
    </div>
  );
}
