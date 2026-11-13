import type { GameProfileSummary } from '@domain/profile/GameProfile';
import { Link } from 'react-router';
import { compactNumber, timeAgo } from '../../lib/format';
import { paths } from '../../routes/paths';
import { Avatar } from '../ui/Avatar';
import { HeartIcon } from '../ui/icons';

export function ProfileCard({
  profile, liked = false, showGame = false,
}: { profile: GameProfileSummary; liked?: boolean; showGame?: boolean }) {
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
