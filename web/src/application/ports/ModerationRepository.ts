import type { GameImageFile, GameImageKind } from '@domain/game/GameImage';
import type { ProfileStatus } from '@domain/profile/GameProfile';

export interface ReportedProfile {
  readonly id: string;
  readonly packageName: string;
  readonly title: string;
  readonly authorId: string;
  readonly username: string;
  readonly status: ProfileStatus;
  readonly reportCount: number;
  readonly reasons: readonly string[];
  readonly createdAt: Date;
}

export interface GameChanges {
  readonly name: string;
  readonly hidden: boolean;
}

/** Captura de la ficha de Google Play (miniatura servida por Google; se copia al elegirla). */
export interface PlayScreenshot {
  readonly id: string;
  readonly thumbUrl: string;
}

export interface ImportedGame {
  readonly name: string | null;
  readonly iconUrl: string;
  readonly nameUpdated: boolean;
}

export interface ModerationRepository {
  reportedProfiles(): Promise<readonly ReportedProfile[]>;
  setProfileStatus(id: string, status: ProfileStatus, clearReports: boolean): Promise<void>;
  setAuthorBanned(authorId: string, banned: boolean): Promise<void>;
  updateGame(packageName: string, changes: GameChanges): Promise<void>;
  /** Nombre e icono desde la ficha publica de Google Play (lo hace el servidor). */
  importGameFromPlay(packageName: string, updateName: boolean): Promise<ImportedGame>;
  /** Sube una imagen del juego y la asigna. Devuelve su direccion publica. */
  uploadGameImage(packageName: string, kind: GameImageKind, file: GameImageFile): Promise<string>;
  removeGameImage(packageName: string, kind: GameImageKind): Promise<void>;
  /** Capturas horizontales de la ficha de Google Play del juego. */
  listPlayScreenshots(packageName: string): Promise<readonly PlayScreenshot[]>;
  /** Copia una captura de Google Play al Storage y la pone como fondo. Devuelve su URL. */
  useBackgroundFromPlay(packageName: string, screenshotId: string): Promise<string>;
}
