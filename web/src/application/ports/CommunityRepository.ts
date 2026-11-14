import type { Comment, ProfileVersion } from '@domain/community/Community';
import type { GameProfileSummary, ProfileTag } from '@domain/profile/GameProfile';

/** Comentarios, versiones, etiquetas y destacados de los perfiles. */
export interface CommunityRepository {
  listComments(profileId: string): Promise<readonly Comment[]>;
  addComment(profileId: string, body: string): Promise<string>;
  deleteComment(commentId: string): Promise<void>;
  listVersions(profileId: string): Promise<readonly ProfileVersion[]>;
  setTags(profileId: string, tags: readonly ProfileTag[]): Promise<void>;
  listFeatured(limit: number): Promise<readonly GameProfileSummary[]>;
  /** Solo admins. */
  feature(profileId: string, on: boolean): Promise<void>;
}
