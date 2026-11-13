import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useUseCases } from '../di/ServicesContext';
import { keys } from './keys';

export function useAccount() {
  const { getCurrentAccount } = useUseCases();
  return useQuery({ queryKey: keys.account, queryFn: () => getCurrentAccount.execute(), staleTime: 5 * 60_000 });
}

/** Refresca la cuenta (y lo que depende de ella) al iniciar o cerrar sesion. */
export function useSessionSync() {
  const { observeSession } = useUseCases();
  const client = useQueryClient();
  useEffect(
    () =>
      observeSession.execute(() => {
        void client.invalidateQueries({ queryKey: keys.account });
        void client.invalidateQueries({ queryKey: keys.allLiked });
        void client.invalidateQueries({ queryKey: keys.allProfiles });
      }),
    [observeSession, client],
  );
}

export function useSignIn() {
  const { signInWithGitHub } = useUseCases();
  return useMutation({ mutationFn: (returnTo: string) => signInWithGitHub.execute(returnTo) });
}

export function useSignOut() {
  const { signOut } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => signOut.execute(),
    onSuccess: () => client.setQueryData(keys.account, null),
  });
}

export function useDeleteAccount() {
  const { deleteAccount } = useUseCases();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAccount.execute(),
    onSuccess: () => {
      client.setQueryData(keys.account, null);
      void client.invalidateQueries();
    },
  });
}
