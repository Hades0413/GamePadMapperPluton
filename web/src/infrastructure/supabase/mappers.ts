import type { Author } from '@domain/author/Author';
import type { Game } from '@domain/game/Game';
import type { GameProfile, GameProfileSummary } from '@domain/profile/GameProfile';
import type { AuthorRow, GameRow, ProfileRow, ProfileSummaryRow } from './rows';

/** Solo avatares de GitHub (la base de datos ya lo exige; se vuelve a comprobar aqui). */
const safeAvatar = (url: string | null) =>
  url && url.startsWith('https://avatars.githubusercontent.com/') ? url : null;

/** Solo imagenes del Storage del proyecto (la base de datos ya lo exige; se comprueba otra vez). */
const GAME_IMAGE = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/juegos\/(iconos|fondos)\/[A-Za-z0-9._-]{1,160}(\?v=[0-9]{1,15})?$/;
const safeImage = (url: string | null) => (url && GAME_IMAGE.test(url) ? url : null);

export const toAuthor = (row: AuthorRow): Author => ({
  id: row.id,
  username: row.username,
  avatarUrl: safeAvatar(row.avatar_url),
});

export const toGame = (row: GameRow): Game => ({
  packageName: row.package,
  name: row.name,
  iconUrl: safeImage(row.icon_url),
  backgroundUrl: safeImage(row.background_url),
  profileCount: row.profile_count,
  lastProfileAt: row.last_profile_at ? new Date(row.last_profile_at) : null,
});

export const toProfileSummary = (row: ProfileSummaryRow): GameProfileSummary => ({
  id: row.id,
  packageName: row.package,
  gameName: row.game?.name ?? null,
  title: row.title,
  description: row.description,
  author: row.author ? toAuthor(row.author) : null,
  screen: { width: row.screen_w, height: row.screen_h },
  bindingCount: row.binding_count,
  likeCount: row.like_count,
  status: row.status,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

export const toProfile = (row: ProfileRow): GameProfile => ({ ...toProfileSummary(row), conf: row.conf });
