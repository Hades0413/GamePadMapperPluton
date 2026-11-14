import {
  isBanDays, isCommentAction, MODERATION_REASON_MAX, type BanDays, type BannedAuthor, type CommentAction,
  type ModerationLogEntry, type ReportedComment,
} from '@domain/moderation/Moderation';
import type { ProfileStatus } from '@domain/profile/GameProfile';
import { AppError } from '@domain/shared/AppError';
import { cleanLine } from '@domain/shared/text';
import {
  GAME_IMAGE_MAX_BYTES, isGameImageType, type GameImageFile, type GameImageKind,
} from '@domain/game/GameImage';
import type {
  Diagnostic, ImportedGame, ModerationRepository, PlayScreenshot, ReportedProfile,
} from '../ports/ModerationRepository';
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

/** Motivo opcional del admin: una linea, sin < > (la base de datos vuelve a comprobarlo). */
const cleanReason = (reason: string | undefined) => cleanLine(reason ?? '', 0, MODERATION_REASON_MAX, 'motivo');

export class BanAuthor {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  /** days null = para siempre; 1, 7 o 30 = temporal. */
  execute(input: { authorId: string; days: BanDays | null; reason?: string }): Promise<void> {
    if (input.days !== null && !isBanDays(input.days)) throw new AppError('INVALID_INPUT', 'Duración no válida.');
    return this.#moderation.banAuthor(requireId(input.authorId), input.days, cleanReason(input.reason));
  }
}

export class UnbanAuthor {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(input: { authorId: string; reason?: string }): Promise<void> {
    return this.#moderation.unbanAuthor(requireId(input.authorId), cleanReason(input.reason));
  }
}

export class ListBannedAuthors {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(): Promise<readonly BannedAuthor[]> {
    return this.#moderation.bannedAuthors();
  }
}

export class ListReportedComments {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(): Promise<readonly ReportedComment[]> {
    return this.#moderation.reportedComments();
  }
}

export class ModerateComment {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(input: { commentId: string; action: CommentAction; reason?: string }): Promise<void> {
    if (!isCommentAction(input.action)) throw new AppError('INVALID_INPUT', 'Acción no válida.');
    return this.#moderation.moderateComment(requireId(input.commentId), input.action, cleanReason(input.reason));
  }
}

export class ListModerationLog {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(input: { before?: number | null; limit?: number } = {}): Promise<readonly ModerationLogEntry[]> {
    const before = Number.isSafeInteger(input.before) && (input.before ?? 0) > 0 ? (input.before ?? null) : null;
    return this.#moderation.moderationLog(Math.max(1, Math.min(200, Math.trunc(input.limit ?? 50))), before);
  }
}

export class UpdateGame {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(input: { packageName: string; name: string; hidden: boolean }): Promise<void> {
    return this.#moderation.updateGame(checkPackage(input.packageName), {
      name: checkGameName(input.name),
      hidden: input.hidden,
    });
  }
}

export class ImportGameFromPlay {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(input: { packageName: string; updateName: boolean }): Promise<ImportedGame> {
    return this.#moderation.importGameFromPlay(checkPackage(input.packageName), input.updateName);
  }
}

export class SetGameImage {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  /** file null = quitar la imagen. */
  async execute(input: { packageName: string; kind: GameImageKind; file: GameImageFile | null }): Promise<string | null> {
    const pkg = checkPackage(input.packageName);
    if (input.kind !== 'icon' && input.kind !== 'background') throw new AppError('INVALID_INPUT', 'Tipo de imagen no válido.');
    if (input.file === null) {
      await this.#moderation.removeGameImage(pkg, input.kind);
      return null;
    }
    if (!isGameImageType(input.file.type)) throw new AppError('INVALID_INPUT', 'La imagen tiene que ser PNG, JPEG o WebP.');
    if (input.file.data.size === 0 || input.file.data.size > GAME_IMAGE_MAX_BYTES) {
      throw new AppError('INVALID_INPUT', 'La imagen tiene que pesar menos de 1 MB.');
    }
    return this.#moderation.uploadGameImage(pkg, input.kind, input.file);
  }
}

export class ListPlayScreenshots {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(packageName: string): Promise<readonly PlayScreenshot[]> {
    return this.#moderation.listPlayScreenshots(checkPackage(packageName));
  }
}

export class UseBackgroundFromPlay {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(input: { packageName: string; screenshotId: string }): Promise<string> {
    if (!/^https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9_-]{20,300}$/.test(input.screenshotId)) {
      throw new AppError('INVALID_INPUT', 'Captura no válida.');
    }
    return this.#moderation.useBackgroundFromPlay(checkPackage(input.packageName), input.screenshotId);
  }
}

export class ListDiagnostics {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(): Promise<readonly Diagnostic[]> {
    return this.#moderation.diagnostics();
  }
}

export class DeleteDiagnostic {
  readonly #moderation: ModerationRepository;

  constructor(moderation: ModerationRepository) {
    this.#moderation = moderation;
  }

  execute(id: string): Promise<void> {
    return this.#moderation.deleteDiagnostic(requireId(id));
  }
}
