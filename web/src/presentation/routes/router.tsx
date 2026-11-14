import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { Layout } from '../components/layout/Layout';
import { I18nProvider } from '../i18n/I18nProvider';
import HomePage from '../pages/HomePage';
import NotFoundPage from '../pages/NotFoundPage';
import RouteErrorPage from '../pages/RouteErrorPage';

// Cada pagina se descarga solo cuando se visita (la portada carga rapido).
const GamesPage = lazy(() => import('../pages/GamesPage'));
const GamePage = lazy(() => import('../pages/GamePage'));
const ProfilePage = lazy(() => import('../pages/ProfilePage'));
const EditProfilePage = lazy(() => import('../pages/EditProfilePage'));
const AuthorPage = lazy(() => import('../pages/AuthorPage'));
const UploadPage = lazy(() => import('../pages/UploadPage'));
const AccountPage = lazy(() => import('../pages/AccountPage'));
const AdminPage = lazy(() => import('../pages/AdminPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));
const RulesPage = lazy(() => import('../pages/RulesPage'));

export function createRouter(basename: string) {
  return createBrowserRouter(
    [
      {
        element: <Layout />,
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'juegos', element: <GamesPage /> },
          { path: 'juegos/:packageName', element: <GamePage /> },
          { path: 'perfil/:id', element: <ProfilePage /> },
          { path: 'perfil/:id/editar', element: <EditProfilePage /> },
          { path: 'autor/:username', element: <AuthorPage /> },
          { path: 'subir', element: <UploadPage /> },
          { path: 'cuenta', element: <AccountPage /> },
          // La moderacion se queda en espanol (la usa solo el equipo).
          { path: 'admin', element: <I18nProvider force="es"><AdminPage /></I18nProvider> },
          { path: 'privacidad', element: <PrivacyPage /> },
          { path: 'normas', element: <RulesPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
    { basename },
  );
}
