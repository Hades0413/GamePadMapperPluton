import type { Author } from '@domain/author/Author';

export function Avatar({ author, size = 32 }: { author: Pick<Author, 'username' | 'avatarUrl'>; size?: number }) {
  if (author.avatarUrl) {
    const url = new URL(author.avatarUrl);
    url.searchParams.set('s', String(size * 2));
    return (
      <img
        src={url.toString()}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="shrink-0 rounded-full bg-surface-2"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand font-semibold text-primary"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {author.username.slice(0, 1).toUpperCase()}
    </span>
  );
}
