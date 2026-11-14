import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { Alert } from '../components/ui/Alert';
import { ProfileForm, type ProfileFormValues } from '../components/profile/ProfileForm';
import { guessDeviceModel } from '../lib/device';
import { cameFromApp, readAppLink, setFromApp, type PublishedState } from '../lib/appLink';
import { PageSpinner } from '../components/ui/Spinner';
import { loadDraft, saveDraft } from '../lib/sessionDraft';
import { useT } from '../i18n/I18nContext';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useFillGameImages } from '../queries/games';
import { usePublishProfile } from '../queries/profiles';
import { paths } from '../routes/paths';

const DRAFT_KEY = 'gpm.uploadDraft';
const EMPTY: ProfileFormValues = { conf: '', packageName: '', gameName: '', title: '', description: '', deviceModel: '' };

/** Valores iniciales: borrador guardado + perfil que llega desde la app en el enlace. */
function initialValues(packageParam: string | null): { values: ProfileFormValues; fromLink: boolean } {
  const values = loadDraft(DRAFT_KEY, EMPTY);
  const link = readAppLink();
  if (link.model) values.deviceModel = link.model;
  if (link.conf) {
    values.conf = link.conf;
    values.packageName = /^\s*package\s*=\s*(\S+)/m.exec(link.conf)?.[1] ?? values.packageName;
    saveDraft(DRAFT_KEY, values);
  }
  if (!values.packageName && packageParam) values.packageName = packageParam;
  return { values, fromLink: !!link.conf };
}

export default function UploadPage() {
  const t = useT();
  useDocumentTitle(t('Subir perfil'));
  const [params] = useSearchParams();
  const [{ values: initial, fromLink }] = useState(() => initialValues(params.get('juego')));
  // Sin modelo: lo pregunta al navegador (Chrome en Android lo sabe) y rellena el formulario.
  const [model, setModel] = useState<string | null>(initial.deviceModel ? initial.deviceModel : null);
  useEffect(() => {
    if (model !== null) return;
    let alive = true;
    void guessDeviceModel().then((m) => alive && setModel(m));
    return () => { alive = false; };
  }, [model]);
  const publish = usePublishProfile();
  const fill = useFillGameImages();
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{t('Subir un perfil')}</h1>
        <p className="mt-1 text-muted">{t('Comparte la configuración de tu juego para que otros la usen.')}</p>
      </div>
      {fromLink && (
        <Alert tone="warning">
          {t('Este formulario se rellenó con un perfil que venía en el enlace. Publícalo solo si lo has creado tú (por ejemplo, desde «Subir a la comunidad» de la app) y revisa la vista previa.')}
        </Alert>
      )}
      <RequireAccount reason={t('Para subir un perfil y que aparezca tu nombre, inicia sesión con GitHub.')}>
        {() => (
          model === null ? <PageSpinner /> : <ProfileForm mode="create" initial={{ ...initial, deviceModel: initial.deviceModel || model }} pending={publish.isPending} error={publish.error}
            onChange={(v) => saveDraft(DRAFT_KEY, v)}
            onSubmit={(v) => publish.mutate(v, {
              onSuccess: (id) => {
                saveDraft(DRAFT_KEY, null);
                // Icono y captura del juego desde Google Play si aun no los tiene (en segundo plano).
                fill.mutate(v.packageName.trim());
                const state: PublishedState = { published: 'created', fromApp: cameFromApp() };
                setFromApp(false);
                void navigate(paths.profile(id), { replace: true, state });
              },
            })} />
        )}
      </RequireAccount>
    </div>
  );
}
