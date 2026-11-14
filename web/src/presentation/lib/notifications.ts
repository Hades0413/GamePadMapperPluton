import type { AppNotification } from '@domain/notification/Notification';
import type { TFunction } from '../i18n/translate';
import { paths } from '../routes/paths';

/** Texto del aviso (siempre texto plano: los datos del servidor nunca se interpretan como HTML). */
export function notificationText(n: AppNotification, t: TFunction): string {
  const title = n.title ?? t('sin título');
  const name = n.name ?? t('Mando');
  const platform = n.platform ?? '';
  switch (n.kind) {
    case 'comment':
      return t('{actor} comentó en tu perfil «{title}»', { actor: n.actor ? `@${n.actor}` : t('Alguien'), title });
    case 'mapping_approved':
      return t('Se aprobó tu mando «{name}» ({platform})', { name, platform });
    case 'mapping_rejected':
      return t('No se aprobó tu mando «{name}» ({platform})', { name, platform });
    case 'profile_hidden':
      return t('La moderación ha ocultado tu perfil «{title}»', { title });
  }
}

/** Pagina a la que lleva el aviso. */
export function notificationLink(n: AppNotification): string {
  if (n.kind === 'mapping_approved' || n.kind === 'mapping_rejected') return paths.controllers;
  return n.profileId ? paths.profile(n.profileId) : paths.account;
}
