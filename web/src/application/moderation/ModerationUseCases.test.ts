import type { ModerationRepository } from '@application/ports/ModerationRepository';
import type { NotificationRepository } from '@application/ports/NotificationRepository';
import type { BanDays, CommentAction } from '@domain/moderation/Moderation';
import { describe, expect, it } from 'vitest';
import { MarkNotificationsRead } from '../notifications/NotificationUseCases';
import { BanAuthor, ListModerationLog, ModerateComment } from './ModerationUseCases';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

function fakeModeration() {
  const calls: unknown[][] = [];
  const repo = {
    banAuthor: async (...args: unknown[]) => void calls.push(['ban', ...args]),
    moderateComment: async (...args: unknown[]) => void calls.push(['comment', ...args]),
    moderationLog: async (...args: unknown[]) => {
      calls.push(['log', ...args]);
      return [];
    },
  } as unknown as ModerationRepository;
  return { repo, calls };
}

describe('moderacion', () => {
  it('bloqueo: solo 1, 7, 30 dias o para siempre; motivo de una linea sin < >', async () => {
    const { repo, calls } = fakeModeration();
    const ban = new BanAuthor(repo);
    await ban.execute({ authorId: ID.toUpperCase(), days: 7, reason: '  spam   repetido ' });
    await ban.execute({ authorId: ID, days: null });
    expect(calls).toEqual([['ban', ID, 7, 'spam repetido'], ['ban', ID, null, '']]);
    expect(() => ban.execute({ authorId: ID, days: 3 as BanDays })).toThrow('Duración');
    expect(() => ban.execute({ authorId: ID, days: 1, reason: '<b>' })).toThrow('< ni >');
    expect(() => ban.execute({ authorId: 'x', days: 1 })).toThrow();
  });

  it('comentarios: solo acciones conocidas', async () => {
    const { repo, calls } = fakeModeration();
    const moderate = new ModerateComment(repo);
    await moderate.execute({ commentId: ID, action: 'hide' });
    expect(calls).toEqual([['comment', ID, 'hide', '']]);
    expect(() => moderate.execute({ commentId: ID, action: 'explode' as CommentAction })).toThrow('Acción');
  });

  it('historial: limite acotado y cursor valido', async () => {
    const { repo, calls } = fakeModeration();
    const log = new ListModerationLog(repo);
    await log.execute({ before: 10, limit: 5000 });
    await log.execute({ before: -1 });
    await log.execute({ before: 1.5 });
    expect(calls).toEqual([['log', 200, 10], ['log', 50, null], ['log', 50, null]]);
  });
});

describe('avisos', () => {
  it('marcar como leidos: sin repetidos, como mucho 100 y sin ids mal formados', async () => {
    const seen: string[][] = [];
    const repo = { markRead: async (ids: readonly string[]) => void seen.push([...ids]) } as unknown as NotificationRepository;
    const uc = new MarkNotificationsRead(repo);
    await uc.execute([]);
    await uc.execute([ID, ID.toUpperCase()]);
    const many = Array.from({ length: 150 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
    await uc.execute(many);
    expect(seen[0]).toEqual([ID]);
    expect(seen[1]).toHaveLength(100);
    await expect(uc.execute(['nope'])).rejects.toThrow();
  });
});
