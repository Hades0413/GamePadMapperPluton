import type { ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { fitConfig, sameRatio } from '@domain/profile/conf/fit';
import { useMemo, useState, type ReactNode } from 'react';
import { useT } from '../../i18n/I18nContext';
import { ratioLabel, visitorScreen } from '../../lib/device';
import { useImageSize } from '../../lib/useImageSize';
import { ExpandIcon } from '../ui/icons';
import { Lightbox, type LightboxItem } from '../ui/Lightbox';
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
 * Vista previa de un perfil, IDENTICA en cualquier dispositivo que la mire (PC, movil o tablet):
 *  - «Sobre el juego»: la captura ENTERA, en su proporcion real, y los botones adaptados a la
 *    pantalla de esa captura con la misma formula que usa la app (anclados a los bordes). Asi
 *    se ve como quedaria el perfil en el movil de la captura, sin recortes ni descuadres.
 *  - «Esquema»: el perfil tal como se hizo, en su propia pantalla.
 *  - En un movil o tablet con otra proporcion, «En tu pantalla» (opcional, en esquema) muestra
 *    como quedara en ese dispositivo.
 */
export function PreviewPanel({
  config, background, title, footer,
}: { config: ProfileConfig; background: string | null; title?: string; footer?: ReactNode }) {
  const t = useT();
  const [overGame, setOverGame] = useState(true);
  const [myScreen] = useState(visitorScreen);
  const differs = myScreen !== null && !sameRatio(config.screen, myScreen);
  const [onMine, setOnMine] = useState(false);
  const shown = useMemo(
    () => (differs && onMine && myScreen ? fitConfig(config, myScreen) : config),
    [config, differs, onMine, myScreen],
  );
  const adapted = differs && onMine;
  const capture = useImageSize(background);
  // Sobre la captura: los botones adaptados a la pantalla de la captura (la imagen no se recorta).
  const fittedToCapture = useMemo(() => (capture ? fitConfig(config, capture) : null), [config, capture]);
  const onCapture = overGame && !adapted ? fittedToCapture : null;
  const bg = onCapture ? background : null;
  const drawn = onCapture ?? shown;
  const [zoom, setZoom] = useState(false);

  // Vistas para el visor a pantalla completa (anterior / siguiente).
  const views = useMemo(() => {
    const list: { key: string; item: LightboxItem }[] = [];
    const ratioOf = (c: ProfileConfig) => c.screen.width / c.screen.height;
    if (fittedToCapture && background) {
      list.push({ key: 'juego', item: { label: t('Sobre el juego'), ratio: ratioOf(fittedToCapture),
        content: <ProfilePreview config={fittedToCapture} background={background} /> } });
    }
    list.push({ key: 'esquema', item: { label: t('Esquema'), ratio: ratioOf(config), content: <ProfilePreview config={config} /> } });
    if (differs && myScreen) {
      const mine = fitConfig(config, myScreen);
      list.push({ key: 'mia', item: { label: t('En tu pantalla'), ratio: ratioOf(mine), content: <ProfilePreview config={mine} /> } });
    }
    return list;
  }, [fittedToCapture, background, config, differs, myScreen, t]);
  const currentKey = adapted ? 'mia' : onCapture ? 'juego' : 'esquema';
  const start = Math.max(0, views.findIndex((v) => v.key === currentKey));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title ?? t('Vista previa')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {differs && (
            <Segmented label={t('Pantalla')} value={onMine} onChange={setOnMine}
              options={[[false, t('Original')], [true, t('En tu pantalla')]] as const} />
          )}
          {background && !adapted && (
            <Segmented label={t('Fondo')} value={overGame} onChange={setOverGame}
              options={[[true, t('Sobre el juego')], [false, t('Esquema')]] as const} />
          )}
          <button type="button" onClick={() => setZoom(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1 text-xs text-muted hover:text-ink">
            <ExpandIcon className="size-3.5" />{t('Ampliar')}
          </button>
        </div>
      </div>
      <button type="button" onClick={() => setZoom(true)} aria-label={t('Ver la vista previa a pantalla completa')}
        className="block w-full cursor-zoom-in rounded-xl focus-visible:outline-2 focus-visible:outline-primary">
        <ProfilePreview config={drawn} background={bg} />
      </button>
      <Lightbox items={views.map((v) => v.item)} open={zoom} start={start} onClose={() => setZoom(false)} />
      <p className="text-xs text-muted">
        {t('Morado: botones · Amarillo: capas (mantener otro botón) · Turquesa: joystick, cámara y deslizar.')}
        {differs && onMine && myScreen &&
          ` ${t('Adaptado a tu pantalla ({ratio}): los botones se mueven con los bordes, como en el juego (sin la captura, que no se puede recolocar igual).', { ratio: ratioLabel(myScreen) })}`}
        {differs && !onMine && ` ${t('Hecho en una pantalla {ratio}.', { ratio: ratioLabel(config.screen) })}`}
        {onCapture && capture && !sameRatio(config.screen, capture) &&
          ` ${t('Botones adaptados a la pantalla de la captura ({ratio}), como lo haría la app.', { ratio: ratioLabel(capture) })}`}
        {bg && ` ${t('La captura del juego es orientativa.')}`}
      </p>
      {footer}
    </div>
  );
}
