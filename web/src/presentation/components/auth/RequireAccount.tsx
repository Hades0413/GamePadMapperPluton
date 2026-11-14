import type { Account } from '@domain/author/Author';
import type { ReactNode } from 'react';
import { useT } from '../../i18n/I18nContext';
import { useAccount } from '../../queries/account';
import { ErrorAlert } from '../ui/Alert';
import { EmptyState } from '../ui/EmptyState';
import { PageSpinner } from '../ui/Spinner';
import { SignInButton } from './SignInButton';

/** Muestra el contenido solo con sesion iniciada (y opcionalmente solo a administradores). */
export function RequireAccount({
  children, reason, admin = false,
}: { children: (account: Account) => ReactNode; reason: string; admin?: boolean }) {
  const { data: account, isPending, error, refetch } = useAccount();
  const t = useT();
  if (isPending) return <PageSpinner />;
  if (error) return <ErrorAlert error={error} onRetry={() => void refetch()} />;
  if (!account) {
    return (
      <EmptyState title={t('Inicia sesión para continuar')} action={<SignInButton />}>
        {reason} {t('Solo usamos tu nombre de usuario y tu avatar públicos de GitHub.')}
      </EmptyState>
    );
  }
  if (admin && !account.isAdmin) return <EmptyState title={t('Solo para administradores')} />;
  return children(account);
}
