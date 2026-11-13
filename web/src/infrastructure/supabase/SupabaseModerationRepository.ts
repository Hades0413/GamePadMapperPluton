import type { GameChanges, ModerationRepository, ReportedProfile } from '@application/ports/ModerationRepository';
import type { ProfileStatus } from '@domain/profile/GameProfile';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parse, unwrap } from './errors';
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
      p_icon_url: changes.iconUrl,
      p_hidden: changes.hidden,
    }));
  }
}
