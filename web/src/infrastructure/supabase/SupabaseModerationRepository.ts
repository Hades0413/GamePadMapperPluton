import type {
  GameChanges, ImportedGame, ModerationRepository, ReportedProfile,
} from '@application/ports/ModerationRepository';
import type { GameImageFile, GameImageKind } from '@domain/game/GameImage';
import { AppError } from '@domain/shared/AppError';
import type { ProfileStatus } from '@domain/profile/GameProfile';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parse, toAppError, unwrap } from './errors';
import { reportedRow } from './rows';

export class SupabaseModerationRepository implements ModerationRepository {
  readonly #db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async reportedProfiles(): Promise<readonly ReportedProfile[]> {
    const rows = parse(z.array(reportedRow), unwrap(await this.#db.rpc('admin_reported_profiles')));
    return rows.map((r) => ({
      id: r.id,
      packageName: r.package,
      title: r.title,
      authorId: r.author_id,
      username: r.username,
      status: r.status,
      reportCount: r.report_count,
      reasons: r.reasons,
      createdAt: new Date(r.created_at),
    }));
  }

  async setProfileStatus(id: string, status: ProfileStatus, clearReports: boolean): Promise<void> {
    unwrap(await this.#db.rpc('admin_set_profile_status', { p_id: id, p_status: status, p_clear_reports: clearReports }));
  }

  async setAuthorBanned(authorId: string, banned: boolean): Promise<void> {
    unwrap(await this.#db.rpc('admin_set_banned', { p_user: authorId, p_banned: banned }));
  }

  async updateGame(packageName: string, changes: GameChanges): Promise<void> {
    unwrap(await this.#db.rpc('admin_update_game', {
      p_package: packageName,
      p_name: changes.name,
      p_hidden: changes.hidden,
    }));
  }

  async importGameFromPlay(packageName: string, updateName: boolean): Promise<ImportedGame> {
    const { data, error } = await this.#db.functions.invoke('importar-juego', {
      body: { package: packageName, updateName },
    });
    if (error) {
      // La funcion responde { error: 'mensaje' } con el motivo.
      const context = (error as { context?: Response }).context;
      const detail = context ? await context.json().catch(() => null) as { error?: string } | null : null;
      throw detail?.error ? new AppError('INVALID_INPUT', detail.error) : toAppError(error);
    }
    return parse(z.object({ name: z.string().nullable(), iconUrl: z.string(), nameUpdated: z.boolean() }), data);
  }

  async uploadGameImage(packageName: string, kind: GameImageKind, file: GameImageFile): Promise<string> {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${kind === 'icon' ? 'iconos' : 'fondos'}/${packageName}.${ext}`;
    const bucket = this.#db.storage.from('juegos');
    const { error } = await bucket.upload(path, file.data, { contentType: file.type, upsert: true, cacheControl: '86400' });
    if (error) throw toAppError(error);
    // ?v= fuerza a los navegadores a descargar la imagen nueva aunque tengan la anterior en cache.
    const url = `${bucket.getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    unwrap(await this.#db.rpc('admin_set_game_images', {
      p_package: packageName,
      p_icon_url: kind === 'icon' ? url : null,
      p_background_url: kind === 'background' ? url : null,
    }));
    return url;
  }

  async removeGameImage(packageName: string, kind: GameImageKind): Promise<void> {
    unwrap(await this.#db.rpc('admin_set_game_images', {
      p_package: packageName,
      p_icon_url: kind === 'icon' ? '' : null,
      p_background_url: kind === 'background' ? '' : null,
    }));
  }
}
