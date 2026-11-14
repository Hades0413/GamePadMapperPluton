/** Bloqueos temporales (dias); null = para siempre. Mismos valores que admin_ban_author. */
export const BAN_DAYS = [1, 7, 30] as const;
export type BanDays = (typeof BAN_DAYS)[number];
export const isBanDays = (value: unknown): value is BanDays => (BAN_DAYS as readonly unknown[]).includes(value);

/** Motivo que escribe un admin (opcional, una linea). */
export const MODERATION_REASON_MAX = 300;

/** Que hace un admin con un comentario reportado. */
export const COMMENT_ACTIONS = ['restore', 'hide', 'delete'] as const;
export type CommentAction = (typeof COMMENT_ACTIONS)[number];
export const isCommentAction = (value: string): value is CommentAction =>
  (COMMENT_ACTIONS as readonly string[]).includes(value);

/** Acciones que guarda el historial de moderacion (private.moderation_log). */
export const MODERATION_ACTIONS = [
  'profile_publish', 'profile_hide', 'profile_delete', 'profile_feature', 'profile_unfeature',
  'author_ban', 'author_unban', 'game_update', 'game_images',
  'comment_hide', 'comment_restore', 'comment_delete',
  'mapping_approve', 'mapping_reject', 'mapping_delete', 'diagnostic_delete',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];
export const isModerationAction = (value: string): value is ModerationAction =>
  (MODERATION_ACTIONS as readonly string[]).includes(value);

export type ModerationTarget = 'profile' | 'author' | 'game' | 'comment' | 'mapping' | 'diagnostic';

/** Una entrada del historial: quien, que, sobre que, motivo y cuando. */
export interface ModerationLogEntry {
  readonly id: number;
  readonly adminName: string;
  readonly action: ModerationAction;
  readonly targetType: ModerationTarget;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly reason: string;
  readonly createdAt: Date;
}

/** Comentario reportado u oculto (solo para admins). */
export interface ReportedComment {
  readonly id: string;
  readonly profileId: string;
  readonly profileTitle: string;
  readonly authorId: string;
  readonly username: string;
  readonly body: string;
  readonly hidden: boolean;
  readonly reportCount: number;
  readonly reasons: readonly string[];
  readonly createdAt: Date;
}

/** Cuenta bloqueada ahora mismo. bannedUntil null = para siempre. */
export interface BannedAuthor {
  readonly id: string;
  readonly username: string;
  readonly permanent: boolean;
  readonly bannedUntil: Date | null;
}
