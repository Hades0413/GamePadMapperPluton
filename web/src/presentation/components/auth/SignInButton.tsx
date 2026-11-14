import { useLocation } from 'react-router';
import { useT } from '../../i18n/I18nContext';
import { useSignIn } from '../../queries/account';
import { errorMessage } from '../../lib/errorMessage';
import { Button } from '../ui/Button';
import { GitHubIcon } from '../ui/icons';

export function SignInButton({
  label, size = 'md',
}: { label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const t = useT();
  const location = useLocation();
  const signIn = useSignIn();
  return (
    <div className="flex flex-col items-center gap-2">
      <Button size={size} variant="secondary" icon={<GitHubIcon />} loading={signIn.isPending}
        onClick={() => signIn.mutate(location.pathname + location.search)}>
        {label ?? t('Iniciar sesión con GitHub')}
      </Button>
      {signIn.error && <p className="text-xs text-danger">{errorMessage(signIn.error)}</p>}
    </div>
  );
}
