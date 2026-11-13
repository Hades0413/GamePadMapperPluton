import type { Account } from '@domain/author/Author';
import type { ReactNode } from 'react';
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
  if (isPending) return <PageSpinner />;
  if (error) return <ErrorAlert error={error} onRetry={() => void refetch()} />;
  if (!account) {
    return (
      <EmptyState title="Inicia sesión para continuar" action={<SignInButton />}>
        {reason} Solo usamos tu nombre de usuario y tu avatar públicos de GitHub.
      </EmptyState>
    );
  }
  if (admin && !account.isAdmin) return <EmptyState title="Solo para administradores" />;
  return children(account);
}
