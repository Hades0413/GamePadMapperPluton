import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router/dom';
import type { Services } from './di/Services';
import { ServicesProvider } from './di/ServicesContext';
import { I18nProvider } from './i18n/I18nProvider';
import { getLang } from './i18n/lang';
import { translate } from './i18n/translate';
import { createQueryClient } from './queries/queryClient';
import { createRouter } from './routes/router';

export function App({ services, basename }: { services: Services; basename: string }) {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(() => createRouter(basename));
  return (
    <I18nProvider>
      <ServicesProvider services={services}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ServicesProvider>
    </I18nProvider>
  );
}

/** Pantalla si falta la configuracion (por ejemplo, sin .env.local en desarrollo). */
export function ConfigError({ message, title = translate(getLang(), 'La web no está configurada') }: { message: string; title?: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-muted">{message}</p>
    </main>
  );
}
