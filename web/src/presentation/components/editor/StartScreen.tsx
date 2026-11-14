import { checkPackage } from '@application/profiles/profileInput';
import { CONF_MAX_BYTES, type ProfileConfig } from '@domain/profile/conf/ProfileConfig';
import { blankConfig, SCREEN_PRESETS } from '@domain/profile/conf/editConf';
import { validateConf } from '@domain/profile/conf/validateConf';
import { useState, type FormEvent } from 'react';
import { useT } from '../../i18n/I18nContext';
import { errorMessage } from '../../lib/errorMessage';
import { readSmallTextFile } from '../../lib/files';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

const CUSTOM = 'custom';
const presetValue = (w: number, h: number) => `${w}x${h}`;

function check(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return errorMessage(error);
  }
}

/** Pantalla inicial del editor: perfil en blanco (paquete + pantalla) o abrir un .conf del disco. */
export function StartScreen({ onStart, notice }: { onStart: (config: ProfileConfig) => void; notice?: string | null }) {
  const t = useT();
  const [pkg, setPkg] = useState('');
  const [preset, setPreset] = useState(presetValue(2400, 1080));
  const [w, setW] = useState('2400');
  const [h, setH] = useState('1080');
  const [submitted, setSubmitted] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const screen = preset === CUSTOM
    ? { width: Number(w), height: Number(h) }
    : { width: Number(preset.split('x')[0]), height: Number(preset.split('x')[1]) };
  const pkgError = check(() => checkPackage(pkg));
  const sizeOk = [screen.width, screen.height].every((n) => Number.isInteger(n) && n >= 100 && n <= 99999);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!pkgError && sizeOk) onStart(blankConfig(pkg.trim(), screen));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {notice && <div className="lg:col-span-2"><Alert tone="warning">{notice}</Alert></div>}
      <form onSubmit={submit} className="card space-y-4 p-5" noValidate>
        <h2 className="text-lg font-semibold">{t('Empezar un perfil en blanco')}</h2>
        <Field label={t('Paquete del juego')} error={submitted ? pkgError : null}
          hint={t('Ejemplo: com.empresa.juego. Lo ves en la URL de Google Play del juego.')}>
          {(a) => (
            <input {...a} className="input font-mono text-sm" value={pkg} autoCapitalize="none" spellCheck={false}
              placeholder="com.empresa.juego" onChange={(e) => setPkg(e.target.value)} />
          )}
        </Field>
        <Field label={t('Tamaño de pantalla')} hint={t('Resolución en píxeles con el móvil en horizontal. Los botones se adaptan solos a otras pantallas.')}>
          {(a) => (
            <select {...a} className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {SCREEN_PRESETS.map((s) => <option key={presetValue(s.width, s.height)} value={presetValue(s.width, s.height)}>{s.width}×{s.height}</option>)}
              <option value={CUSTOM}>{t('Otro tamaño…')}</option>
            </select>
          )}
        </Field>
        {preset === CUSTOM && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Ancho (px)')} error={submitted && !sizeOk ? t('Entre 100 y 99999.') : null}>
              {(a) => <input {...a} className="input" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} />}
            </Field>
            <Field label={t('Alto (px)')}>
              {(a) => <input {...a} className="input" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} />}
            </Field>
          </div>
        )}
        <Button type="submit">{t('Crear perfil')}</Button>
      </form>

      <div className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">{t('Abrir un archivo .conf')}</h2>
        <p className="text-sm text-muted">{t('Carga un perfil de tu ordenador (por ejemplo, el que exportaste desde la app) para ajustarlo.')}</p>
        <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium hover:border-primary/60 focus-within:ring-2 focus-within:ring-primary">
          {t('Elegir archivo .conf')}
          <input type="file" accept=".conf,.txt,text/plain" className="sr-only" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setFileError(null);
            readSmallTextFile(file, CONF_MAX_BYTES).then((text) => {
              const result = validateConf(text);
              if (result.ok) onStart(result.config);
              else setFileError(result.error);
            }, (err: unknown) => setFileError(errorMessage(err)));
          }} />
        </label>
        {fileError && <p role="alert" className="text-sm text-danger">{fileError}</p>}
        <p className="text-sm text-muted">{t('También puedes abrir cualquier perfil de la comunidad desde su página con «Abrir en el editor visual».')}</p>
      </div>
    </div>
  );
}
