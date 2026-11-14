import { CONF_MAX_BYTES } from '@domain/profile/conf/ProfileConfig';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { Alert } from '../components/ui/Alert';
import { ProfileForm, type ProfileFormValues } from '../components/profile/ProfileForm';
import { guessDeviceModel } from '../lib/device';
import { decodeBase64Url } from '../lib/files';
import { PageSpinner } from '../components/ui/Spinner';
import { loadDraft, saveDraft } from '../lib/sessionDraft';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useFillGameImages } from '../queries/games';
import { usePublishProfile } from '../queries/profiles';
import { paths } from '../routes/paths';

const DRAFT_KEY = 'gpm.uploadDraft';
const EMPTY: ProfileFormValues = { conf: '', packageName: '', gameName: '', title: '', description: '', deviceModel: '' };

/**
 * Valores iniciales: borrador guardado + perfil que llega desde la app en el enlace
 * (/subir#conf=<base64url>). Va en el "#" para que nunca se envie a ningun servidor.
 */
function initialValues(packageParam: string | null): { values: ProfileFormValues; fromLink: boolean } {
  const values = loadDraft(DRAFT_KEY, EMPTY);
  const match = /(?:^#|&)conf=([^&]+)/.exec(window.location.hash);
  const fromApp = match?.[1] ? decodeBase64Url(match[1], CONF_MAX_BYTES) : null;
  // La app tambien envia el modelo del telefono: #conf=...&modelo=Redmi%20Note%209
  const model = /(?:^#|&)modelo=([^&]{1,180})/.exec(window.location.hash)?.[1];
  if (match) history.replaceState(null, '', window.location.pathname + window.location.search);
  if (model) {
    try {
      values.deviceModel = decodeURIComponent(model).slice(0, 60);
    } catch {
      // modelo mal codificado: se ignora
    }
  }
  if (fromApp) {
    values.conf = fromApp;
    values.packageName = /^\s*package\s*=\s*(\S+)/m.exec(fromApp)?.[1] ?? values.packageName;
    saveDraft(DRAFT_KEY, values);
  }
  if (!values.packageName && packageParam) values.packageName = packageParam;
  return { values, fromLink: !!fromApp };
}

export default function UploadPage() {
  useDocumentTitle('Subir perfil');
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
        <h1 className="text-3xl font-bold">Subir un perfil</h1>
        <p className="mt-1 text-muted">Comparte la configuración de tu juego para que otros la usen.</p>
      </div>
      {fromLink && (
        <Alert tone="warning">
          Este formulario se rellenó con un perfil que venía en el enlace. Publícalo solo si lo has creado tú
          (por ejemplo, desde «Subir a la comunidad» de la app) y revisa la vista previa.
        </Alert>
      )}
      <RequireAccount reason="Para subir un perfil y que aparezca tu nombre, inicia sesión con GitHub.">
        {() => (
          model === null ? <PageSpinner /> : <ProfileForm mode="create" initial={{ ...initial, deviceModel: initial.deviceModel || model }} pending={publish.isPending} error={publish.error}
            onChange={(v) => saveDraft(DRAFT_KEY, v)}
            onSubmit={(v) => publish.mutate(v, {
              onSuccess: (id) => {
                saveDraft(DRAFT_KEY, null);
                // Icono y captura del juego desde Google Play si aun no los tiene (en segundo plano).
                fill.mutate(v.packageName.trim());
                void navigate(paths.profile(id), { replace: true });
              },
            })} />
        )}
      </RequireAccount>
    </div>
  );
}
