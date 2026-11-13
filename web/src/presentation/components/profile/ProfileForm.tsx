import { checkDescription, checkGameName, checkPackage, checkTitle } from '@application/profiles/profileInput';
import { CONF_MAX_BYTES } from '@domain/profile/conf/ProfileConfig';
import { validateConf } from '@domain/profile/conf/validateConf';
import { DESCRIPTION_MAX, TITLE_MAX } from '@domain/profile/GameProfile';
import { isValidPackage } from '@domain/game/Game';
import { useDeferredValue, useMemo, useState, type FormEvent } from 'react';
import { readSmallTextFile } from '../../lib/files';
import { useGame } from '../../queries/games';
import { errorMessage } from '../../lib/errorMessage';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { ProfilePreview } from './ProfilePreview';

export interface ProfileFormValues {
  conf: string;
  packageName: string;
  gameName: string;
  title: string;
  description: string;
}

/** Devuelve el mensaje de error de una validacion, o null si es correcta. */
function problem(check: () => unknown): string | null {
  try {
    check();
    return null;
  } catch (error) {
    return errorMessage(error);
  }
}

export function ProfileForm({
  initial, mode, pending, error, onChange, onSubmit,
}: {
  initial: ProfileFormValues;
  mode: 'create' | 'edit';
  pending: boolean;
  error: unknown;
  onChange?: (values: ProfileFormValues) => void;
  onSubmit: (values: ProfileFormValues) => void;
}) {
  const [values, setValues] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const deferredConf = useDeferredValue(values.conf);
  const parsed = useMemo(() => (deferredConf.trim() ? validateConf(deferredConf) : null), [deferredConf]);
  const packageOk = isValidPackage(values.packageName.trim());
  const game = useGame(packageOk ? values.packageName.trim() : undefined);
  const existingGame = game.data ?? null;

  const set = (patch: Partial<ProfileFormValues>) => {
    const next = { ...values, ...patch };
    // El paquete sale del propio perfil: se rellena solo al pegarlo o cargarlo.
    if (patch.conf !== undefined && mode === 'create') {
      const result = validateConf(patch.conf);
      const pkg = result.ok ? result.config.packageName : /^\s*package\s*=\s*(\S+)/m.exec(patch.conf)?.[1];
      if (pkg && pkg !== values.packageName) next.packageName = pkg;
      if (result.ok && result.config.name && !values.title) next.title = result.config.name.slice(0, TITLE_MAX);
    }
    setValues(next);
    onChange?.(next);
  };

  const errors = {
    conf: values.conf.trim() === '' ? 'Pega el perfil o carga el archivo .conf.' :
      parsed && !parsed.ok ? parsed.error :
      problem(() => {
        const r = validateConf(values.conf, values.packageName.trim());
        if (!r.ok) throw new Error(r.error);
      }),
    packageName: problem(() => checkPackage(values.packageName)),
    gameName: existingGame ? null : problem(() => checkGameName(values.gameName)),
    title: problem(() => checkTitle(values.title)),
    description: problem(() => checkDescription(values.description)),
  };
  const valid = Object.values(errors).every((e) => e === null);
  const show = (field: keyof typeof errors) => (submitted || (field === 'conf' && values.conf.trim() !== '') ? errors[field] : null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (valid) onSubmit({ ...values, gameName: existingGame?.name ?? values.gameName });
  };

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-2" noValidate>
      <div className="space-y-5">
        <Field label="Perfil (.conf)" error={show('conf')}
          hint="En la app: Biblioteca › tu perfil › Compartir, y pégalo aquí. O carga el archivo.">
          {(a) => (
            <textarea {...a} className="input min-h-56 font-mono text-xs leading-relaxed" spellCheck={false}
              placeholder={'package = com.empresa.juego\nscreen = 2400x1080\nA = tap 1932 960\n…'}
              value={values.conf} onChange={(e) => set({ conf: e.target.value })} />
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-xl border border-dashed border-line px-4 py-2 text-sm text-muted hover:border-primary hover:text-ink">
            Cargar archivo .conf
            <input type="file" accept=".conf,.txt,text/plain" className="sr-only" onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setFileError(null);
              readSmallTextFile(file, CONF_MAX_BYTES).then((text) => set({ conf: text }), (err: unknown) => setFileError(errorMessage(err)));
            }} />
          </label>
          {fileError && <span className="text-xs text-danger">{fileError}</span>}
        </div>

        <Field label="Paquete del juego" error={show('packageName')}
          hint={mode === 'edit' ? 'No se puede cambiar.' : 'Se rellena solo con la línea «package» del perfil.'}>
          {(a) => (
            <input {...a} className="input font-mono text-sm" value={values.packageName} disabled={mode === 'edit'}
              placeholder="com.empresa.juego" maxLength={150} autoComplete="off" spellCheck={false}
              onChange={(e) => set({ packageName: e.target.value })} />
          )}
        </Field>

        {mode === 'create' && (
          existingGame ? (
            <p className="text-sm text-muted">Juego: <strong className="text-ink">{existingGame.name}</strong></p>
          ) : (
            <Field label="Nombre del juego" error={show('gameName')}
              hint={packageOk ? 'Es el primer perfil de este juego: escribe su nombre tal como aparece en Google Play.' : undefined}>
              {(a) => (
                <input {...a} className="input" value={values.gameName} maxLength={60} placeholder="Brawl Stars"
                  onChange={(e) => set({ gameName: e.target.value })} />
              )}
            </Field>
          )
        )}

        <Field label="Título" error={show('title')} counter={{ value: values.title.trim().length, max: TITLE_MAX }}>
          {(a) => (
            <input {...a} className="input" value={values.title} maxLength={TITLE_MAX + 10}
              placeholder="Ej.: Competitivo con cruceta" onChange={(e) => set({ title: e.target.value })} />
          )}
        </Field>

        <Field label="Descripción (opcional)" error={show('description')}
          counter={{ value: values.description.trim().length, max: DESCRIPTION_MAX }}
          hint="Qué mando usas, qué hace cada botón, para qué modo de juego…">
          {(a) => (
            <textarea {...a} className="input min-h-28" value={values.description} maxLength={DESCRIPTION_MAX + 50}
              onChange={(e) => set({ description: e.target.value })} />
          )}
        </Field>

        {!!error && <Alert tone="error">{errorMessage(error)}</Alert>}
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          {mode === 'create' ? 'Publicar perfil' : 'Guardar cambios'}
        </Button>
        <p className="text-xs text-muted">
          Al publicar aceptas las normas de la comunidad. El perfil será público con tu usuario de GitHub.
        </p>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start" aria-label="Vista previa">
        <h2 className="font-semibold">Vista previa</h2>
        {parsed?.ok ? (
          <>
            <ProfilePreview config={parsed.config} />
            <p className="text-xs text-muted">
              {parsed.config.bindings.length} botones · pantalla {parsed.config.screen.width}×{parsed.config.screen.height}
            </p>
          </>
        ) : (
          <div className="card flex aspect-video items-center justify-center p-6 text-center text-sm text-muted">
            Aquí verás dónde toca cada botón cuando el perfil sea válido.
          </div>
        )}
      </aside>
    </form>
  );
}
