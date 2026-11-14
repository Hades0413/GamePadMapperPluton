import type { CommunityRepository } from '@application/ports/CommunityRepository';
import type { Comment, ProfileVersion } from '@domain/community/Community';
import type { GameProfileSummary, ProfileTag } from '@domain/profile/GameProfile';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parse, unwrap } from './errors';
import { toComment, toProfileSummary, toVersion } from './mappers';
import { COMMENT_COLUMNS, commentRow, PROFILE_SUMMARY_COLUMNS, profileSummaryRow, versionRow } from './rows';

export class SupabaseCommunityRepository implements CommunityRepository {
  readonly #db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async listComments(profileId: string): Promise<readonly Comment[]> {
    const result = await this.#db.from('profile_comments').select(COMMENT_COLUMNS)
      .eq('profile_id', profileId).order('created_at', { ascending: false }).limit(100);
    return parse(z.array(commentRow), unwrap(result)).map(toComment);
  }

  async addComment(profileId: string, body: string): Promise<string> {
    return parse(z.uuid(), unwrap(await this.#db.rpc('add_comment', { p_id: profileId, p_body: body })));
  }

  async deleteComment(commentId: string): Promise<void> {
    unwrap(await this.#db.rpc('delete_comment', { p_id: commentId }));
  }

  async listVersions(profileId: string): Promise<readonly ProfileVersion[]> {
    const result = await this.#db.from('profile_versions').select('version,title,conf,created_at')
      .eq('profile_id', profileId).order('version', { ascending: false }).limit(20);
    return parse(z.array(versionRow), unwrap(result)).map(toVersion);
  }

  async setTags(profileId: string, tags: readonly ProfileTag[]): Promise<void> {
    unwrap(await this.#db.rpc('set_profile_tags', { p_id: profileId, p_tags: [...tags] }));
  }

  async listFeatured(limit: number): Promise<readonly GameProfileSummary[]> {
    const result = await this.#db.from('game_profiles').select(PROFILE_SUMMARY_COLUMNS)
      .eq('status', 'published').not('featured_at', 'is', null)
      .order('featured_at', { ascending: false }).limit(limit);
    return parse(z.array(profileSummaryRow), unwrap(result)).map(toProfileSummary);
  }

  async feature(profileId: string, on: boolean): Promise<void> {
    unwrap(await this.#db.rpc('admin_feature_profile', { p_id: profileId, p_on: on }));
  }
}
