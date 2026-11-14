import { NOTIFICATIONS_PAGE, type AppNotification } from '@domain/notification/Notification';
import type { NotificationRepository } from '../ports/NotificationRepository';
import { requireId } from '../shared/guards';

abstract class UseCase {
  protected readonly repo: NotificationRepository;

  constructor(repo: NotificationRepository) {
    this.repo = repo;
  }
}

export class ListNotifications extends UseCase {
  execute(limit = NOTIFICATIONS_PAGE): Promise<readonly AppNotification[]> {
    return this.repo.list(Math.max(1, Math.min(NOTIFICATIONS_PAGE, Math.trunc(limit))));
  }
}

export class CountUnreadNotifications extends UseCase {
  execute(): Promise<number> {
    return this.repo.unreadCount();
  }
}

export class MarkNotificationsRead extends UseCase {
  /** Como mucho 100 de una vez (igual que la base de datos); los ids mal formados se rechazan. */
  async execute(ids: readonly string[]): Promise<void> {
    const clean = [...new Set(ids.map(requireId))].slice(0, 100);
    if (clean.length > 0) await this.repo.markRead(clean);
  }
}

export class MarkAllNotificationsRead extends UseCase {
  execute(): Promise<void> {
    return this.repo.markAllRead();
  }
}
