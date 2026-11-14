import type { Author } from '@domain/author/Author';
import type { SdlPlatform } from './sdlMapping';

export const MAPPING_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type MappingStatus = (typeof MAPPING_STATUSES)[number];

export const isMappingStatus = (value: unknown): value is MappingStatus =>
  (MAPPING_STATUSES as readonly unknown[]).includes(value);

/** Linea SDL de un mando enviada por la comunidad (publica solo si esta aprobada). */
export interface ControllerMapping {
  readonly id: string;
  readonly guid: string;
  readonly name: string;
  readonly platform: SdlPlatform;
  /** Linea SDL canonica. */
  readonly mapping: string;
  readonly status: MappingStatus;
  readonly author: Author | null;
  readonly createdAt: Date;
  readonly reviewedAt: Date | null;
}
