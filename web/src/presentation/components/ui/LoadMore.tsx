import { Button } from './Button';

export function LoadMore({
  hasMore, loading, onClick,
}: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center pt-6">
      <Button variant="secondary" loading={loading} onClick={onClick}>Cargar más</Button>
    </div>
  );
}
