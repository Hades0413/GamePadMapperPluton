import { CONF_MAX_BINDINGS, type Binding, type ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { newBinding, nextFreeKey } from '@domain/profile/conf/editConf';
import { useState } from 'react';
import { useT } from '../../i18n/I18nContext';
import { buttonLabel, shortLabel } from '../../lib/labels';
import { Button } from '../ui/Button';
import { BindingPanel } from './BindingPanel';
import { EditorCanvas } from './EditorCanvas';

/**
 * Colocar los botones arrastrandolos sobre la pantalla: lienzo, lista de botones y el panel del
 * boton elegido. Lo usan el editor visual (/editor) y los formularios de subir y editar perfil.
 */
export function PlacementArea({
  config, background, backgroundNote = null, onChange,
}: {
  config: ProfileConfig;
  background: string | null;
  /** Aviso sobre el fondo (ya traducido) o null. */
  backgroundNote?: string | null;
  onChange: (config: ProfileConfig) => void;
}) {
  const t = useT();
  const [selected, setSelected] = useState<number | null>(config.bindings.length > 0 ? 0 : null);
  const sel = selected !== null ? config.bindings[selected] : undefined;
  const setBindings = (bindings: readonly Binding[]) => onChange({ ...config, bindings });
  const replace = (index: number, b: Binding) => setBindings(config.bindings.map((x, i) => (i === index ? b : x)));
  const remove = (index: number) => {
    setBindings(config.bindings.filter((_, i) => i !== index));
    setSelected(config.bindings.length > 1 ? Math.min(index, config.bindings.length - 2) : null);
  };
  const add = () => {
    setBindings([...config.bindings, newBinding(nextFreeKey(config.bindings), config.screen)]);
    setSelected(config.bindings.length);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-3">
        <EditorCanvas config={config} background={background} selected={selected} onSelect={setSelected}
          onChange={replace} onDelete={remove} />
        <p className="text-xs text-muted">
          {t('Arrastra los círculos con el ratón o el dedo. Con el teclado: flechas para mover (Mayús = pasos grandes) y Supr para borrar.')}
          {' '}{t('Morado: botones · Amarillo: capas (mantener otro botón) · Turquesa: joystick, cámara y deslizar.')}
          {background && backgroundNote && ` ${backgroundNote}`}
        </p>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Botones del perfil')}>
          {config.bindings.map((b, i) => (
            <button key={`${i}:${b.key}`} type="button" aria-pressed={i === selected} onClick={() => setSelected(i)}
              title={buttonLabel(b.key, t)}
              className={`rounded-lg border px-2.5 py-1 font-mono text-xs ${i === selected ? 'border-primary bg-primary/15 text-ink' : 'border-line text-muted hover:text-ink'}`}>
              {b.modifier ? `${shortLabel(b.modifier)}+${shortLabel(b.button)}` : shortLabel(b.button)}
            </button>
          ))}
          <Button size="sm" variant="secondary" onClick={add} disabled={config.bindings.length >= CONF_MAX_BINDINGS}>
            + {t('Añadir botón')}
          </Button>
        </div>
      </div>

      <aside className="card p-4 lg:sticky lg:top-20" aria-label={t('Botón seleccionado')}>
        {sel && selected !== null
          ? <BindingPanel key={selected} binding={sel} screen={config.screen} onChange={(b) => replace(selected, b)} onDelete={() => remove(selected)} />
          : <p className="text-sm text-muted">{t('Selecciona un botón del dibujo o de la lista, o añade uno nuevo.')}</p>}
      </aside>
    </div>
  );
}
