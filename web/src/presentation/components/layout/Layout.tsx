import { Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { AuthReturn } from '../auth/AuthReturn';
import { PageSpinner } from '../ui/Spinner';
import { Footer } from './Footer';
import { Header } from './Header';

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-surface focus:p-2">
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Suspense fallback={<PageSpinner />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <AuthReturn />
      <ScrollRestoration />
    </div>
  );
}
