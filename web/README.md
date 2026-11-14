# Web — Gamepad Mapper Plutón

Web de la app y catálogo de perfiles de la comunidad: juegos, perfiles por juego, subir el tuyo
(con GitHub), «me gusta», reportes y moderación.

**Stack:** React 19 · TypeScript (estricto) · Vite + SWC · Tailwind CSS 4 · TanStack Query ·
React Router · Zod · Supabase. Pruebas con Vitest.

## Desarrollo

```bash
cd web
cp .env.example .env.local   # pon la URL y la clave publica de Supabase
pnpm install
pnpm dev                     # http://localhost:5173
pnpm check                   # tipos + lint + pruebas
pnpm build                   # dist/ listo para GitHub Pages
```

Desde la raíz del repo también: `make web-dev`, `make web-check`, `make web-build`.

## Arquitectura por capas

```
src/
  domain/          Reglas del negocio, sin dependencias (entidades, validador .conf, limites)
  application/     Casos de uso + puertos (interfaces de repositorios). Solo conoce domain
  infrastructure/  Implementaciones de los puertos con Supabase; valida respuestas con Zod
  presentation/    React: paginas, componentes, hooks de datos (TanStack Query)
  app/container.ts Raiz de composicion: el unico sitio que une las capas
```

- **Dependencias solo hacia dentro** (lo comprueba ESLint, `no-restricted-imports`): la interfaz
  no sabe que existe Supabase; cambiar de proveedor = nuevos repositorios en `infrastructure/` y
  cambiarlos en `app/container.ts`.
- **SOLID:** un caso de uso por acción (S), repositorios intercambiables por interfaz (O/L/D),
  puertos pequeños por agregado (I).
- **Validación doble:** el dominio valida en el navegador (respuesta inmediata) y la base de datos
  vuelve a validar todo (nunca se confía en el cliente). Mismas reglas en
  `domain/profile/conf/validateConf.ts` y `supabase/migrations`.

## Rendimiento y escalabilidad

- Web estática en la CDN de GitHub Pages: no hay servidor propio que se caiga.
- Cada página se descarga solo al visitarla; librerías en archivos aparte con caché larga.
- TanStack Query: caché de 1 min, sin recargar al cambiar de pestaña y sin repetir peticiones
  iguales; búsqueda con espera mientras se escribe.
- Paginación sin `COUNT` (se pide una fila de más), índices para cada listado y contadores
  (me gusta, perfiles por juego) guardados, no calculados en cada visita.
- Los listados no descargan el `.conf`; solo la página del perfil.

## Seguridad

- Content-Security-Policy en producción: solo scripts propios, conexiones solo a Supabase, sin iframes.
- React escapa todo el texto; no se usa `dangerouslySetInnerHTML`. Avatares solo de GitHub.
- Inicio de sesión con PKCE; la vuelta tras GitHub solo acepta rutas internas (sin redirecciones abiertas).
- La clave de Supabase de la web es la pública; los permisos reales están en la base de datos (`supabase/`).
- El perfil que llega desde la app viaja en el `#` del enlace: nunca se envía a ningún servidor.

## Publicación

`.github/workflows/web.yml` compila y publica en GitHub Pages en cada push a `main` que toque `web/`.
Necesita las variables del repositorio `SUPABASE_URL` y `SUPABASE_ANON_KEY` (ver `supabase/README.md`).
