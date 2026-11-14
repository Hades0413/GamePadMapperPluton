import type {
  Diagnostic, GameChanges, ImportedGame, ModerationRepository, PlayScreenshot, ReportedProfile,
} from '@application/ports/ModerationRepository';
import type { GameImageFile, GameImageKind } from '@domain/game/GameImage';
import {
  isModerationAction, type BanDays, type BannedAuthor, type CommentAction, type ModerationLogEntry, type ReportedComment,
} from '@domain/moderation/Moderation';
import { AppError } from '@domain/shared/AppError';
import type { ProfileStatus } from '@domain/profile/GameProfile';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parse, toAppError, unwrap } from './errors';
import { bannedRow, diagnosticRow, moderationLogRow, reportedCommentRow, reportedRow } from './rows';

export class SupabaseModerationRepository implements ModerationRepository {
  readonly #db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async diagnostics(): Promise<readonly Diagnostic[]> {
    const rows = parse(z.array(diagnosticRow), unwrap(await this.#db.rpc('admin_list_diagnostics', { p_limit: 100 })));
    return rows.map((r) => ({
      id: r.id, appVersion: r.app_version, android: r.android, device: r.device, mode: r.mode,
      message: r.message, log: r.log, createdAt: new Date(r.created_at),
    }));
  }

  async deleteDiagnostic(id: string): Promise<void> {
    unwrap(await this.#db.rpc('admin_delete_diagnostic', { p_id: id }));
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

  async banAuthor(authorId: string, days: BanDays | null, reason: string): Promise<void> {
    unwrap(await this.#db.rpc('admin_ban_author', { p_user: authorId, p_days: days, p_reason: reason }));
  }

  async unbanAuthor(authorId: string, reason: string): Promise<void> {
    unwrap(await this.#db.rpc('admin_unban_author', { p_user: authorId, p_reason: reason }));
  }

  async bannedAuthors(): Promise<readonly BannedAuthor[]> {
    const rows = parse(z.array(bannedRow), unwrap(await this.#db.rpc('admin_banned_authors')));
    return rows.map((r) => ({
      id: r.id, username: r.username, permanent: r.is_banned,
      bannedUntil: r.banned_until ? new Date(r.banned_until) : null,
    }));
  }

  async reportedComments(): Promise<readonly ReportedComment[]> {
    const rows = parse(z.array(reportedCommentRow), unwrap(await this.#db.rpc('admin_reported_comments')));
    return rows.map((r) => ({
      id: r.id, profileId: r.profile_id, profileTitle: r.profile_title, authorId: r.author_id, username: r.username,
      body: r.body, hidden: r.is_hidden, reportCount: r.report_count, reasons: r.reasons, createdAt: new Date(r.created_at),
    }));
  }

  async moderateComment(commentId: string, action: CommentAction, reason: string): Promise<void> {
    unwrap(await this.#db.rpc('admin_moderate_comment', { p_id: commentId, p_action: action, p_reason: reason }));
  }

  async moderationLog(limit: number, before: number | null): Promise<readonly ModerationLogEntry[]> {
    const rows = parse(z.array(moderationLogRow), unwrap(await this.#db.rpc('admin_moderation_log', { p_limit: limit, p_before: before })));
    return rows.flatMap((r) => (isModerationAction(r.action) ? [{
      id: r.id, adminName: r.admin_name, action: r.action, targetType: r.target_type, targetId: r.target_id,
      targetLabel: r.target_label, reason: r.reason, createdAt: new Date(r.created_at),
    }] : []));
  }

  async updateGame(packageName: string, changes: GameChanges): Promise<void> {
    unwrap(await this.#db.rpc('admin_update_game', {
      p_package: packageName,
      p_name: changes.name,
      p_hidden: changes.hidden,
    }));
  }

  /** Llama a la funcion importar-juego; si responde { error }, ese es el mensaje para el usuario. */
  async #invoke(body: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.#db.functions.invoke('importar-juego', { body });
    if (error) {
      const context = (error as { context?: Response }).context;
      const detail = context ? await context.json().catch(() => null) as { error?: string } | null : null;
      throw detail?.error ? new AppError('INVALID_INPUT', detail.error) : toAppError(error);
    }
    return data;
  }

  async importGameFromPlay(packageName: string, updateName: boolean): Promise<ImportedGame> {
    const data = await this.#invoke({ package: packageName, updateName });
    return parse(z.object({ name: z.string().nullable(), iconUrl: z.string(), nameUpdated: z.boolean() }), data);
  }

  async listPlayScreenshots(packageName: string): Promise<readonly PlayScreenshot[]> {
    const data = await this.#invoke({ package: packageName, action: 'capturas' });
    const shots = parse(z.object({ screenshots: z.array(z.object({ id: z.string(), thumb: z.string() })) }), data).screenshots;
    // Solo miniaturas de Google Play (las muestra el navegador del admin al elegir).
    return shots
      .filter((s) => /^https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9_=-]+$/.test(s.thumb))
      .map((s) => ({ id: s.id, thumbUrl: s.thumb }));
  }

  async useBackgroundFromPlay(packageName: string, screenshotId: string): Promise<string> {
    const data = await this.#invoke({ package: packageName, action: 'fondo', image: screenshotId });
    return parse(z.object({ backgroundUrl: z.string() }), data).backgroundUrl;
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
