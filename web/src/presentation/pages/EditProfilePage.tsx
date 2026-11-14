import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { ProfileForm } from '../components/profile/ProfileForm';
import { Alert, ErrorAlert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { cameFromApp, readAppLink, setFromApp, type PublishedState } from '../lib/appLink';
import { loadDraft, saveDraft } from '../lib/sessionDraft';
import { useT } from '../i18n/I18nContext';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useProfile, useUpdateProfile } from '../queries/profiles';
import { paths } from '../routes/paths';
import NotFoundPage from './NotFoundPage';

const draftKey = (id: string) => `gpm.editFromApp.${id}`;
const EMPTY = { conf: '', model: '' };

/**
 * Version del perfil que envia la app con «Actualizar en la comunidad»
 * (/perfil/<id>/editar#conf=...). Se guarda en la pestana para no perderla al iniciar sesion.
 */
function appVersion(id: string): { conf: string; model: string } | null {
  const link = readAppLink();
  if (link.conf) saveDraft(draftKey(id), { conf: link.conf, model: link.model ?? '' });
  const saved = loadDraft(draftKey(id), EMPTY);
  return saved.conf ? saved : null;
}

const packageOf = (conf: string) => /^\s*package\s*=\s*(\S+)/m.exec(conf)?.[1] ?? '';

export default function EditProfilePage() {
  const t = useT();
  useDocumentTitle(t('Editar perfil'));
  const { id = '' } = useParams();
  const [fromApp] = useState(() => appVersion(id));
  const { data: profile, isPending, error, refetch } = useProfile(id);
  const update = useUpdateProfile();
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">{t('Editar perfil')}</h1>
      <RequireAccount reason={t('Inicia sesión para editar tus perfiles.')}>
        {(account) => {
          if (isPending) return <PageSpinner />;
          if (error) return <ErrorAlert error={error} onRetry={() => void refetch()} />;
          if (!profile) return <NotFoundPage />;
          if (profile.author?.id !== account.id) return <EmptyState title={t('Solo el autor puede editar este perfil')} />;
          // La version de la app solo se usa si es del mismo juego.
          const appConf = fromApp && packageOf(fromApp.conf) === profile.packageName ? fromApp : null;
          return (
            <div className="space-y-6">
              {appConf && (
                <Alert tone="info">
                  {t('Se han cargado tus cambios (de la app o del editor visual). Revisa la vista previa y guarda para publicarlos.')}
                </Alert>
              )}
              {fromApp && !appConf && (
                <Alert tone="warning">{t('El perfil que envió la app es de otro juego: se muestra la versión publicada.')}</Alert>
              )}
              <ProfileForm mode="edit" pending={update.isPending} error={update.error}
                initial={{ conf: appConf?.conf ?? profile.conf, packageName: profile.packageName, gameName: profile.gameName ?? '',
                  title: profile.title, description: profile.description,
                  deviceModel: appConf?.model || profile.deviceModel || '' }}
                onSubmit={(v) => update.mutate({ id: profile.id, packageName: profile.packageName, title: v.title,
                  description: v.description, conf: v.conf, deviceModel: v.deviceModel }, {
                  onSuccess: () => {
                    const state: PublishedState = { published: 'updated', fromApp: !!appConf && cameFromApp() };
                    saveDraft(draftKey(profile.id), null);
                    setFromApp(false);
                    void navigate(paths.profile(profile.id), { replace: true, state });
                  },
                })} />
            </div>
          );
        }}
      </RequireAccount>
    </div>
  );
}
