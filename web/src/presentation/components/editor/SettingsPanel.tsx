import type { ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { withSetting } from '@domain/profile/conf/editConf';
import { useT } from '../../i18n/I18nContext';
import { Field } from '../ui/Field';

type Kind = 'text' | 'number' | 'flag';
interface Def {
  readonly key: string;
  readonly kind: Kind;
  readonly hint: string;
  readonly placeholder?: string;
}

/** Ajustes del perfil. El texto de ayuda es la clave de traduccion (espanol). */
const GENERAL: readonly Def[] = [
  { key: 'name', kind: 'text', hint: 'Nombre del perfil (opcional, máximo 60 caracteres).' },
  { key: 'deadzone', kind: 'number', hint: 'Zona muerta de los sticks, de 0 a 0.95.', placeholder: '0.18' },
  { key: 'ls_deadzone', kind: 'number', hint: 'Zona muerta propia del stick izquierdo.', placeholder: '0.15' },
  { key: 'rs_deadzone', kind: 'number', hint: 'Zona muerta propia del stick derecho.', placeholder: '0.15' },
  { key: 'ls_curve', kind: 'number', hint: 'Curva del stick izquierdo (1 lineal, más de 1 suaviza el centro), de 0.1 a 5.', placeholder: '1' },
  { key: 'rs_curve', kind: 'number', hint: 'Curva del stick derecho, de 0.1 a 5.', placeholder: '1' },
  { key: 'look_y', kind: 'number', hint: 'Sensibilidad vertical de la cámara, de 0.1 a 10.', placeholder: '1' },
  { key: 'look_invert', kind: 'flag', hint: 'Invertir el eje vertical de la cámara.' },
  { key: 'aim_button', kind: 'text', hint: 'Botón que, mientras se mantiene, baja la sensibilidad de la cámara (apuntar).', placeholder: 'L2' },
  { key: 'aim_scale', kind: 'number', hint: 'Sensibilidad al apuntar, de 0.1 a 2.', placeholder: '0.5' },
  { key: 'look_accel', kind: 'number', hint: 'Aceleración de la cámara con el stick al tope, de 0 a 3.', placeholder: '0.5' },
  { key: 'controller', kind: 'text', hint: 'Nombre del mando que activa este perfil al conectarlo (por ejemplo xbox).', placeholder: 'xbox' },
  { key: 'rumble', kind: 'number', hint: 'Vibración del mando al pulsar, de 0 a 1.', placeholder: '0.5' },
  { key: 'ls_axes', kind: 'text', hint: 'Ejes (hex) del stick izquierdo, por ejemplo 0,1.', placeholder: '0,1' },
  { key: 'rs_axes', kind: 'text', hint: 'Ejes (hex) del stick derecho, por ejemplo 2,5.', placeholder: '2,5' },
];

const NO_ROOT: readonly Def[] = [
  { key: 'gyro', kind: 'number', hint: 'Cámara con el giroscopio, de 0 a 5 (0 = no).', placeholder: '1' },
  { key: 'gyro_button', kind: 'text', hint: 'Solo mientras se mantiene este botón (vacío = siempre).', placeholder: 'L2' },
  { key: 'gyro_invert', kind: 'flag', hint: 'Invertir el eje vertical del giroscopio.' },
  { key: 'mouse', kind: 'number', hint: 'El ratón mueve la cámara, de 0 a 5 (0 = no).', placeholder: '1' },
];

function SettingField({
  def, config, onChange,
}: { def: Def; config: ProfileConfig; onChange: (c: ProfileConfig) => void }) {
  const t = useT();
  const value = config.settings[def.key] ?? '';
  if (def.kind === 'flag') {
    return (
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={value === '1'}
          onChange={(e) => onChange(withSetting(config, def.key, e.target.checked ? '1' : null))} />
        <span><span className="font-mono">{def.key}</span> <span className="text-muted">· {t(def.hint)}</span></span>
      </label>
    );
  }
  return (
    <Field label={def.key} hint={t(def.hint)}>
      {(a) => (
        <input {...a} className="input font-mono text-sm" value={value} placeholder={def.placeholder} spellCheck={false}
          inputMode={def.kind === 'number' ? 'decimal' : undefined}
          onChange={(e) => onChange(withSetting(config, def.key, e.target.value))} />
      )}
    </Field>
  );
}

/** Ajustes de todo el perfil. Los de giroscopio, ratón, teclado y dos jugadores van aparte (solo sin root). */
export function SettingsPanel({ config, onChange }: { config: ProfileConfig; onChange: (c: ProfileConfig) => void }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <h2 className="font-semibold">{t('Ajustes del perfil')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GENERAL.map((d) => <SettingField key={d.key} def={d} config={config} onChange={onChange} />)}
      </div>
      <details className="rounded-xl border border-line p-4" open={NO_ROOT.some((d) => d.key in config.settings) || 'players' in config.settings}>
        <summary className="cursor-pointer text-sm font-medium">{t('Opciones solo sin root')}</summary>
        <p className="mt-2 text-xs text-muted">
          {t('Solo sin root: giroscopio, ratón, teclado físico (teclas KB_* y MOUSE_*) y segundo jugador (P2_*) funcionan únicamente en el modo sin root de la app.')}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NO_ROOT.map((d) => <SettingField key={d.key} def={d} config={config} onChange={onChange} />)}
          <Field label="players" hint={t('Con 2, el segundo mando es el jugador 2 (botones P2_*).')}>
            {(a) => (
              <select {...a} className="input" value={config.settings['players'] ?? ''}
                onChange={(e) => onChange(withSetting(config, 'players', e.target.value || null))}>
                <option value="">{t('1 jugador (por defecto)')}</option>
                <option value="2">{t('2 jugadores')}</option>
              </select>
            )}
          </Field>
        </div>
      </details>
    </div>
  );
}
