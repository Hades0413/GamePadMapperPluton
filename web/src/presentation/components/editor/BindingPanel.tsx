import type { Binding, BindingType, ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { MACRO_MAX_STEPS } from '@domain/profile/conf/ProfileConfig';
import {
  addStep, LAYER_MODIFIERS, patchBinding, patchStep, removeStep, retype, STANDARD_BUTTONS, withKey,
  type MacroBinding,
} from '@domain/profile/conf/editConf';
import { CONF_KEY } from '@domain/profile/conf/validateConf';
import { useState, type ReactNode } from 'react';
import { useT } from '../../i18n/I18nContext';
import { BINDING_TYPE_LABEL, buttonLabel } from '../../lib/labels';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

/** Campo numerico que deja borrar y reescribir sin saltos (solo avisa de valores numericos). */
export function NumberField({
  label, value, onChange, min = 0, max, step = 1, hint,
}: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; hint?: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Field label={label} hint={hint}>
      {(a) => (
        <input {...a} type="number" inputMode="decimal" className="input" min={min} max={max} step={step}
          value={text ?? String(value)}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(Math.max(min, max === undefined ? n : Math.min(max, n)));
          }}
          onBlur={() => setText(null)} />
      )}
    </Field>
  );
}

const CUSTOM = '__custom';
const TYPES = Object.keys(BINDING_TYPE_LABEL) as BindingType[];

/** Panel del boton seleccionado: tecla, capa, tipo y valores propios del tipo. */
export function BindingPanel({
  binding: b, screen, onChange, onDelete,
}: { binding: Binding; screen: ProfileConfig['screen']; onChange: (b: Binding) => void; onDelete: () => void }) {
  const t = useT();
  const standard = (STANDARD_BUTTONS as readonly string[]).includes(b.button);
  const [custom, setCustom] = useState(!standard);
  const keyError = CONF_KEY.test(b.key) ? null : t('Usa letras mayúsculas, números y _ (por ejemplo KB_W, AXIS_9+, BTN_13A).');
  const num = (key: string) => (n: number) => onChange(patchBinding(b, { [key]: n } as Partial<Binding>));
  const point = (key: 'at' | 'to', axis: 'x' | 'y') => (n: number) =>
    onChange({ ...b, [key]: { ...(b as { at: { x: number; y: number }; to: { x: number; y: number } })[key], [axis]: n } } as Binding);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t('Botón seleccionado')}: <span className="text-primary">{b.key || '—'}</span></h2>
        <Button variant="danger" size="sm" onClick={onDelete}>{t('Eliminar')}</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <Field label={t('Tecla o botón')} hint={custom ? t('Teclas KB_*, ratón MOUSE_*, jugador 2 P2_*: solo sin root.') : undefined}>
          {(a) => (
            <select {...a} className="input" value={custom ? CUSTOM : b.button}
              onChange={(e) => {
                if (e.target.value === CUSTOM) setCustom(true);
                else { setCustom(false); onChange(withKey(b, e.target.value, b.modifier)); }
              }}>
              {STANDARD_BUTTONS.map((k) => <option key={k} value={k}>{k} · {buttonLabel(k, t)}</option>)}
              <option value={CUSTOM}>{t('Otra (escribir)…')}</option>
            </select>
          )}
        </Field>
        <Field label={t('Capa (mantener otro botón)')}>
          {(a) => (
            <select {...a} className="input" value={b.modifier ?? ''}
              onChange={(e) => onChange(withKey(b, b.button, e.target.value || null))}>
              <option value="">{t('Ninguna')}</option>
              {LAYER_MODIFIERS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
        </Field>
      </div>
      {custom && (
        <Field label={t('Nombre de la tecla')} error={keyError}>
          {(a) => (
            <input {...a} className="input font-mono text-sm" maxLength={22} spellCheck={false} autoCapitalize="characters"
              value={b.button}
              onChange={(e) => onChange(withKey(b, e.target.value.toUpperCase().replace(/\s/g, ''), b.modifier))} />
          )}
        </Field>
      )}

      <Field label={t('Tipo de acción')}>
        {(a) => (
          <select {...a} className="input" value={b.type} onChange={(e) => onChange(retype(b, e.target.value as BindingType, screen))}>
            {TYPES.map((k) => <option key={k} value={k}>{t(BINDING_TYPE_LABEL[k])}</option>)}
          </select>
        )}
      </Field>

      {b.type !== 'macro' && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={b.type === 'swipe' ? t('Inicio X') : 'X'} value={b.at.x} max={screen.width} onChange={point('at', 'x')} />
          <NumberField label={b.type === 'swipe' ? t('Inicio Y') : 'Y'} value={b.at.y} max={screen.height} onChange={point('at', 'y')} />
        </div>
      )}

      {b.type === 'burst' && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label={t('Toques')} value={b.count} min={2} max={16} onChange={num('count')} />
          <NumberField label={t('Pausa (ms)')} value={b.gapMs} min={40} max={500} onChange={num('gapMs')} />
        </div>
      )}
      {b.type === 'turbo' && (
        <NumberField label={t('Toques por segundo')} value={b.rate} min={1} max={30} onChange={num('rate')} />
      )}
      {b.type === 'swipe' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={t('Final X')} value={b.to.x} max={screen.width} onChange={point('to', 'x')} />
            <NumberField label={t('Final Y')} value={b.to.y} max={screen.height} onChange={point('to', 'y')} />
          </div>
          <NumberField label={t('Duración (ms)')} value={b.durationMs} min={10} max={2000} onChange={num('durationMs')} />
        </>
      )}
      {b.type === 'stick' && (
        <>
          <NumberField label={t('Radio (px)')} value={b.radius} min={1} max={Math.max(screen.width, screen.height)} onChange={num('radius')} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={b.dpad}
              onChange={(e) => onChange(patchBinding(b, { dpad: e.target.checked }))} />
            {t('También con la cruceta')}
          </label>
        </>
      )}
      {b.type === 'look' && (
        <NumberField label={t('Sensibilidad')} value={b.sensitivity} min={0} max={100} step={0.5} onChange={num('sensitivity')} />
      )}
      {b.type === 'macro' && <MacroSteps b={b} screen={screen} onChange={onChange} />}
    </div>
  );
}

