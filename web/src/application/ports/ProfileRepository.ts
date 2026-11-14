import type {
  GameProfile, GameProfileSummary, LikeResult, ProfileFilters, ProfileSort,
} from '@domain/profile/GameProfile';
import type { ReportReason } from '@domain/report/ReportReason';
import type { Page, PageRequest } from '@domain/shared/Page';

export interface NewProfile {
  readonly packageName: string;
  readonly gameName: string;
  readonly title: string;
  readonly description: string;
  readonly conf: string;
  /** Modelo del telefono ('' = sin indicar). */
  readonly deviceModel: string;
}

export interface ProfileChanges {
  readonly title: string;
  readonly description: string;
  readonly conf: string;
  readonly deviceModel: string;
}

/** Proporcion de pantalla (lado largo / corto) para filtrar perfiles que encajan. */
export type ScreenRatio = number;

export interface ProfileRepository {
  listByGame(packageName: string, sort: ProfileSort, page: PageRequest, filters: ProfileFilters): Promise<Page<GameProfileSummary>>;
  /** Modelos de telefono con perfiles de este juego (para los filtros de marca y modelo). */
  listDeviceModels(packageName: string): Promise<readonly string[]>;
  listByAuthor(authorId: string, page: PageRequest): Promise<Page<GameProfileSummary>>;
  findById(id: string): Promise<GameProfile | null>;
  publish(profile: NewProfile): Promise<string>;
  update(id: string, changes: ProfileChanges): Promise<void>;
  delete(id: string): Promise<void>;
  /** Da o quita «me gusta»; devuelve el estado final y el total exacto. */
  toggleLike(id: string): Promise<LikeResult>;
  /** Cuales de estos perfiles tienen "me gusta" del usuario actual. */
  likedAmong(ids: readonly string[]): Promise<ReadonlySet<string>>;
  report(id: string, reason: ReportReason, details: string): Promise<void>;
}
