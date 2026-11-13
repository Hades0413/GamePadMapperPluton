import type { ProfileStatus } from '@domain/profile/GameProfile';
import { cleanLine } from '@domain/shared/text';
import { AppError } from '@domain/shared/AppError';
import type { ModerationRepository, ReportedProfile } from '../ports/ModerationRepository';
import { checkGameName, checkPackage } from '../profiles/profileInput';
import { requireId } from '../shared/guards';

export class ListReportedProfiles {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(): Promise<readonly ReportedProfile[]> {
    return this.#moderation.reportedProfiles();
  }
}

export class ModerateProfile {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(input: { id: string; status: ProfileStatus; clearReports: boolean }): Promise<void> {
    return this.#moderation.setProfileStatus(requireId(input.id), input.status, input.clearReports);
  }
}

export class BanAuthor {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(input: { authorId: string; banned: boolean }): Promise<void> {
    return this.#moderation.setAuthorBanned(requireId(input.authorId), input.banned);
  }
}

export class UpdateGame {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(input: { packageName: string; name: string; iconUrl: string; hidden: boolean }): Promise<void> {
    const icon = cleanLine(input.iconUrl, 0, 500, 'icono');
    if (icon !== '' && !/^https:\/\/[^\s"'<>]+$/.test(icon)) {
      throw new AppError('INVALID_INPUT', 'El icono debe ser una dirección https://');
    }
    return this.#moderation.updateGame(checkPackage(input.packageName), {
      name: checkGameName(input.name),
      iconUrl: icon === '' ? null : icon,
      hidden: input.hidden,
    });
  }
}
