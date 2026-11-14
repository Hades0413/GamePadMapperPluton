import { NOTIFICATIONS_POLL_MS } from '@domain/notification/Notification';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUseCases } from '../di/ServicesContext';
import { useAccount } from './account';
import { keys } from './keys';

/**
 * Avisos sin leer. Sin tiempo real: se vuelve a preguntar al volver a la pestana y cada poco
 * mientras esta visible (nunca en segundo plano). Solo con sesion iniciada.
 */
export function useUnreadNotifications() {
  const { countUnreadNotifications } = useUseCases();
  const { data: account } = useAccount();
  return useQuery({
    queryKey: keys.unreadNotifications,
    queryFn: () => countUnreadNotifications.execute(),
    enabled: !!account,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: NOTIFICATIONS_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useNotifications() {
  const { listNotifications } = useUseCases();
  const { data: account } = useAccount();
  return useQuery({
    queryKey: keys.notificationList,
    queryFn: () => listNotifications.execute(),
    enabled: !!account,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

function useNotificationMutation<T>(fn: (input: T) => Promise<void>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function useMarkNotificationsRead() {
  const { markNotificationsRead } = useUseCases();
  return useNotificationMutation((ids: readonly string[]) => markNotificationsRead.execute(ids));
}

export function useMarkAllNotificationsRead() {
  const { markAllNotificationsRead } = useUseCases();
  return useNotificationMutation(() => markAllNotificationsRead.execute());
}
