-- =====================================================================================
--  Gamepad Mapper Pluton - comunidad de perfiles (Supabase / PostgreSQL)
--
--  Modelo de seguridad:
--   * Lectura publica (anon) SOLO de lo publicado y SOLO de columnas seguras.
--   * NINGUN rol del API (anon / authenticated) puede escribir directamente en las tablas:
--     toda escritura pasa por funciones RPC (security definer) que validan, limitan la
--     frecuencia (rate limit) y comprueban el dueno. Asi no hay atajos por la API REST.
--   * Las funciones internas viven en el esquema "private", que no expone el API.
--   * El inicio de sesion (GitHub) solo hace falta para subir, dar "me gusta" o reportar.
--     El nombre y el avatar salen de la identidad de GitHub (auth.identities), que el usuario no
--     puede editar; los bloqueos se guardan por id de GitHub.
--   * No se admiten perfiles para apps del sistema, tiendas, ajustes ni herramientas de root.
--
--  Ejecutar una sola vez en un proyecto nuevo: Supabase > SQL Editor > pegar este archivo > Run
--  (o "supabase db push" con la CLI). Los cambios posteriores van en migraciones nuevas.
-- =====================================================================================

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- -------------------------------------------------------------------------------------
--  Tablas
-- -------------------------------------------------------------------------------------

