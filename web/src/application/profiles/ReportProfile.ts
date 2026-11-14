import { isReportReason, REPORT_DETAILS_MAX } from '@domain/report/ReportReason';
import { AppError } from '@domain/shared/AppError';
import { cleanLine } from '@domain/shared/text';
import type { ProfileRepository } from '../ports/ProfileRepository';
import { requireId } from '../shared/guards';

export class ReportProfile {
  readonly #profiles: ProfileRepository;

  constructor(profiles: ProfileRepository) {
    this.#profiles = profiles;
  }

  execute(input: { id: string; reason: string; details: string }): Promise<void> {
    if (!isReportReason(input.reason)) throw new AppError('INVALID_INPUT', 'Elige un motivo válido.');
    const details = cleanLine(input.details, 0, REPORT_DETAILS_MAX, 'detalles');
    return this.#profiles.report(requireId(input.id), input.reason, details);
  }
}
