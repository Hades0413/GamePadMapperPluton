/** Tipos de aviso (mismos que la tabla notifications de la base de datos). */
export const NOTIFICATION_KINDS = ['comment', 'mapping_approved', 'mapping_rejected', 'profile_hidden'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const isNotificationKind = (value: string): value is NotificationKind =>
  (NOTIFICATION_KINDS as readonly string[]).includes(value);

/** Cuantos avisos se muestran de una vez (la base de datos guarda como mucho 200 por usuario). */
export const NOTIFICATIONS_PAGE = 50;

/** Cada cuanto se pregunta por avisos nuevos con la pestana visible (sin tiempo real). */
export const NOTIFICATIONS_POLL_MS = 90_000;

/**
 * Aviso para la persona con sesion iniciada. Solo datos de una lista cerrada (nunca el texto de
 * un comentario): se muestran siempre como texto, nunca como HTML.
 */
export interface AppNotification {
  readonly id: string;
  readonly kind: NotificationKind;
  /** Perfil al que se refiere (comentario nuevo, perfil oculto). */
  readonly profileId: string | null;
  /** Titulo del perfil en el momento del aviso. */
  readonly title: string | null;
  /** Usuario de GitHub que lo provoco (quien comento). */
  readonly actor: string | null;
  /** Nombre del mando (avisos de mandos). */
  readonly name: string | null;
  readonly platform: string | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}
