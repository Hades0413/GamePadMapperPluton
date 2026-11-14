/** Todas las rutas de la web en un solo sitio. */
export const paths = {
  home: '/',
  games: '/juegos',
  game: (packageName: string) => `/juegos/${encodeURIComponent(packageName)}`,
  profile: (id: string) => `/perfil/${id}`,
  editProfile: (id: string) => `/perfil/${id}/editar`,
  author: (username: string) => `/autor/${encodeURIComponent(username)}`,
  upload: (packageName?: string) => (packageName ? `/subir?juego=${encodeURIComponent(packageName)}` : '/subir'),
  editor: '/editor',
  editorFor: (profileId: string) => `/editor?perfil=${profileId}`,
  controllers: '/mandos',
  account: '/cuenta',
  admin: '/admin',
  privacy: '/privacidad',
  rules: '/normas',
} as const;