function MacroSteps({
  b, screen, onChange,
}: { b: MacroBinding; screen: ProfileConfig['screen']; onChange: (b: Binding) => void }) {
  const t = useT();
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t('Pasos de la macro')} ({b.steps.length}/{MACRO_MAX_STEPS})</h3>
      {b.steps.map((s, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('Paso {n}', { n: i + 1 })}</span>
            <Button variant="ghost" size="sm" disabled={b.steps.length <= 1} onClick={() => onChange(removeStep(b, i))}>
              {t('Quitar')}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={s.at.x} max={screen.width} onChange={(x) => onChange(patchStep(b, i, { at: { ...s.at, x } }))} />
            <NumberField label="Y" value={s.at.y} max={screen.height} onChange={(y) => onChange(patchStep(b, i, { at: { ...s.at, y } }))} />
            <NumberField label={t('Espera (ms)')} value={s.delayMs} max={5000} onChange={(delayMs) => onChange(patchStep(b, i, { delayMs }))} />
            <NumberField label={t('Duración (ms)')} value={s.holdMs} max={5000} onChange={(holdMs) => onChange(patchStep(b, i, { holdMs }))} />
          </div>
        </div>
      ))}
      <Button variant="secondary" size="sm" disabled={b.steps.length >= MACRO_MAX_STEPS}
        onClick={() => onChange(addStep(b, screen, MACRO_MAX_STEPS))}>
        {t('Añadir paso')}
      </Button>
    </div>
  );
}
