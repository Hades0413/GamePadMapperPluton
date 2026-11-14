import type { AppNotification } from '@domain/notification/Notification';

/** Avisos de la persona con sesion iniciada (cada uno solo ve los suyos). */
export interface NotificationRepository {
  list(limit: number): Promise<readonly AppNotification[]>;
  /** Avisos sin leer (0 sin sesion). */
  unreadCount(): Promise<number>;
  markRead(ids: readonly string[]): Promise<void>;
  markAllRead(): Promise<void>;
}
