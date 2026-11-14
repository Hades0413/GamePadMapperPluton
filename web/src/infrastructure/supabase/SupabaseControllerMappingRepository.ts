import type { ControllerMappingRepository } from '@application/ports/ControllerMappingRepository';
import { MAPPING_STATUSES, type ControllerMapping, type MappingStatus } from '@domain/controller/ControllerMapping';
import { SDL_PLATFORMS } from '@domain/controller/sdlMapping';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parse, unwrap } from './errors';
import { toAuthor } from './mappers';
import { authorRow } from './rows';

const COLUMNS = 'id,guid,name,platform,mapping,status,created_at,reviewed_at,author:authors(id,username,avatar_url)';

const base = {
  id: z.uuid(),
  guid: z.string().regex(/^[0-9a-f]{32}$/),
  name: z.string(),
  platform: z.enum(SDL_PLATFORMS),
  mapping: z.string().max(1024),
  status: z.enum(MAPPING_STATUSES),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
};
const mappingRow = z.object({ ...base, author: authorRow.nullable() });
const adminRow = z.object({ ...base, author_id: z.uuid(), username: z.string() });

const dates = (row: { created_at: string; reviewed_at: string | null }) => ({
  createdAt: new Date(row.created_at),
  reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
});

const toMapping = (row: z.infer<typeof mappingRow>): ControllerMapping => ({
  id: row.id, guid: row.guid, name: row.name, platform: row.platform, mapping: row.mapping, status: row.status,
  author: row.author ? toAuthor(row.author) : null, ...dates(row),
});

const toAdminMapping = (row: z.infer<typeof adminRow>): ControllerMapping => ({
  id: row.id, guid: row.guid, name: row.name, platform: row.platform, mapping: row.mapping, status: row.status,
  author: { id: row.author_id, username: row.username, avatarUrl: null }, ...dates(row),
});

export class SupabaseControllerMappingRepository implements ControllerMappingRepository {
  readonly #db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.#db = db;
  }

  async listApproved(search: string, limit: number): Promise<readonly ControllerMapping[]> {
    let request = this.#db.from('controller_mappings').select(COLUMNS).eq('status', 'approved');
    // `search` ya viene limpio (solo letras, numeros, espacios y guiones): no rompe el filtro.
    if (search) {
      request = /^[0-9a-f]{4,32}$/i.test(search)
        ? request.or(`name.ilike.%${search}%,guid.ilike.%${search}%`)
        : request.ilike('name', `%${search}%`);
    }
    const result = await request.order('created_at', { ascending: false }).limit(limit);
    return parse(z.array(mappingRow), unwrap(result)).map(toMapping);
  }

  async listMine(authorId: string): Promise<readonly ControllerMapping[]> {
    const result = await this.#db.from('controller_mappings').select(COLUMNS)
      .eq('author_id', authorId).order('created_at', { ascending: false }).limit(100);
    return parse(z.array(mappingRow), unwrap(result)).map(toMapping);
  }

  async submit(line: string): Promise<string> {
    return parse(z.uuid(), unwrap(await this.#db.rpc('submit_controller_mapping', { p_line: line })));
  }

  async remove(id: string): Promise<void> {
    unwrap(await this.#db.rpc('delete_controller_mapping', { p_id: id }));
  }

  async adminList(status: MappingStatus): Promise<readonly ControllerMapping[]> {
    const rows = unwrap(await this.#db.rpc('admin_controller_mappings', { p_status: status, p_limit: 100 }));
    return parse(z.array(adminRow), rows).map(toAdminMapping);
  }

  async review(id: string, approve: boolean): Promise<void> {
    unwrap(await this.#db.rpc('admin_review_controller_mapping', { p_id: id, p_approve: approve }));
  }
}
