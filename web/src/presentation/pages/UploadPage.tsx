import { CONF_MAX_BYTES } from '@domain/profile/conf/ProfileConfig';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { Alert } from '../components/ui/Alert';
import { ProfileForm, type ProfileFormValues } from '../components/profile/ProfileForm';
import { decodeBase64Url } from '../lib/files';
import { loadDraft, saveDraft } from '../lib/sessionDraft';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { usePublishProfile } from '../queries/profiles';
import { paths } from '../routes/paths';

const DRAFT_KEY = 'gpm.uploadDraft';
const EMPTY: ProfileFormValues = { conf: '', packageName: '', gameName: '', title: '', description: '' };

/**
 * Valores iniciales: borrador guardado + perfil que llega desde la app en el enlace
 * (/subir#conf=<base64url>). Va en el "#" para que nunca se envie a ningun servidor.
 */
function initialValues(packageParam: string | null): { values: ProfileFormValues; fromLink: boolean } {
  const values = loadDraft(DRAFT_KEY, EMPTY);
  const match = /(?:^#|&)conf=([^&]+)/.exec(window.location.hash);
  const fromApp = match?.[1] ? decodeBase64Url(match[1], CONF_MAX_BYTES) : null;
  if (match) history.replaceState(null, '', window.location.pathname + window.location.search);
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
  const publish = usePublishProfile();
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
          <ProfileForm mode="create" initial={initial} pending={publish.isPending} error={publish.error}
            onChange={(v) => saveDraft(DRAFT_KEY, v)}
            onSubmit={(v) => publish.mutate(v, {
              onSuccess: (id) => {
                saveDraft(DRAFT_KEY, null);
                void navigate(paths.profile(id), { replace: true });
              },
            })} />
        )}
      </RequireAccount>
    </div>
  );
}