-- Autor = usuario de GitHub que ha iniciado sesion (se crea solo, ver trigger mas abajo).
create table public.authors (
    id          uuid primary key references auth.users (id) on delete cascade,
    username    text not null check (username ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$'),
    avatar_url  text check (avatar_url is null or avatar_url ~ '^https://avatars\.githubusercontent\.com/[A-Za-z0-9/_?=&.-]+$'),
    is_admin    boolean not null default false,
    is_banned   boolean not null default false,
    github_id   text,
    -- Nombre en minusculas: unico (GitHub no distingue mayusculas) y clave de /autor/:nombre.
    username_key text generated always as (lower(username)) stored,
    created_at  timestamptz not null default now()
);
create unique index authors_username_key_idx on public.authors (username_key);
create unique index authors_github_id_idx on public.authors (github_id) where github_id is not null;

-- Juego, identificado por su paquete de Android (com.supercell.brawlstars).
create table public.games (
    package          text primary key
                     check (char_length(package) <= 150 and package ~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$'),
    name             text not null check (char_length(name) between 2 and 60 and name !~ '[[:cntrl:]]'),
    icon_url         text check (icon_url is null or (char_length(icon_url) <= 500 and icon_url ~ '^https://[^[:space:]"''<>]+$')),
    profile_count    integer not null default 0 check (profile_count >= 0),
    is_hidden        boolean not null default false,
    created_by       uuid references public.authors (id) on delete set null,
    created_at       timestamptz not null default now(),
    last_profile_at  timestamptz
);
create index games_listing_idx on public.games (profile_count desc, name) where not is_hidden;
create index games_name_trgm_idx on public.games using gin (name extensions.gin_trgm_ops);

-- Perfil de un juego (el mismo texto .conf que usa la app).
create table public.game_profiles (
    id             uuid primary key default gen_random_uuid(),
    package        text not null references public.games (package) on update cascade on delete cascade,
    author_id      uuid not null references public.authors (id) on delete cascade,
    title          text not null check (char_length(title) between 3 and 60 and title !~ '[[:cntrl:]]'),
    description    text not null default '' check (char_length(description) <= 500
                   and description !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
    conf           text not null check (octet_length(conf) <= 16384 and conf !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
    screen_w       integer not null check (screen_w between 100 and 20000),
    screen_h       integer not null check (screen_h between 100 and 20000),
    binding_count  integer not null check (binding_count between 1 and 150),
    like_count     integer not null default 0 check (like_count >= 0),
    report_count   integer not null default 0 check (report_count >= 0),
    status         text not null default 'published' check (status in ('published', 'hidden')),
    -- Copia de games.is_hidden (la mantiene un trigger) para que la politica de lectura no tenga
    -- que consultar games, cuyas columnas internas no ven los visitantes.
    game_hidden    boolean not null default false,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);
create index game_profiles_popular_idx on public.game_profiles (package, like_count desc, created_at desc)
    where status = 'published';
create index game_profiles_recent_idx on public.game_profiles (package, created_at desc)
    where status = 'published';
create index game_profiles_author_idx on public.game_profiles (author_id, created_at desc);
create index game_profiles_reported_idx on public.game_profiles (report_count desc) where report_count > 0;

create table public.profile_likes (
    profile_id  uuid not null references public.game_profiles (id) on delete cascade,
    user_id     uuid not null references public.authors (id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (profile_id, user_id)
);
create index profile_likes_user_idx on public.profile_likes (user_id);

create table public.profile_reports (
    profile_id  uuid not null references public.game_profiles (id) on delete cascade,
    user_id     uuid not null references public.authors (id) on delete cascade,
    reason      text not null check (reason in ('spam', 'broken', 'offensive', 'copyright', 'other')),
    details     text not null default '' check (char_length(details) <= 300 and details !~ '[[:cntrl:]]'),
    created_at  timestamptz not null default now(),
    primary key (profile_id, user_id)
);

-- Registro para limitar la frecuencia de acciones (no lo ve nadie por el API).
create table private.action_log (
    user_id     uuid not null,
    action      text not null,
    created_at  timestamptz not null default now()
);
create index action_log_idx on private.action_log (user_id, action, created_at desc);

-- Cuentas de GitHub bloqueadas (el bloqueo sigue aunque se borre la cuenta y se vuelva a entrar).
create table private.banned_github (
    github_id  text primary key,
    banned_at  timestamptz not null default now()
);

-- -------------------------------------------------------------------------------------
--  Permisos: se quita todo y se concede solo lectura de columnas seguras
-- -------------------------------------------------------------------------------------
revoke all on public.authors, public.games, public.game_profiles, public.profile_likes, public.profile_reports
    from public, anon, authenticated;

grant select (id, username, username_key, avatar_url, created_at) on public.authors to anon, authenticated;
grant select (package, name, icon_url, profile_count, created_at, last_profile_at) on public.games to anon, authenticated;
grant select (id, package, author_id, title, description, conf, screen_w, screen_h, binding_count, like_count,
              status, created_at, updated_at) on public.game_profiles to anon, authenticated;
grant select (profile_id, user_id, created_at) on public.profile_likes to authenticated;

alter table public.authors enable row level security;
alter table public.games enable row level security;
alter table public.game_profiles enable row level security;
alter table public.profile_likes enable row level security;
alter table public.profile_reports enable row level security;
alter table private.action_log enable row level security;
alter table private.banned_github enable row level security;

create policy "autores visibles" on public.authors for select to anon, authenticated using (not is_banned);
create policy "juegos visibles" on public.games for select to anon, authenticated using (not is_hidden);
create policy "perfiles publicados o propios" on public.game_profiles for select to anon, authenticated
    using (author_id = (select auth.uid()) or (status = 'published' and not game_hidden));
create policy "mis me gusta" on public.profile_likes for select to authenticated
    using (user_id = (select auth.uid()));
-- profile_reports, action_log y banned_github: sin politicas => nadie las lee por el API.

-- -------------------------------------------------------------------------------------
--  Funciones internas (esquema private)
-- -------------------------------------------------------------------------------------

-- Lanza un error que la web muestra tal cual: 'CODIGO|mensaje para el usuario'.
create or replace function private.fail(p_code text, p_message text)
returns void language plpgsql volatile set search_path = '' as $$
begin
    raise exception using errcode = 'P0001', message = p_code || '|' || p_message;
end $$;

-- Autor de la sesion actual; falla si no hay sesion o esta bloqueado.
create or replace function private.require_author()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
    v_uid uuid := auth.uid();
    v_banned boolean;
    v_github text;
begin
    if v_uid is null then
        perform private.fail('AUTH_REQUIRED', 'Inicia sesión con GitHub para hacer esto.');
    end if;
    select is_banned, github_id into v_banned, v_github from public.authors where id = v_uid;
    if not found then
        perform private.fail('AUTH_REQUIRED', 'Tu cuenta no está lista. Cierra sesión y vuelve a entrar.');
    end if;
    if v_banned or exists (select 1 from private.banned_github b where b.github_id = v_github) then
        perform private.fail('BANNED', 'Tu cuenta está bloqueada por incumplir las normas.');
    end if;
    return v_uid;
end $$;

create or replace function private.require_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    if not exists (select 1 from public.authors where id = v_uid and is_admin) then
        perform private.fail('FORBIDDEN', 'Solo para administradores.');
    end if;
    return v_uid;
end $$;

-- Limite de frecuencia: como mucho p_max acciones p_action en la ventana p_window.
create or replace function private.rate_limit(p_uid uuid, p_action text, p_max integer, p_window interval)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_count integer;
begin
    -- Serializa las peticiones simultaneas del mismo usuario y accion.
    perform pg_advisory_xact_lock(hashtextextended(p_uid::text || ':' || p_action, 0));
    delete from private.action_log where user_id = p_uid and action = p_action and created_at < now() - p_window;
    select count(*) into v_count from private.action_log where user_id = p_uid and action = p_action;
    if v_count >= p_max then
        perform private.fail('RATE_LIMIT', 'Has hecho esto demasiadas veces. Inténtalo más tarde.');
    end if;
    insert into private.action_log (user_id, action) values (p_uid, p_action);
end $$;

-- Texto de una sola linea: recorta espacios y comprueba longitud y caracteres.
create or replace function private.clean_line(p_value text, p_min integer, p_max integer, p_field text)
returns text language plpgsql immutable set search_path = '' as $$
declare
    v text := btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'));
begin
    if char_length(v) < p_min or char_length(v) > p_max then
        perform private.fail('INVALID_' || upper(p_field),
            format('El campo «%s» debe tener entre %s y %s caracteres.', p_field, p_min, p_max));
    end if;
    if v ~ '[<>]' then
        perform private.fail('INVALID_' || upper(p_field), format('El campo «%s» no puede contener < ni >.', p_field));
    end if;
    return v;
end $$;

create or replace function private.clean_text(p_value text, p_max integer, p_field text)
returns text language plpgsql immutable set search_path = '' as $$
declare
    v text := btrim(replace(coalesce(p_value, ''), E'\r\n', E'\n'));
begin
    v := regexp_replace(v, '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g');
    v := regexp_replace(v, E'\n{3,}', E'\n\n', 'g');
    if char_length(v) > p_max then
        perform private.fail('INVALID_' || upper(p_field),
            format('El campo «%s» admite como mucho %s caracteres.', p_field, p_max));
    end if;
    if v ~ '[<>]' then
        perform private.fail('INVALID_' || upper(p_field), format('El campo «%s» no puede contener < ni >.', p_field));
    end if;
    return v;
end $$;

-- Numero de un texto, o null si no es un numero valido (evita errores de conversion).
create or replace function private.to_num(p_value text)
returns numeric language sql immutable set search_path = '' as $$
    select case when p_value ~ '^-?[0-9]{1,6}(\.[0-9]{1,4})?$' then p_value::numeric end;
$$;

-- Apps del sistema, tiendas, ajustes, permisos y herramientas de root: un perfil para ellas
-- convertiria el mando en toques elegidos por otra persona.
-- Misma lista en web/src/domain/game/Game.ts y en la app (Library.isSensitivePackage).
create or replace function private.is_sensitive_package(p_package text)
returns boolean language sql immutable set search_path = '' as $$
    select lower(p_package) = 'android'
        or lower(p_package) ~ '^(android|com\.android|com\.google\.android|com\.miui|com\.xiaomi|com\.samsung\.android|com\.sec\.android|com\.oplus|com\.coloros|com\.huawei|com\.hihonor|com\.oneplus|com\.motorola|com\.lineageos|org\.lineageos|com\.topjohnwu|io\.github\.huskydg|me\.weishu|moe\.shizuku|rikka\.shizuku|com\.gamepadmapper)(\.|$)';
$$;

-- Valida un perfil .conf (mismas reglas que web/src/domain/profile/validateConf.ts).
-- Devuelve el texto normalizado y datos para el listado.
create or replace function private.validate_conf(
    p_conf text, p_package text,
    out conf text, out screen_w integer, out screen_h integer, out binding_count integer)
language plpgsql immutable set search_path = '' as $$
declare
    v_lines text[];
    v_line text;
    v_n integer := 0;
    v_key text;
    v_val text;
    v_lkey text;
    v_args text[];
    v_type text;
    v_nums integer;
    v_check integer;
    v_steps text[];
    v_step text;
    v_pkg text;
    v_keys text[] := '{}';
    v_max_x numeric := 0;
    v_max_y numeric := 0;
    v_num text := '^-?[0-9]{1,6}(\.[0-9]{1,4})?$';
    v_bad text;
begin
    conf := btrim(replace(coalesce(p_conf, ''), E'\r\n', E'\n'));
    if conf = '' then
        perform private.fail('INVALID_CONF', 'El perfil está vacío.');
    end if;
    if octet_length(conf) > 16384 then
        perform private.fail('INVALID_CONF', 'El perfil es demasiado grande (máximo 16 KB).');
    end if;
    if conf ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
        perform private.fail('INVALID_CONF', 'El perfil tiene caracteres no permitidos.');
    end if;
    v_lines := string_to_array(conf, E'\n');
    if array_length(v_lines, 1) > 400 then
        perform private.fail('INVALID_CONF', 'El perfil tiene demasiadas líneas (máximo 400).');
    end if;

    foreach v_line in array v_lines loop
        v_n := v_n + 1;
        v_line := btrim(split_part(v_line, '#', 1));
        continue when v_line = '';
        if position('=' in v_line) = 0 then
            perform private.fail('INVALID_CONF', format('Línea %s: falta «=».', v_n));
        end if;
        v_key := btrim(split_part(v_line, '=', 1));
        v_val := btrim(substr(v_line, position('=' in v_line) + 1));
        v_lkey := lower(v_key);
        v_bad := null;

        case v_lkey
            when 'package' then
                v_pkg := v_val;
            when 'name' then
                if char_length(v_val) > 60 then v_bad := 'nombre demasiado largo'; end if;
            when 'screen' then
                if lower(v_val) !~ '^[0-9]{3,5}\s*x\s*[0-9]{3,5}$' then
                    v_bad := 'usa el formato ANCHOxALTO';
                else
                    screen_w := split_part(regexp_replace(lower(v_val), '\s', '', 'g'), 'x', 1)::integer;
                    screen_h := split_part(regexp_replace(lower(v_val), '\s', '', 'g'), 'x', 2)::integer;
                end if;
            when 'deadzone', 'ls_deadzone', 'rs_deadzone' then
                if coalesce(private.to_num(v_val) not between 0 and 0.95, true) then v_bad := 'debe estar entre 0 y 0.95'; end if;
            when 'ls_curve', 'rs_curve' then
                if coalesce(private.to_num(v_val) not between 0.1 and 5, true) then v_bad := 'debe estar entre 0.1 y 5'; end if;
            when 'look_y' then
                if coalesce(private.to_num(v_val) not between 0.1 and 10, true) then v_bad := 'debe estar entre 0.1 y 10'; end if;
            when 'look_invert' then
                if v_val not in ('0', '1') then v_bad := 'debe ser 0 o 1'; end if;
            when 'ls_axes', 'rs_axes' then
                if replace(v_val, ' ', '') !~ '^[0-9A-Fa-f]{1,2},[0-9A-Fa-f]{1,2}$' then v_bad := 'usa el formato 0,1'; end if;
            else
                v_key := upper(replace(v_key, ' ', ''));
                if v_key !~ '^([A-Z0-9_]{1,20}\+)?[A-Z0-9_]{1,20}[+-]?$' then
                    perform private.fail('INVALID_CONF', format('Línea %s: «%s» no es un botón válido.', v_n, v_key));
                end if;
                if v_key = any (v_keys) then
                    perform private.fail('INVALID_CONF', format('Línea %s: el botón %s está repetido.', v_n, v_key));
                end if;
                v_keys := v_keys || v_key;
                v_args := regexp_split_to_array(v_val, '\s+');
                v_type := lower(v_args[1]);
                v_nums := coalesce(array_length(v_args, 1), 1) - 1;

                if v_type = 'macro' then
                    v_steps := string_to_array(btrim(substr(v_val, 6)), ';');
                    if coalesce(array_length(v_steps, 1), 0) not between 1 and 16 then
                        v_bad := 'una macro tiene de 1 a 16 pasos';
                    else
                        foreach v_step in array v_steps loop
                            v_args := regexp_split_to_array(btrim(v_step), '\s+');
                            if array_length(v_args, 1) not between 2 and 4
                               or exists (select 1 from unnest(v_args) a where a !~ v_num) then
                                v_bad := 'cada paso es «x y [espera] [duración]»';
                                exit;
                            end if;
                            v_max_x := greatest(v_max_x, v_args[1]::numeric);
                            v_max_y := greatest(v_max_y, v_args[2]::numeric);
                            if v_args[1]::numeric < 0 or v_args[2]::numeric < 0 then v_bad := 'coordenadas negativas'; exit; end if;
                        end loop;
                    end if;
                else
                    -- Valores numericos a comprobar ("dpad" final de un stick no cuenta).
                    v_check := case when v_type = 'stick' and v_nums = 4 then 3 else least(v_nums, 5) end;
                    if (v_type in ('tap', 'toggle', 'quick') and v_nums <> 2)
                       or (v_type = 'burst' and v_nums not between 2 and 4)
                       or (v_type = 'turbo' and v_nums not between 2 and 3)
                       or (v_type = 'swipe' and v_nums not between 4 and 5)
                       or (v_type = 'look' and v_nums <> 3)
                       or (v_type = 'stick' and not (v_nums = 3 or (v_nums = 4 and lower(v_args[5]) = 'dpad'))) then
                        v_bad := 'número de valores incorrecto';
                    elsif v_type not in ('tap', 'toggle', 'quick', 'burst', 'turbo', 'swipe', 'look', 'stick') then
                        v_bad := format('tipo «%s» desconocido', v_type);
                    elsif exists (select 1 from unnest(v_args[2:v_check + 1]) a where a !~ v_num) then
                        v_bad := 'los valores deben ser números';
                    elsif v_args[2]::numeric < 0 or v_args[3]::numeric < 0 then
                        v_bad := 'coordenadas negativas';
                    else
                        v_max_x := greatest(v_max_x, v_args[2]::numeric);
                        v_max_y := greatest(v_max_y, v_args[3]::numeric);
                        if v_type = 'swipe' then
                            if v_args[4]::numeric < 0 or v_args[5]::numeric < 0 then v_bad := 'coordenadas negativas'; end if;
                            v_max_x := greatest(v_max_x, v_args[4]::numeric);
                            v_max_y := greatest(v_max_y, v_args[5]::numeric);
                        end if;
                    end if;
                end if;
        end case;

        if v_bad is not null then
            perform private.fail('INVALID_CONF', format('Línea %s (%s): %s.', v_n, v_key, v_bad));
        end if;
    end loop;

    if v_pkg is null then
        perform private.fail('INVALID_CONF', 'Falta la línea «package = ...».');
    end if;
    if v_pkg <> p_package then
        perform private.fail('INVALID_CONF', format('El perfil es del juego %s, no de %s.', v_pkg, p_package));
    end if;
    if screen_w is null then
        perform private.fail('INVALID_CONF', 'Falta la línea «screen = ANCHOxALTO».');
    end if;
    binding_count := coalesce(array_length(v_keys, 1), 0);
    if binding_count = 0 then
        perform private.fail('INVALID_CONF', 'El perfil no tiene ningún botón asignado.');
    end if;
    if binding_count > 150 then
        perform private.fail('INVALID_CONF', 'El perfil tiene demasiados botones (máximo 150).');
    end if;
    if v_max_x > screen_w * 1.05 or v_max_y > screen_h * 1.05 then
        perform private.fail('INVALID_CONF', 'Hay botones fuera de la pantalla indicada en «screen».');
    end if;
end $$;

-- -------------------------------------------------------------------------------------
--  Triggers
-- -------------------------------------------------------------------------------------

-- Crea / actualiza el autor desde la identidad de GitHub (GoTrue la actualiza en cada inicio de sesion).
create or replace function private.sync_github_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_data jsonb := coalesce(new.identity_data, '{}'::jsonb);
    v_name text := coalesce(v_data ->> 'user_name', v_data ->> 'preferred_username', '');
    v_avatar text := v_data ->> 'avatar_url';
    v_banned boolean := exists (select 1 from private.banned_github b where b.github_id = new.provider_id);
begin
    if new.provider <> 'github' then
        return new;
    end if;
    if v_name !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$' then
        v_name := 'usuario-' || left(replace(new.user_id::text, '-', ''), 8);
    end if;
    if v_avatar is null or v_avatar !~ '^https://avatars\.githubusercontent\.com/[A-Za-z0-9/_?=&.-]+$' then
        v_avatar := null;
    end if;
    -- Si otro autor tenia ese nombre (renombro su cuenta de GitHub), se le pone uno provisional
    -- hasta su proximo inicio de sesion.
    update public.authors
       set username = 'usuario-' || left(replace(id::text, '-', ''), 8)
     where username_key = lower(v_name) and id <> new.user_id;
    insert into public.authors (id, username, avatar_url, github_id, is_banned)
    values (new.user_id, v_name, v_avatar, new.provider_id, v_banned)
    on conflict (id) do update
        set username = excluded.username,
            avatar_url = excluded.avatar_url,
            github_id = excluded.github_id,
            is_banned = public.authors.is_banned or excluded.is_banned;
    return new;
end $$;

create trigger on_github_identity_saved
    after insert or update of identity_data on auth.identities
    for each row execute function private.sync_github_identity();

-- Contador de perfiles publicados por juego.
create or replace function private.count_game_profiles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op in ('UPDATE', 'DELETE') and old.status = 'published' then
        update public.games set profile_count = greatest(profile_count - 1, 0) where package = old.package;
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.status = 'published' then
        update public.games set profile_count = profile_count + 1, last_profile_at = now() where package = new.package;
    end if;
    return null;
end $$;

create trigger game_profiles_count
    after insert or delete or update of status, package on public.game_profiles
    for each row execute function private.count_game_profiles();

-- Ocultar un juego oculta sus perfiles (y mostrarlo los vuelve a mostrar).
create or replace function private.sync_game_hidden()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    update public.game_profiles set game_hidden = new.is_hidden where package = new.package;
    return null;
end $$;

create trigger games_hidden_sync
    after update of is_hidden on public.games
    for each row when (old.is_hidden is distinct from new.is_hidden)
    execute function private.sync_game_hidden();

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
    new.updated_at := now();
    return new;
end $$;

create trigger game_profiles_touch
    before update of title, description, conf on public.game_profiles
    for each row execute function private.touch_updated_at();

create or replace function private.count_likes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        update public.game_profiles set like_count = like_count + 1 where id = new.profile_id;
    else
        update public.game_profiles set like_count = greatest(like_count - 1, 0) where id = old.profile_id;
    end if;
    return null;
end $$;

create trigger profile_likes_count
    after insert or delete on public.profile_likes
    for each row execute function private.count_likes();

-- Cada reporte suma; con 3 o mas el perfil se oculta hasta que lo revise un admin.
create or replace function private.count_reports()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_trusted integer;
begin
    select count(*) into v_trusted
      from public.profile_reports r
      join public.authors a on a.id = r.user_id
     where r.profile_id = new.profile_id and a.created_at < now() - interval '3 days';
    update public.game_profiles
       set report_count = report_count + 1,
           status = case when v_trusted >= 3 then 'hidden' else status end
     where id = new.profile_id;
    return null;
end $$;

create trigger profile_reports_count
    after insert on public.profile_reports
    for each row execute function private.count_reports();

-- -------------------------------------------------------------------------------------
--  API publica (RPC). Solo usuarios con sesion; anon no puede ejecutarlas.
-- -------------------------------------------------------------------------------------

create or replace function public.my_account()
returns table (id uuid, username text, avatar_url text, is_admin boolean)
language sql stable security definer set search_path = '' as $$
    select a.id, a.username, a.avatar_url, a.is_admin
      from public.authors a
     where a.id = auth.uid() and not a.is_banned;
$$;

create or replace function public.publish_profile(
    p_package text, p_game_name text, p_title text, p_description text, p_conf text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_package text := btrim(coalesce(p_package, ''));
    v_title text := private.clean_line(p_title, 3, 60, 'título');
    v_description text := private.clean_text(p_description, 500, 'descripción');
    v_conf record;
    v_hidden boolean;
    v_id uuid;
begin
    if char_length(v_package) > 150 or v_package !~ '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$' then
        perform private.fail('INVALID_PACKAGE', 'El paquete del juego no es válido (ejemplo: com.empresa.juego).');
    end if;
    if private.is_sensitive_package(v_package) then
        perform private.fail('INVALID_PACKAGE', 'No se admiten perfiles para apps del sistema, tiendas, ajustes ni herramientas de root.');
    end if;
    select * into v_conf from private.validate_conf(p_conf, v_package);
    perform private.rate_limit(v_uid, 'publish', 10, interval '1 day');
    if (select count(*) from public.game_profiles where author_id = v_uid) >= 100 then
        perform private.fail('LIMIT', 'Has llegado al máximo de 100 perfiles. Borra alguno para subir otro.');
    end if;

    select is_hidden into v_hidden from public.games where package = v_package;
    if not found then
        perform private.rate_limit(v_uid, 'new_game', 3, interval '1 day');
        insert into public.games (package, name, created_by)
        values (v_package, private.clean_line(p_game_name, 2, 60, 'juego'), v_uid);
    elsif v_hidden then
        perform private.fail('GAME_HIDDEN', 'Este juego no admite perfiles nuevos.');
    end if;

    insert into public.game_profiles (package, author_id, title, description, conf, screen_w, screen_h, binding_count)
    values (v_package, v_uid, v_title, v_description, v_conf.conf, v_conf.screen_w, v_conf.screen_h, v_conf.binding_count)
    returning id into v_id;
    return v_id;
end $$;

create or replace function public.update_profile(p_id uuid, p_title text, p_description text, p_conf text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_package text;
    v_conf record;
begin
    select package into v_package from public.game_profiles where id = p_id and author_id = v_uid;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe o no es tuyo.');
    end if;
    select * into v_conf from private.validate_conf(p_conf, v_package);
    perform private.rate_limit(v_uid, 'edit', 60, interval '1 day');
    update public.game_profiles
       set title = private.clean_line(p_title, 3, 60, 'título'),
           description = private.clean_text(p_description, 500, 'descripción'),
           conf = v_conf.conf, screen_w = v_conf.screen_w, screen_h = v_conf.screen_h,
           binding_count = v_conf.binding_count
     where id = p_id;
end $$;

create or replace function public.delete_profile(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    delete from public.game_profiles
     where id = p_id
       and (author_id = v_uid or exists (select 1 from public.authors where id = v_uid and is_admin));
    if not found then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe o no es tuyo.');
    end if;
end $$;

-- Devuelve true si queda con "me gusta" y false si se quito.
create or replace function public.toggle_like(p_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    if not exists (select 1 from public.game_profiles where id = p_id and status = 'published') then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe.');
    end if;
    perform private.rate_limit(v_uid, 'like', 300, interval '1 day');
    delete from public.profile_likes where profile_id = p_id and user_id = v_uid;
    if found then
        return false;
    end if;
    insert into public.profile_likes (profile_id, user_id) values (p_id, v_uid);
    return true;
end $$;

create or replace function public.report_profile(p_id uuid, p_reason text, p_details text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_owner uuid;
begin
    select author_id into v_owner from public.game_profiles where id = p_id and status = 'published';
    if not found then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe.');
    end if;
    if v_owner = v_uid then
        perform private.fail('OWN_PROFILE', 'No puedes reportar tu propio perfil.');
    end if;
    if p_reason is null or p_reason not in ('spam', 'broken', 'offensive', 'copyright', 'other') then
        perform private.fail('INVALID_REASON', 'Elige un motivo válido.');
    end if;
    perform private.rate_limit(v_uid, 'report', 30, interval '1 day');
    insert into public.profile_reports (profile_id, user_id, reason, details)
    values (p_id, v_uid, p_reason, private.clean_line(coalesce(p_details, ''), 0, 300, 'detalles'))
    on conflict (profile_id, user_id) do nothing;
end $$;

-- Borra la cuenta y TODO lo del usuario (perfiles, me gusta, reportes).
create or replace function public.delete_my_account()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := auth.uid();
begin
    if v_uid is null then
        perform private.fail('AUTH_REQUIRED', 'Inicia sesión para borrar tu cuenta.');
    end if;
    delete from auth.users where id = v_uid;
end $$;

-- ---------------------------------- Moderacion ---------------------------------------

create or replace function public.admin_reported_profiles()
returns table (id uuid, package text, title text, author_id uuid, username text, status text,
               report_count integer, reasons text[], created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return query
        select p.id, p.package, p.title, p.author_id, a.username, p.status, p.report_count,
               array(select r.reason || coalesce(nullif(': ' || r.details, ': '), '')
                       from public.profile_reports r where r.profile_id = p.id order by r.created_at),
               p.created_at
          from public.game_profiles p
          join public.authors a on a.id = p.author_id
         where p.report_count > 0 or p.status = 'hidden'
         order by p.report_count desc, p.created_at desc
         limit 200;
end $$;

create or replace function public.admin_set_profile_status(p_id uuid, p_status text, p_clear_reports boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    perform private.require_admin();
    if p_status not in ('published', 'hidden') then
        perform private.fail('INVALID_STATUS', 'Estado no válido.');
    end if;
    if p_clear_reports then
        delete from public.profile_reports where profile_id = p_id;
        update public.game_profiles set report_count = 0 where id = p_id;
    end if;
    update public.game_profiles set status = p_status where id = p_id;
end $$;

create or replace function public.admin_set_banned(p_user uuid, p_banned boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_github text;
begin
    if private.require_admin() = p_user then
        perform private.fail('FORBIDDEN', 'No puedes bloquearte a ti mismo.');
    end if;
    update public.authors set is_banned = p_banned where id = p_user and not is_admin
    returning github_id into v_github;
    if not found then
        perform private.fail('FORBIDDEN', 'Ese usuario no existe o es administrador.');
    end if;
    if p_banned then
        update public.game_profiles set status = 'hidden' where author_id = p_user;
        if v_github is not null then
            insert into private.banned_github (github_id) values (v_github) on conflict do nothing;
        end if;
    elsif v_github is not null then
        delete from private.banned_github where github_id = v_github;
    end if;
end $$;

create or replace function public.admin_update_game(p_package text, p_name text, p_icon_url text, p_hidden boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    perform private.require_admin();
    update public.games
       set name = private.clean_line(p_name, 2, 60, 'juego'),
           icon_url = nullif(btrim(coalesce(p_icon_url, '')), ''),
           is_hidden = p_hidden
     where package = p_package;
end $$;

-- Solo usuarios con sesion pueden llamar a la API de escritura.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
    public.my_account(),
    public.publish_profile(text, text, text, text, text),
    public.update_profile(uuid, text, text, text),
    public.delete_profile(uuid),
    public.toggle_like(uuid),
    public.report_profile(uuid, text, text),
    public.delete_my_account(),
    public.admin_reported_profiles(),
    public.admin_set_profile_status(uuid, text, boolean),
    public.admin_set_banned(uuid, boolean),
    public.admin_update_game(text, text, text, boolean)
to authenticated;

-- Funciones nuevas en el futuro: tampoco ejecutables por anon salvo que se conceda.
alter default privileges in schema public revoke execute on functions from public, anon;
-- Tablas y secuencias futuras en public: sin permisos para el API salvo que se concedan a mano.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
