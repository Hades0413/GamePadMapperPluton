import type { ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { useState, type ReactNode } from 'react';
import { ProfilePreview } from './ProfilePreview';

/**
 * Vista previa de un perfil con selector «Sobre el juego» / «Esquema» cuando el juego tiene captura.
 * Se usa en la ficha del perfil y al subir o editar uno.
 */
export function PreviewPanel({
  config, background, title = 'Vista previa', footer,
}: { config: ProfileConfig; background: string | null; title?: string; footer?: ReactNode }) {
  const [overGame, setOverGame] = useState(true);
  const shown = overGame ? background : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {background && (
          <div role="tablist" aria-label="Fondo" className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-xs">
            {([[true, 'Sobre el juego'], [false, 'Esquema']] as const).map(([value, label]) => (
              <button key={label} type="button" role="tab" aria-selected={overGame === value} onClick={() => setOverGame(value)}
                className={`rounded-md px-3 py-1 ${overGame === value ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ProfilePreview config={config} background={shown} />
      <p className="text-xs text-muted">
        Morado: botones · Amarillo: capas (mantener otro botón) · Turquesa: joystick, cámara y deslizar.
        {shown && ' La captura es orientativa: si tu pantalla tiene otra proporción, los botones pueden quedar algo desplazados.'}
      </p>
      {footer}
    </div>
  );
}
