import type { ProfileSort } from '@domain/profile/GameProfile';

/** Claves de cache centralizadas: invalidar siempre por estas, nunca a mano. */
export const keys = {
  account: ['account'] as const,
  games: (search: string) => ['games', search] as const,
  game: (packageName: string) => ['game', packageName] as const,
  gameProfiles: (packageName: string, sort: ProfileSort) => ['profiles', 'game', packageName, sort] as const,
  authorProfiles: (authorId: string) => ['profiles', 'author', authorId] as const,
  profile: (id: string) => ['profile', id] as const,
  liked: (ids: readonly string[]) => ['liked', [...ids].sort().join(',')] as const,
  author: (username: string) => ['author', username.toLowerCase()] as const,
  reported: ['moderation', 'reported'] as const,
  allProfiles: ['profiles'] as const,
  allLiked: ['liked'] as const,
  searchProfiles: (sort: ProfileSort) => ['profiles', 'search', sort] as const,
  notifications: ['notifications'] as const,
  unreadNotifications: ['notifications', 'unread'] as const,
  notificationList: ['notifications', 'list'] as const,
  reportedComments: ['moderation', 'comments'] as const,
  moderationLog: ['moderation', 'log'] as const,
  bannedAuthors: ['moderation', 'banned'] as const,
};
