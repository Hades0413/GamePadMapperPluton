import { z } from 'zod';

/**
 * Forma de las filas que devuelve Supabase. Se validan en tiempo de ejecucion: si la base
 * de datos cambia o devuelve algo inesperado, falla aqui y no en la interfaz.
 */
export const authorRow = z.object({
  id: z.uuid(),
  username: z.string(),
  avatar_url: z.string().nullable(),
});

export const gameRow = z.object({
  package: z.string(),
  name: z.string(),
  icon_url: z.string().nullable(),
  background_url: z.string().nullable(),
  profile_count: z.number().int(),
  last_profile_at: z.string().nullable(),
});

export const PROFILE_SUMMARY_COLUMNS =
  'id,package,title,description,screen_w,screen_h,binding_count,like_count,status,created_at,updated_at,' +
  // Se nombra la relacion: perfiles y autores tambien se unen por los me gusta y los reportes.
  'author:authors!game_profiles_author_id_fkey(id,username,avatar_url),game:games(name)';
export const PROFILE_COLUMNS = `${PROFILE_SUMMARY_COLUMNS},conf`;
export const GAME_COLUMNS = 'package,name,icon_url,background_url,profile_count,last_profile_at';
export const AUTHOR_COLUMNS = 'id,username,avatar_url';

export const profileSummaryRow = z.object({
  id: z.uuid(),
  package: z.string(),
  title: z.string(),
  description: z.string(),
  screen_w: z.number().int(),
  screen_h: z.number().int(),
  binding_count: z.number().int(),
  like_count: z.number().int(),
  status: z.enum(['published', 'hidden']),
  created_at: z.string(),
  updated_at: z.string(),
  author: authorRow.nullable(),
  game: z.object({ name: z.string() }).nullable(),
});

export const profileRow = profileSummaryRow.extend({ conf: z.string() });

export const accountRow = authorRow.extend({ is_admin: z.boolean() });

export const reportedRow = z.object({
  id: z.uuid(),
  package: z.string(),
  title: z.string(),
  author_id: z.uuid(),
  username: z.string(),
  status: z.enum(['published', 'hidden']),
  report_count: z.number().int(),
  reasons: z.array(z.string()),
  created_at: z.string(),
});

export type AuthorRow = z.infer<typeof authorRow>;
export type GameRow = z.infer<typeof gameRow>;
export type ProfileSummaryRow = z.infer<typeof profileSummaryRow>;
export type ProfileRow = z.infer<typeof profileRow>;
