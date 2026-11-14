import { ButtonLink } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useT } from '../i18n/I18nContext';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { paths } from '../routes/paths';

export default function NotFoundPage() {
  const t = useT();
  useDocumentTitle(t('No encontrado'));
  return (
    <EmptyState title={t('No encontramos esta página')} action={<ButtonLink to={paths.games}>{t('Ver juegos')}</ButtonLink>}>
      {t('Puede que el enlace esté mal o que se haya borrado.')}
    </EmptyState>
  );
}
