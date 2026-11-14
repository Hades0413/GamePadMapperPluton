import type { ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { fitConfig, sameRatio } from '@domain/profile/conf/fit';
import { useMemo, useState, type ReactNode } from 'react';
import { ratioLabel, visitorScreen } from '../../lib/device';
import { ProfilePreview } from './ProfilePreview';

function Segmented<T extends string | boolean>({
  value, options, onChange, label,
}: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5 text-xs">
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 ${value === v ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Vista previa de un perfil:
 *  - «Sobre el juego» / «Esquema» si el juego tiene captura.
 *  - En un movil con otra proporcion de pantalla, «En tu pantalla» muestra como quedara
 *    (botones anclados a los bordes, igual que hace la app) o «Original».
 */
export function PreviewPanel({
  config, background, title = 'Vista previa', footer,
}: { config: ProfileConfig; background: string | null; title?: string; footer?: ReactNode }) {
  const [overGame, setOverGame] = useState(true);
  const [myScreen] = useState(visitorScreen);
  const differs = myScreen !== null && !sameRatio(config.screen, myScreen);
  const [onMine, setOnMine] = useState(true);
  const shown = useMemo(
    () => (differs && onMine && myScreen ? fitConfig(config, myScreen) : config),
    [config, differs, onMine, myScreen],
  );
  const bg = overGame ? background : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <div className="flex flex-wrap gap-2">
          {differs && (
            <Segmented label="Pantalla" value={onMine} onChange={setOnMine}
              options={[[true, 'En tu pantalla'], [false, 'Original']] as const} />
          )}
          {background && (
            <Segmented label="Fondo" value={overGame} onChange={setOverGame}
              options={[[true, 'Sobre el juego'], [false, 'Esquema']] as const} />
          )}
        </div>
      </div>
      <ProfilePreview config={shown} background={bg} />
      <p className="text-xs text-muted">
        Morado: botones · Amarillo: capas (mantener otro botón) · Turquesa: joystick, cámara y deslizar.
        {differs && onMine && myScreen &&
          ` Adaptado a tu pantalla (${ratioLabel(myScreen)}): los botones se mueven con los bordes, como en el juego.`}
        {differs && !onMine && ` Hecho en una pantalla ${ratioLabel(config.screen)}.`}
        {bg && ' La captura del juego es orientativa.'}
      </p>
      {footer}
    </div>
  );
}
