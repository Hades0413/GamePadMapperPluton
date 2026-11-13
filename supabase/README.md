# Supabase — comunidad de perfiles

Base de datos, inicio de sesión e imágenes de la comunidad (web y app). El esquema está en
`migrations/` (se aplican en orden) y la función de servidor en `functions/`.

| Archivo | Qué hace |
|---|---|
| `migrations/20261113000000_comunidad.sql` | Tablas, permisos, validación de perfiles, moderación |
| `migrations/20261113020000_imagenes_de_juegos.sql` | Icono y captura de cada juego en Storage (cubo `juegos`) |
| `migrations/20261113030000_reglas_de_imagenes.sql` | Reglas de las URL de imágenes sin depender de funciones internas (necesario para `importar-juego`) |
| `functions/importar-juego/` | Edge Function: nombre e icono del juego desde su ficha pública de Google Play (solo admins) |

## Puesta en marcha (una sola vez)

1. **Crear el proyecto** en [supabase.com](https://supabase.com), región **São Paulo** (o la más cercana).
2. **Esquema:** *SQL Editor* → pega cada archivo de `migrations/`, en orden → *Run*.
3. **Inicio de sesión con GitHub**
   - En GitHub: *Settings → Developer settings → OAuth Apps → New OAuth App*
     - Homepage URL: `https://hades0413.github.io/GamePadMapperPluton`
     - Authorization callback URL: la que muestra Supabase en
       *Authentication → Sign In / Providers → GitHub* (`https://<proyecto>.supabase.co/auth/v1/callback`)
   - Copia el *Client ID* y genera un *Client secret*; pégalos en Supabase (proveedor GitHub → *Enable*).
4. **Desactivar el resto de proveedores** (*Authentication → Sign In / Providers*): **Email** desactivado y
   *Allow new users to sign up* solo vía GitHub. Así nadie puede crear cuentas con correo y contraseña.
5. **Direcciones permitidas** (*Authentication → URL Configuration*):
   - Site URL: `https://hades0413.github.io/GamePadMapperPluton/`
   - Redirect URLs: `https://hades0413.github.io/GamePadMapperPluton/` y, para desarrollo,
     `http://localhost:5173/`
6. **Límite de filas por petición** (*Project Settings → Data API*): *Max rows* = `100`.
7. **Administradores:** se asignan solo desde el panel de Supabase del dueño del proyecto (columna
   `is_admin`). El API público no permite leer ni cambiar ese dato.
8. **Función `importar-juego`:** *Edge Functions → Deploy a new function → Via editor*, nombre
   `importar-juego`, pega `functions/importar-juego/index.ts` y *Deploy* (deja activada la
   verificación de JWT). Opcional: secreto `SITE_ORIGIN` con el origen de la web
   (por defecto `https://hades0413.github.io`). Con la CLI: `supabase functions deploy importar-juego`.
9. **Claves para la web** (*Project Settings → API Keys*): la URL del proyecto y la clave **publishable / anon**.
   Van en `web/.env.local` (desarrollo) y en GitHub → *Settings → Secrets and variables → Actions → Variables*
   como `SUPABASE_URL` y `SUPABASE_ANON_KEY` (publicación). La clave **secret / service_role no se usa nunca**.

## Seguridad (resumen)

| Capa | Qué protege |
|---|---|
| RLS + permisos por columna | Lectura pública solo de lo publicado y de columnas seguras (ni correos, ni reportes, ni roles). |
| Sin `INSERT/UPDATE/DELETE` para el API | Toda escritura pasa por funciones RPC que validan, comprueban el dueño y registran la acción. |
| Validación en la base de datos | Mismo formato `.conf` que la app (`private.validate_conf`), límites de tamaño, sin HTML (`<` `>`) ni caracteres de control. |
| Límites de uso | 10 perfiles/día y 100 en total por cuenta, 60 ediciones/día, 300 «me gusta»/día, 30 reportes/día. |
| Moderación | Con 3 reportes el perfil se oculta solo; los administradores publican, ocultan, borran y bloquean. |
| Esquema `private` | Funciones internas fuera del API. Todas las funciones con `search_path` vacío. |
| Inicio de sesión | Solo GitHub con PKCE. Nombre y avatar salen de la identidad de GitHub (no editable por el usuario). Borrar la cuenta elimina todos sus datos al instante. |
| Bloqueos | Por id de GitHub: borrar la cuenta y volver a entrar no los evita. Un admin no puede bloquear a otro. |
| Paquetes sensibles | No se admiten perfiles para apps del sistema, tiendas, ajustes, permisos ni root (misma lista en la web y la app). |
| Imágenes de juegos | Solo los admins suben iconos y capturas (Storage, máx. 1 MB, PNG/JPEG/WebP). La base de datos solo admite direcciones de ese Storage: ni la web ni la app cargan imágenes de otros sitios. |
| Reportes | Solo los de cuentas con 3+ días cuentan para ocultar automáticamente (crear cuentas nuevas no sirve). |

## Probar el esquema en local (opcional)

Con Docker se puede comprobar el SQL en un PostgreSQL desechable, simulando el esquema `auth`
(ver el historial del proyecto) o con la CLI oficial: `supabase start` y `supabase db reset`.

## Cambios futuros

Nunca edites una migración ya aplicada: crea otra en `migrations/` con fecha posterior. Si cambias las
reglas de validación del perfil, cámbialas también en `web/src/domain/profile/conf/validateConf.ts`.
