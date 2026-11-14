import { COMMENT_MAX, COMMENT_MIN, type Comment, type ProfileVersion } from '@domain/community/Community';
import { isProfileTag, MAX_TAGS, type GameProfileSummary, type ProfileTag } from '@domain/profile/GameProfile';
import { AppError } from '@domain/shared/AppError';
import type { CommunityRepository } from '../ports/CommunityRepository';
import { requireId } from '../shared/guards';

// eslint-disable-next-line no-control-regex -- a proposito: sin caracteres de control
const CONTROL = /[\u0000-\u001f\u007f]/g;

abstract class UseCase {
  protected readonly repo: CommunityRepository;

  constructor(repo: CommunityRepository) {
    this.repo = repo;
  }
}

export class ListComments extends UseCase {
  execute(profileId: string): Promise<readonly Comment[]> {
    return this.repo.listComments(requireId(profileId));
  }
}

export class AddComment extends UseCase {
  execute(input: { profileId: string; body: string }): Promise<string> {
    const body = input.body.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
    if (body.length < COMMENT_MIN || body.length > COMMENT_MAX) {
      throw new AppError('INVALID_INPUT', `El comentario debe tener entre ${COMMENT_MIN} y ${COMMENT_MAX} caracteres.`);
    }
    return this.repo.addComment(requireId(input.profileId), body);
  }
}

export class DeleteComment extends UseCase {
  execute(commentId: string): Promise<void> {
    return this.repo.deleteComment(requireId(commentId));
  }
}

export class ListVersions extends UseCase {
  execute(profileId: string): Promise<readonly ProfileVersion[]> {
    return this.repo.listVersions(requireId(profileId));
  }
}

export class SetProfileTags extends UseCase {
  execute(input: { profileId: string; tags: readonly string[] }): Promise<void> {
    const tags = [...new Set(input.tags)].filter(isProfileTag) as ProfileTag[];
    if (tags.length > MAX_TAGS) throw new AppError('INVALID_INPUT', `Elige como mucho ${MAX_TAGS} etiquetas.`);
    return this.repo.setTags(requireId(input.profileId), tags);
  }
}

export class ListFeaturedProfiles extends UseCase {
  execute(limit = 6): Promise<readonly GameProfileSummary[]> {
    return this.repo.listFeatured(Math.max(1, Math.min(24, limit)));
  }
}

export class FeatureProfile extends UseCase {
  execute(input: { profileId: string; on: boolean }): Promise<void> {
    return this.repo.feature(requireId(input.profileId), input.on);
  }
}
