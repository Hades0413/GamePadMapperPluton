import type { AppNotification } from '@domain/notification/Notification';
import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/translate';
import { notificationLink, notificationText } from './notifications';

const base: AppNotification = {
  id: '0f8fad5b-d9cb-469f-a165-70867728950e', kind: 'comment', profileId: '1f8fad5b-d9cb-469f-a165-70867728950e',
  title: 'Mi perfil', actor: 'pepe', name: null, platform: null, readAt: null, createdAt: new Date(0),
};
const es = (s: string, v?: Record<string, string | number>) => translate('es', s, v);
const en = (s: string, v?: Record<string, string | number>) => translate('en', s, v);

describe('avisos', () => {
  it('texto en los dos idiomas', () => {
    expect(notificationText(base, es)).toBe('@pepe comentó en tu perfil «Mi perfil»');
    expect(notificationText(base, en)).toBe('@pepe commented on your profile "Mi perfil"');
    expect(notificationText({ ...base, kind: 'mapping_approved', name: 'Pad', platform: 'Linux' }, en))
      .toBe('Your controller "Pad" (Linux) was approved');
    expect(notificationText({ ...base, kind: 'profile_hidden', title: null }, es)).toBe('La moderación ha ocultado tu perfil «sin título»');
  });

  it('el texto del servidor no se interpreta: queda tal cual', () => {
    expect(notificationText({ ...base, title: '<img src=x onerror=alert(1)>' }, es)).toContain('<img src=x onerror=alert(1)>');
  });

  it('enlaces', () => {
    expect(notificationLink(base)).toBe('/perfil/1f8fad5b-d9cb-469f-a165-70867728950e');
    expect(notificationLink({ ...base, kind: 'mapping_rejected' })).toBe('/mandos');
    expect(notificationLink({ ...base, profileId: null })).toBe('/cuenta');
  });
});
