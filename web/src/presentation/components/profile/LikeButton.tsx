import { useState } from 'react';
import { useLocation } from 'react-router';
import { useAccount, useSignIn } from '../../queries/account';
import { useLiked, useToggleLike } from '../../queries/profiles';
import { compactNumber } from '../../lib/format';
import { errorMessage } from '../../lib/errorMessage';
import { Button } from '../ui/Button';
import { HeartIcon } from '../ui/icons';

export function LikeButton({ id, count }: { id: string; count: number }) {
  const { data: account } = useAccount();
  const { data: liked } = useLiked([id]);
  const toggle = useToggleLike();
  const signIn = useSignIn();
  const location = useLocation();
  const [hint, setHint] = useState<string | null>(null);
  const isLiked = liked?.has(id) ?? false;

  const onClick = () => {
    if (!account) {
      setHint('Inicia sesión con GitHub para dar «me gusta».');
      return;
    }
    toggle.mutate(id, { onError: (e) => setHint(errorMessage(e)) });
  };

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" onClick={onClick} disabled={toggle.isPending} aria-pressed={isLiked}
        icon={<HeartIcon filled={isLiked} className={`size-4 ${isLiked ? 'text-danger' : ''}`} />}>
        {compactNumber(count)} me gusta
      </Button>
      {hint && (
        <p className="text-xs text-muted">
          {hint}{' '}
          {!account && (
            <button type="button" className="text-primary underline" onClick={() => signIn.mutate(location.pathname)}>
              Entrar
            </button>
          )}
        </p>
      )}
    </div>
  );
}
