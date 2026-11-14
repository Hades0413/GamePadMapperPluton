import { leadingComments } from '@domain/profile/conf/confMeta';
import type { ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { serializeConf } from '@domain/profile/conf/serializeConf';
import { useState } from 'react';
import { useT } from '../../i18n/I18nContext';
import { useReferenceImage } from '../../lib/referenceImage';
import { Button } from '../ui/Button';
import { PlacementArea } from './PlacementArea';
import { ReferenceImagePicker } from './ReferenceImagePicker';

/**
 * «Colocar botones visualmente» dentro de los formularios de subir y editar perfil: el mismo
 * lienzo que el editor visual sobre la captura del juego (si la hay) o sobre una imagen de
 * referencia local. Al aplicar, el perfil vuelve al campo del formulario (serializeConf),
 * conservando los comentarios del principio (# modelo, # mando...). La imagen de referencia se
 * libera al aplicar, al cancelar y al cerrar.
 */
export function VisualPlacement({
  initial, conf, gameBackground, onApply, onCancel,
}: {
  /** Perfil ya interpretado (valido) del formulario. */
  initial: ProfileConfig;
  /** Texto original (para conservar sus comentarios del principio). */
  conf: string;
  gameBackground: string | null;
  onApply: (conf: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [config, setConfig] = useState(initial);
  const [overGame, setOverGame] = useState(true);
  const reference = useReferenceImage();
  const background = reference.url ?? (overGame ? gameBackground : null);

  const apply = () => {
    reference.clear();
    onApply(leadingComments(conf) + serializeConf(config));
  };
  const cancel = () => {
    reference.clear();
    onCancel();
  };

  return (
    <section className="space-y-4" aria-label={t('Colocar botones visualmente')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{t('Colocar botones visualmente')}</h2>
          <p className="text-xs text-muted">
            {t('pantalla {w}×{h}', { w: config.screen.width, h: config.screen.height })}
            {' · '}{t('{n} botones', { n: config.bindings.length })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {gameBackground && !reference.url && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-primary" checked={overGame} onChange={(e) => setOverGame(e.target.checked)} />
              {t('Sobre el juego')}
            </label>
          )}
          <Button variant="ghost" size="sm" onClick={cancel}>{t('Cancelar')}</Button>
          <Button size="sm" onClick={apply}>{t('Aplicar al perfil')}</Button>
        </div>
      </div>

      <ReferenceImagePicker active={!!reference.url} problem={reference.problem}
        onPick={(f) => void reference.pick(f)} onClear={reference.clear} />

      <PlacementArea config={config} background={background} onChange={setConfig}
        backgroundNote={reference.url ? t('Imagen de referencia (solo en este navegador).') : t('La captura del juego es orientativa.')} />

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={cancel}>{t('Cancelar')}</Button>
        <Button onClick={apply}>{t('Aplicar al perfil')}</Button>
      </div>
    </section>
  );
}
