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
  readonly iconUrl: string | null;
  readonly hidden: boolean;
}

export interface ModerationRepository {
  reportedProfiles(): Promise<readonly ReportedProfile[]>;
  setProfileStatus(id: string, status: ProfileStatus, clearReports: boolean): Promise<void>;
  setAuthorBanned(authorId: string, banned: boolean): Promise<void>;
  updateGame(packageName: string, changes: GameChanges): Promise<void>;
}
