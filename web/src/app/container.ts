/**
 * Raiz de composicion: el UNICO sitio que conoce todas las capas. Aqui se eligen las
 * implementaciones (Supabase) de los puertos y se crean los casos de uso. Para cambiar de
 * proveedor solo habria que escribir otros repositorios y cambiarlos aqui.
 */
import {
  DeleteAccount, GetCurrentAccount, ObserveSession, SignInWithGitHub, SignOut, TakeReturnPath,
} from '@application/auth/AuthUseCases';
import { GetAuthor } from '@application/authors/GetAuthor';
import {
  AddComment, DeleteComment, FeatureProfile, ListComments, ListFeaturedProfiles, ListVersions, SetProfileTags,
} from '@application/community/CommunityUseCases';
import {
  DeleteMapping, ListApprovedMappings, ListMappingsForReview, ListMyMappings, ReviewMapping, SubmitMapping,
} from '@application/controllers/ControllerMappingUseCases';
import { FillGameImages } from '@application/games/FillGameImages';
import { GetGame } from '@application/games/GetGame';
import { ListGames } from '@application/games/ListGames';
import {
  BanAuthor, DeleteDiagnostic, ImportGameFromPlay, ListDiagnostics, ListPlayScreenshots, ListReportedProfiles, ModerateProfile, SetGameImage,
  UpdateGame, UseBackgroundFromPlay,
} from '@application/moderation/ModerationUseCases';
import { DeleteProfile } from '@application/profiles/DeleteProfile';
import { GetLikedProfiles } from '@application/profiles/GetLikedProfiles';
import { GetProfile } from '@application/profiles/GetProfile';
import { ListAuthorProfiles } from '@application/profiles/ListAuthorProfiles';
import { ListDeviceModels, ListGameProfiles } from '@application/profiles/ListGameProfiles';
import { PublishProfile } from '@application/profiles/PublishProfile';
import { ReportProfile } from '@application/profiles/ReportProfile';
import { ToggleLike } from '@application/profiles/ToggleLike';
import { UpdateProfile } from '@application/profiles/UpdateProfile';
import type { Env } from '@infrastructure/config/env';
import { createSupabase } from '@infrastructure/supabase/client';
import { SupabaseAuthGateway } from '@infrastructure/supabase/SupabaseAuthGateway';
import { SupabaseAuthorRepository } from '@infrastructure/supabase/SupabaseAuthorRepository';
import { SupabaseCommunityRepository } from '@infrastructure/supabase/SupabaseCommunityRepository';
import { SupabaseControllerMappingRepository } from '@infrastructure/supabase/SupabaseControllerMappingRepository';
import { SupabaseGameRepository } from '@infrastructure/supabase/SupabaseGameRepository';
import { SupabaseModerationRepository } from '@infrastructure/supabase/SupabaseModerationRepository';
import { SupabaseProfileRepository } from '@infrastructure/supabase/SupabaseProfileRepository';
import type { Services } from '@presentation/di/Services';

export function createServices(env: Env): Services {
  const db = createSupabase(env);
  const games = new SupabaseGameRepository(db);
  const profiles = new SupabaseProfileRepository(db);
  const authors = new SupabaseAuthorRepository(db);
  // Al volver de GitHub se entra por la portada (siempre existe en GitHub Pages) y desde ahi
  // se vuelve a la pagina guardada.
  const auth = new SupabaseAuthGateway(db, `${env.siteUrl}/`);
  const moderation = new SupabaseModerationRepository(db);
  const community = new SupabaseCommunityRepository(db);
  const controllers = new SupabaseControllerMappingRepository(db);

  return {
    links: { playUrl: env.playUrl, repoUrl: env.repoUrl, siteUrl: env.siteUrl },
    useCases: {
      listGames: new ListGames(games),
      getGame: new GetGame(games),
      fillGameImages: new FillGameImages(games),
      listGameProfiles: new ListGameProfiles(profiles),
      listDeviceModels: new ListDeviceModels(profiles),
      listAuthorProfiles: new ListAuthorProfiles(profiles),
      getProfile: new GetProfile(profiles),
      publishProfile: new PublishProfile(profiles),
      updateProfile: new UpdateProfile(profiles),
      deleteProfile: new DeleteProfile(profiles),
      toggleLike: new ToggleLike(profiles),
      getLikedProfiles: new GetLikedProfiles(profiles),
      reportProfile: new ReportProfile(profiles),
      getAuthor: new GetAuthor(authors),
      getCurrentAccount: new GetCurrentAccount(auth),
      observeSession: new ObserveSession(auth),
      signInWithGitHub: new SignInWithGitHub(auth),
      takeReturnPath: new TakeReturnPath(auth),
      signOut: new SignOut(auth),
      deleteAccount: new DeleteAccount(auth),
      listReportedProfiles: new ListReportedProfiles(moderation),
      moderateProfile: new ModerateProfile(moderation),
      banAuthor: new BanAuthor(moderation),
      updateGame: new UpdateGame(moderation),
      importGameFromPlay: new ImportGameFromPlay(moderation),
      setGameImage: new SetGameImage(moderation),
      listPlayScreenshots: new ListPlayScreenshots(moderation),
      useBackgroundFromPlay: new UseBackgroundFromPlay(moderation),
      listComments: new ListComments(community),
      addComment: new AddComment(community),
      deleteComment: new DeleteComment(community),
      listVersions: new ListVersions(community),
      setProfileTags: new SetProfileTags(community),
      listFeaturedProfiles: new ListFeaturedProfiles(community),
      featureProfile: new FeatureProfile(community),
      listDiagnostics: new ListDiagnostics(moderation),
      deleteDiagnostic: new DeleteDiagnostic(moderation),
      listApprovedMappings: new ListApprovedMappings(controllers),
      listMyMappings: new ListMyMappings(controllers),
      submitMapping: new SubmitMapping(controllers),
      deleteMapping: new DeleteMapping(controllers),
      listMappingsForReview: new ListMappingsForReview(controllers),
      reviewMapping: new ReviewMapping(controllers),
    },
  };
}
