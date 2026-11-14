import type { AppNotification } from '@domain/notification/Notification';
import { Link } from 'react-router';
import { RequireAccount } from '../components/auth/RequireAccount';
import { Alert, ErrorAlert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { BellIcon } from '../components/ui/icons';
import { PageSpinner } from '../components/ui/Spinner';
import { useT } from '../i18n/I18nContext';
import { errorMessage } from '../lib/errorMessage';
import { notificationLink, notificationText } from '../lib/notifications';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useFormat } from '../lib/useFormat';
import { useMarkAllNotificationsRead, useMarkNotificationsRead, useNotifications } from '../queries/notifications';

function NotificationItem({ item, onOpen }: { item: AppNotification; onOpen: (n: AppNotification) => void }) {
  const t = useT();
  const { timeAgo } = useFormat();
  const unread = item.readAt === null;
  return (
    <li>
      <Link to={notificationLink(item)} onClick={() => onOpen(item)}
        className={`card flex items-start gap-3 p-4 transition-colors hover:border-primary/60 ${unread ? 'border-primary/50 bg-primary/5' : ''}`}>
        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? 'bg-primary' : 'bg-transparent'}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm break-words">{notificationText(item, t)}</span>
          <span className="mt-1 block text-xs text-muted">
            {timeAgo(item.createdAt)}{unread && <span className="sr-only"> · {t('sin leer')}</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}

function NotificationList() {
  const t = useT();
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();
  if (list.isPending) return <PageSpinner />;
  if (list.error) return <ErrorAlert error={list.error} onRetry={() => void list.refetch()} />;
  const unread = list.data.filter((n) => n.readAt === null).length;
  if (list.data.length === 0) {
    return (
      <EmptyState title={t('No tienes avisos')}>
        {t('Aquí verás cuándo alguien comenta en tus perfiles, cuándo se revisan tus mandos y si la moderación oculta algo tuyo.')}
      </EmptyState>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted" aria-live="polite">
          {unread > 0 ? t('{n} sin leer', { n: unread }) : t('Todo leído')}
        </p>
        {unread > 0 && (
          <Button size="sm" variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}>
            {t('Marcar todo como leído')}
          </Button>
        )}
      </div>
      {(markAll.error ?? markRead.error) && <Alert tone="error">{errorMessage(markAll.error ?? markRead.error)}</Alert>}
      <ul className="space-y-2">
        {list.data.map((n) => (
          <NotificationItem key={n.id} item={n} onOpen={(item) => item.readAt === null && markRead.mutate([item.id])} />
        ))}
      </ul>
      <p className="text-xs text-muted">{t('Los avisos se borran solos a los 90 días.')}</p>
    </div>
  );
}

export default function NotificationsPage() {
  const t = useT();
  useDocumentTitle(t('Avisos'));
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><BellIcon className="size-7" />{t('Avisos')}</h1>
      <RequireAccount reason={t('Inicia sesión para ver tus avisos.')}>
        {() => <NotificationList />}
      </RequireAccount>
    </div>
  );
}
