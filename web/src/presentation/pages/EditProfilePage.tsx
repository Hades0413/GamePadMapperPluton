import { useNavigate, useParams } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { ProfileForm } from '../components/profile/ProfileForm';
import { ErrorAlert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useProfile, useUpdateProfile } from '../queries/profiles';
import { paths } from '../routes/paths';
import NotFoundPage from './NotFoundPage';

export default function EditProfilePage() {
  useDocumentTitle('Editar perfil');
  const { id = '' } = useParams();
  const { data: profile, isPending, error, refetch } = useProfile(id);
  const update = useUpdateProfile();
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Editar perfil</h1>
      <RequireAccount reason="Inicia sesión para editar tus perfiles.">
        {(account) => {
          if (isPending) return <PageSpinner />;
          if (error) return <ErrorAlert error={error} onRetry={() => void refetch()} />;
          if (!profile) return <NotFoundPage />;
          if (profile.author?.id !== account.id) return <EmptyState title="Solo el autor puede editar este perfil" />;
          return (
            <ProfileForm mode="edit" pending={update.isPending} error={update.error}
              initial={{ conf: profile.conf, packageName: profile.packageName, gameName: profile.gameName ?? '',
                title: profile.title, description: profile.description }}
              onSubmit={(v) => update.mutate({ id: profile.id, packageName: profile.packageName, title: v.title,
                description: v.description, conf: v.conf },
                { onSuccess: () => void navigate(paths.profile(profile.id), { replace: true }) })} />
          );
        }}
      </RequireAccount>
    </div>
  );
}
