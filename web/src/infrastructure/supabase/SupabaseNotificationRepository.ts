import type { NotificationRepository } from '@application/ports/NotificationRepository';
import { isNotificationKind, type AppNotification } from '@domain/notification/Notification';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parse, unwrap } from './errors';

/** Datos del aviso: solo las claves conocidas y con su forma (lo demas se ignora). */
const text = (max: number) => z.string().max(max).nullish().catch(null);
const notificationRow = z.object({
  id: z.uuid(),
  kind: z.string(),
  data: z.object({
    profile_id: z.uuid().nullish().catch(null),
    title: text(80),
    actor: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/).nullish().catch(null),
    name: text(80),
    platform: z.enum(['Windows', 'Linux']).nullish().catch(null),
  }),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export class SupabaseNotificationRepository implements NotificationRepository {
  readonly #db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async #signedIn(): Promise<boolean> {
    const { data } = await this.#db.auth.getSession();
    return !!data.session;
  }

  async list(limit: number): Promise<readonly AppNotification[]> {
    if (!(await this.#signedIn())) return [];
    const result = await this.#db.from('notifications').select('id,kind,data,read_at,created_at')
      .order('created_at', { ascending: false }).limit(limit);
    return parse(z.array(notificationRow), unwrap(result)).flatMap((r) => (isNotificationKind(r.kind) ? [{
      id: r.id,
      kind: r.kind,
      profileId: r.data.profile_id ?? null,
      title: r.data.title ?? null,
      actor: r.data.actor ?? null,
      name: r.data.name ?? null,
      platform: r.data.platform ?? null,
      readAt: r.read_at ? new Date(r.read_at) : null,
      createdAt: new Date(r.created_at),
    }] : []));
  }

  async unreadCount(): Promise<number> {
    if (!(await this.#signedIn())) return 0;
    return parse(z.number().int().min(0), unwrap(await this.#db.rpc('unread_notification_count')));
  }

  async markRead(ids: readonly string[]): Promise<void> {
    unwrap(await this.#db.rpc('mark_notifications_read', { p_ids: [...ids] }));
  }

  async markAllRead(): Promise<void> {
    unwrap(await this.#db.rpc('mark_all_notifications_read'));
  }
}
