import type {
  DeleteAccount, GetCurrentAccount, ObserveSession, SignInWithGitHub, SignOut, TakeReturnPath,
} from '@application/auth/AuthUseCases';
import type { GetAuthor } from '@application/authors/GetAuthor';
import type {
  AddComment, DeleteComment, FeatureProfile, ListComments, ListFeaturedProfiles, ListVersions, SetProfileTags,
} from '@application/community/CommunityUseCases';
import type { FillGameImages } from '@application/games/FillGameImages';
import type { GetGame } from '@application/games/GetGame';
import type { ListGames } from '@application/games/ListGames';
import type {
  BanAuthor, DeleteDiagnostic, ImportGameFromPlay, ListDiagnostics, ListPlayScreenshots, ListReportedProfiles, ModerateProfile, SetGameImage,
  UpdateGame, UseBackgroundFromPlay,
} from '@application/moderation/ModerationUseCases';
import type { DeleteProfile } from '@application/profiles/DeleteProfile';
import type { GetLikedProfiles } from '@application/profiles/GetLikedProfiles';
import type { GetProfile } from '@application/profiles/GetProfile';
import type { ListAuthorProfiles } from '@application/profiles/ListAuthorProfiles';
import type { ListDeviceModels, ListGameProfiles } from '@application/profiles/ListGameProfiles';
import type { PublishProfile } from '@application/profiles/PublishProfile';
import type { ReportProfile } from '@application/profiles/ReportProfile';
import type { ToggleLike } from '@application/profiles/ToggleLike';
import type { UpdateProfile } from '@application/profiles/UpdateProfile';

/** Casos de uso que la interfaz puede usar. La interfaz no sabe que detras esta Supabase. */
export interface UseCases {
  readonly listGames: ListGames;
  readonly getGame: GetGame;
  readonly fillGameImages: FillGameImages;
  readonly listGameProfiles: ListGameProfiles;
  readonly listDeviceModels: ListDeviceModels;
  readonly listAuthorProfiles: ListAuthorProfiles;
  readonly getProfile: GetProfile;
  readonly publishProfile: PublishProfile;
  readonly updateProfile: UpdateProfile;
  readonly deleteProfile: DeleteProfile;
  readonly toggleLike: ToggleLike;
  readonly getLikedProfiles: GetLikedProfiles;
  readonly reportProfile: ReportProfile;
  readonly getAuthor: GetAuthor;
  readonly getCurrentAccount: GetCurrentAccount;
  readonly observeSession: ObserveSession;
  readonly signInWithGitHub: SignInWithGitHub;
  readonly takeReturnPath: TakeReturnPath;
  readonly signOut: SignOut;
  readonly deleteAccount: DeleteAccount;
  readonly listReportedProfiles: ListReportedProfiles;
  readonly moderateProfile: ModerateProfile;
  readonly banAuthor: BanAuthor;
  readonly updateGame: UpdateGame;
  readonly importGameFromPlay: ImportGameFromPlay;
  readonly setGameImage: SetGameImage;
  readonly listPlayScreenshots: ListPlayScreenshots;
  readonly useBackgroundFromPlay: UseBackgroundFromPlay;
  readonly listComments: ListComments;
  readonly addComment: AddComment;
  readonly deleteComment: DeleteComment;
  readonly listVersions: ListVersions;
  readonly setProfileTags: SetProfileTags;
  readonly listFeaturedProfiles: ListFeaturedProfiles;
  readonly featureProfile: FeatureProfile;
  readonly listDiagnostics: ListDiagnostics;
  readonly deleteDiagnostic: DeleteDiagnostic;
}

export interface SiteLinks {
  readonly playUrl: string;
  readonly repoUrl: string;
  readonly siteUrl: string;
}

export interface Services {
  readonly useCases: UseCases;
  readonly links: SiteLinks;
}
