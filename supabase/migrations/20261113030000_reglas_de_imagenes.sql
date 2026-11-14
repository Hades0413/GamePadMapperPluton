-- =====================================================================================
--  Reglas de games.icon_url / games.background_url escritas directamente en la tabla.
--
--  Las reglas (CHECK) se evaluan con el rol que escribe: la funcion importar-juego usa el rol de
--  servicio, que no tiene acceso al esquema "private" (a proposito). Con la expresion en linea la
--  regla es la misma y no depende de permisos sobre funciones.
-- =====================================================================================

alter table public.games drop constraint if exists games_icon_url_check;
alter table public.games drop constraint if exists games_background_url_check;

alter table public.games add constraint games_icon_url_check check (
    icon_url is null or icon_url ~
    '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/juegos/(iconos|fondos)/[A-Za-z0-9._-]{1,160}(\?v=[0-9]{1,15})?$'
);
alter table public.games add constraint games_background_url_check check (
    background_url is null or background_url ~
    '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/juegos/(iconos|fondos)/[A-Za-z0-9._-]{1,160}(\?v=[0-9]{1,15})?$'
);
