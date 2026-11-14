import { worksShare, type GameProfileSummary } from '@domain/profile/GameProfile';
import { Link } from 'react-router';
import { sameRatio, type Screen } from '@domain/profile/conf/fit';
import { ratioLabel } from '../../lib/device';
import { compactNumber, timeAgo } from '../../lib/format';
import { paths } from '../../routes/paths';
import { Avatar } from '../ui/Avatar';
import { DownloadIcon, HeartIcon } from '../ui/icons';

export function ProfileCard({
  profile, liked = false, showGame = false, myScreen = null,
}: { profile: GameProfileSummary; liked?: boolean; showGame?: boolean; myScreen?: Screen | null }) {
  const share = worksShare(profile);
  const fits = myScreen !== null && sameRatio(profile.screen, myScreen);
  return (
    <article className="card relative flex flex-col gap-3 p-4 transition-colors hover:border-primary/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showGame && <p className="truncate text-xs text-muted">{profile.gameName ?? profile.packageName}</p>}
          <h3 className="truncate font-semibold">
            <Link to={paths.profile(profile.id)} className="after:absolute after:inset-0">
              {profile.title}
            </Link>
          </h3>
        </div>
        <span className={`flex shrink-0 items-center gap-1 text-sm ${liked ? 'text-danger' : 'text-muted'}`}
          title={`${profile.likeCount} me gusta`}>
          <HeartIcon filled={liked} />
          {compactNumber(profile.likeCount)}
        </span>
      </div>
      {profile.description && <p className="line-clamp-2 text-sm text-muted">{profile.description}</p>}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-muted">
          {profile.deviceModel ? `${profile.deviceModel} · ` : ''}{ratioLabel(profile.screen)}
        </span>
        {fits && <span className="rounded-md bg-success/15 px-2 py-0.5 font-medium text-success">Encaja con tu pantalla</span>}
        {profile.installCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-muted"
            title={`${profile.installCount} instalaciones desde la app`}>
            <DownloadIcon className="size-3" />{compactNumber(profile.installCount)}
          </span>
        )}
        {share !== null && (
          <span className={`rounded-md px-2 py-0.5 font-medium ${share >= 70 ? 'bg-success/15 text-success' : share >= 40 ? 'bg-warning/15 text-warning' : 'bg-danger/15 text-danger'}`}
            title={`${profile.worksYes} sí · ${profile.worksNo} no`}>
            {share} % dice que funciona
          </span>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
        {profile.author ? (
          <span className="flex min-w-0 items-center gap-2">
            <Avatar author={profile.author} size={20} />
            <span className="truncate">{profile.author.username}</span>
          </span>
        ) : <span />}
        <span className="shrink-0">
          {profile.bindingCount} botones · {timeAgo(profile.createdAt)}
          {profile.status === 'hidden' && <span className="ml-2 rounded bg-warning/20 px-1.5 py-0.5 text-warning">Oculto</span>}
        </span>
      </div>
    </article>
  );
}
