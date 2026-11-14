import { githubUrl } from '@domain/author/Author';
import { useParams } from 'react-router';
import { ProfileCard } from '../components/profile/ProfileCard';
import { ErrorAlert } from '../components/ui/Alert';
import { Avatar } from '../components/ui/Avatar';
import { ExternalLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { GitHubIcon } from '../components/ui/icons';
import { LoadMore } from '../components/ui/LoadMore';
import { PageSpinner } from '../components/ui/Spinner';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useAuthor, useAuthorProfiles, useLiked } from '../queries/profiles';
import NotFoundPage from './NotFoundPage';

export default function AuthorPage() {
  const { username = '' } = useParams();
  const author = useAuthor(username);
  const profiles = useAuthorProfiles(author.data?.id);
  const items = profiles.data?.pages.flatMap((p) => p.items) ?? [];
  const liked = useLiked(items.map((p) => p.id));
  useDocumentTitle(author.data ? `Perfiles de ${author.data.username}` : undefined);

  if (author.isPending) return <PageSpinner />;
  if (author.error) return <ErrorAlert error={author.error} onRetry={() => void author.refetch()} />;
  if (!author.data) return <NotFoundPage />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar author={author.data} size={72} />
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{author.data.username}</h1>
          <p className="text-muted">{items.length > 0 && `${items.length}${profiles.hasNextPage ? '+' : ''} perfiles publicados`}</p>
        </div>
        <ExternalLink href={githubUrl(author.data)} variant="secondary" icon={<GitHubIcon />}>Ver en GitHub</ExternalLink>
      </div>
      {profiles.isPending ? <PageSpinner /> : profiles.error ? (
        <ErrorAlert error={profiles.error} onRetry={() => void profiles.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Todavía no ha publicado perfiles" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => <ProfileCard key={p.id} profile={p} showGame liked={liked.data?.has(p.id) ?? false} />)}
          </div>
          <LoadMore hasMore={!!profiles.hasNextPage} loading={profiles.isFetchingNextPage}
            onClick={() => void profiles.fetchNextPage()} />
        </>
      )}
    </div>
  );
}
