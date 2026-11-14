import { isRouteErrorResponse, useRouteError } from 'react-router';
import { useT } from '../i18n/I18nContext';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import NotFoundPage from './NotFoundPage';

/** Red de seguridad: un fallo en una pagina no deja la web en blanco. */
export default function RouteErrorPage() {
  const t = useT();
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  const chunkFailed = error instanceof Error && /dynamically imported module|Loading chunk/i.test(error.message);
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        title={chunkFailed ? t('Hay una versión nueva de la web') : t('Algo salió mal')}
        action={<Button onClick={() => window.location.reload()}>{t('Recargar')}</Button>}
      >
        {chunkFailed ? t('Recarga la página para usarla.') : t('Recarga la página. Si sigue pasando, avísanos en GitHub.')}
      </EmptyState>
    </div>
  );
}
