import { useT } from '../../i18n/I18nContext';
import { Button } from './Button';

export function LoadMore({
  hasMore, loading, onClick,
}: { hasMore: boolean; loading: boolean; onClick: () => void }) {
  const t = useT();
  if (!hasMore) return null;
  return (
    <div className="flex justify-center pt-6">
      <Button variant="secondary" loading={loading} onClick={onClick}>{t('Cargar más')}</Button>
    </div>
  );
}
