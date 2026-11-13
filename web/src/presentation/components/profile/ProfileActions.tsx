import { profileFileName, type GameProfile } from '@domain/profile/GameProfile';
import { useState } from 'react';
import { canShare, copyText, downloadText } from '../../lib/files';
import { Button } from '../ui/Button';
import { CopyIcon, DownloadIcon, ShareIcon } from '../ui/icons';

/**
 * Formas de llevar el perfil a la app:
 *  - Enviar a la app: menu "Compartir" de Android -> Gamepad Mapper Pluton lo importa.
 *  - Descargar el archivo .conf o copiar el texto.
 */
export function ProfileActions({ profile }: { profile: GameProfile }) {
  const [copied, setCopied] = useState(false);
  const share = canShare();

  return (
    <div className="flex flex-wrap gap-2">
      {share && (
        <Button icon={<ShareIcon />} onClick={() => {
          navigator.share({ title: profile.title, text: profile.conf }).catch(() => undefined);
        }}>
          Enviar a la app
        </Button>
      )}
      <Button variant={share ? 'secondary' : 'primary'} icon={<DownloadIcon />}
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
