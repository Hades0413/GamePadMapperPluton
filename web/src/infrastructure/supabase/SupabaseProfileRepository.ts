import type { NewProfile, ProfileChanges, ProfileRepository } from '@application/ports/ProfileRepository';
import type {
  GameProfile, GameProfileSummary, LikeResult, ProfileFilters, ProfileSort,
} from '@domain/profile/GameProfile';
import { AppError } from '@domain/shared/AppError';
import type { ReportReason } from '@domain/report/ReportReason';
import type { Page, PageRequest } from '@domain/shared/Page';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parse, unwrap } from './errors';
import { toProfile, toProfileSummary } from './mappers';
import { rangeOf, toPage } from './pagination';
import { PROFILE_COLUMNS, PROFILE_SUMMARY_COLUMNS, profileRow, profileSummaryRow } from './rows';

const summaries = z.array(profileSummaryRow);

export class SupabaseProfileRepository implements ProfileRepository {
  readonly #db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async listByGame(
    packageName: string, sort: ProfileSort, page: PageRequest, filters: ProfileFilters,
  ): Promise<Page<GameProfileSummary>> {
    const [from, to] = rangeOf(page);
    let request = this.#db
      .from('game_profiles')
      .select(PROFILE_SUMMARY_COLUMNS)
      .eq('package', packageName)
      .eq('status', 'published');
    // Los filtros llegan ya saneados (sin comodines ni sintaxis de PostgREST).
    if (filters.search) request = request.or(`title.ilike.*${filters.search}*,description.ilike.*${filters.search}*`);
    if (filters.model) request = request.ilike('device_model', filters.model.replace(/[\\%_]/g, '\\$&'));
    else if (filters.brand) request = request.ilike('device_model', `${filters.brand.replace(/[\\%_]/g, '\\$&')} %`);
    if (filters.tag) request = request.contains('tags', [filters.tag]);
    // Misma proporcion de pantalla (2 % de margen): estos perfiles encajan tal cual.
    if (filters.ratio) {
      request = request.gte('screen_ratio', +(filters.ratio * 0.98).toFixed(3)).lte('screen_ratio', +(filters.ratio * 1.02).toFixed(3));
    }
    if (sort === 'popular') request = request.order('like_count', { ascending: false });
    if (sort === 'installs') request = request.order('install_count', { ascending: false });
    if (sort === 'rating') request = request.order('works_yes', { ascending: false }).order('works_no', { ascending: true });
    const rows = parse(summaries, unwrap(await request.order('created_at', { ascending: false }).range(from, to)));
    return toPage(rows.map(toProfileSummary), page);
  }

  async listDeviceModels(packageName: string): Promise<readonly string[]> {
    const result = await this.#db
      .from('game_profiles')
      .select('device_model')
      .eq('package', packageName)
      .eq('status', 'published')
      .not('device_model', 'is', null)
      .limit(100);
    const rows = parse(z.array(z.object({ device_model: z.string() })), unwrap(result));
    return [...new Set(rows.map((r) => r.device_model))].sort((a, b) => a.localeCompare(b));
  }

  async listByAuthor(authorId: string, page: PageRequest): Promise<Page<GameProfileSummary>> {
    const [from, to] = rangeOf(page);
    // Sin filtrar por estado: las reglas de la base de datos solo dejan ver los ocultos a su autor.
    const result = await this.#db
      .from('game_profiles')
      .select(PROFILE_SUMMARY_COLUMNS)
      .eq('author_id', authorId)
      .order('created_at', { ascending: false })
      .range(from, to);
    return toPage(parse(summaries, unwrap(result)).map(toProfileSummary), page);
  }

  async findById(id: string): Promise<GameProfile | null> {
    const row = unwrap(await this.#db.from('game_profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle());
    return row ? toProfile(parse(profileRow, row)) : null;
  }

  async publish(profile: NewProfile): Promise<string> {
    const result = await this.#db.rpc('publish_profile', {
      p_package: profile.packageName,
      p_game_name: profile.gameName,
      p_title: profile.title,
      p_description: profile.description,
      p_conf: profile.conf,
      p_device: profile.deviceModel,
    });
    return parse(z.uuid(), unwrap(result));
  }

  async update(id: string, changes: ProfileChanges): Promise<void> {
    unwrap(await this.#db.rpc('update_profile', {
      p_id: id,
      p_title: changes.title,
      p_description: changes.description,
      p_conf: changes.conf,
      p_device: changes.deviceModel,
    }));
  }

  async delete(id: string): Promise<void> {
    unwrap(await this.#db.rpc('delete_profile', { p_id: id }));
  }

  async toggleLike(id: string): Promise<LikeResult> {
    const rows = parse(z.array(z.object({ liked: z.boolean(), like_count: z.number().int() })),
      unwrap(await this.#db.rpc('like_profile', { p_id: id })));
    const row = rows[0];
    if (!row) throw new AppError('UNKNOWN', 'El servidor no respondió al «me gusta».');
    return { liked: row.liked, likeCount: row.like_count };
  }

  async likedAmong(ids: readonly string[]): Promise<ReadonlySet<string>> {
    const { data } = await this.#db.auth.getSession();
    if (!data.session) return new Set();
    const result = await this.#db.from('profile_likes').select('profile_id').in('profile_id', [...ids]);
    const rows = parse(z.array(z.object({ profile_id: z.uuid() })), unwrap(result));
    return new Set(rows.map((r) => r.profile_id));
  }

  async report(id: string, reason: ReportReason, details: string): Promise<void> {
    unwrap(await this.#db.rpc('report_profile', { p_id: id, p_reason: reason, p_details: details }));
  }
}
