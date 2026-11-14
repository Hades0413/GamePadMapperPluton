-- =====================================================================================
--  Copia en la nube de los perfiles de la app (opcional, con la cuenta de GitHub).
--
--  - La app de Android inicia sesion con GitHub mediante Supabase Auth (OAuth con PKCE en el
--    navegador, vuelve a la app con gpmapper://auth) y sube / restaura sus .conf con las funciones
--    de abajo. Los perfiles de la copia son PRIVADOS: solo los ve su dueno (no se publican).
--  - Pasos en el panel de Supabase (una sola vez, los hace el dueno del proyecto):
--      Authentication -> URL Configuration -> Redirect URLs: anadir  gpmapper://auth
--      (el proveedor GitHub ya esta activo para la web; no hace falta otra OAuth App).
--  - Seguridad / abusos:
--      * Nadie escribe en la tabla por el API: solo estas funciones (security definer).
--      * RLS: cada usuario solo puede leer sus filas (y las funciones solo tocan las suyas).
--      * Nombre de archivo como en la app (Library.SAFE_CONF_NAME): [A-Za-z0-9._-]{1,120}.conf.
--      * Perfil: maximo 16 KB, sin caracteres de control y con una linea "package = ...".
--      * Como mucho 200 archivos por cuenta (3,2 MB) y limites de uso diarios.
--      * Se borra con la cuenta (delete_my_account borra auth.users: on delete cascade).
-- =====================================================================================

create table public.profile_backups (
    user_id     uuid not null references auth.users (id) on delete cascade,
    file_name   text not null check (file_name ~ '^[A-Za-z0-9._-]{1,120}\.conf$'),
    conf        text not null check (octet_length(conf) between 1 and 16384
                                     and conf !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
    updated_at  timestamptz not null default now(),
    primary key (user_id, file_name)
);

alter table public.profile_backups enable row level security;
revoke all on public.profile_backups from public, anon, authenticated;
grant select on public.profile_backups to authenticated;
create policy "solo mis copias" on public.profile_backups for select to authenticated
    using (user_id = (select auth.uid()));

-- Valida un perfil de la copia y lo devuelve normalizado (saltos de linea \n).
create or replace function private.backup_conf(p_file_name text, p_conf text)
returns text language plpgsql immutable set search_path = '' as $$
declare
    v_conf text;
begin
    if p_file_name is null or p_file_name !~ '^[A-Za-z0-9._-]{1,120}\.conf$' then
        perform private.fail('INVALID_NAME', 'Nombre de archivo no válido (letras, números, . _ - y .conf).');
    end if;
    if p_conf is null or octet_length(p_conf) > 32768 then
        perform private.fail('INVALID_CONF', 'El perfil es demasiado grande (máximo 16 KB).');
    end if;
    v_conf := replace(p_conf, E'\r\n', E'\n');
    if octet_length(v_conf) > 16384 then
        perform private.fail('INVALID_CONF', 'El perfil es demasiado grande (máximo 16 KB).');
    end if;
    if btrim(v_conf) = '' then
        perform private.fail('INVALID_CONF', 'El perfil está vacío.');
    end if;
    if v_conf ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
        perform private.fail('INVALID_CONF', 'El perfil tiene caracteres no permitidos.');
    end if;
    if v_conf !~* '(^|\n)[ \t]*package[ \t]*=[ \t]*[a-z0-9_]+(\.[a-z0-9_]+)+[ \t\r]*(\n|#|$)' then
        perform private.fail('INVALID_CONF', 'No es un perfil válido (falta «package = ...»).');
    end if;
    return v_conf;
end $$;

-- Sube (o sustituye) un perfil. Devuelve la hora de la copia.
create or replace function public.backup_put(p_file_name text, p_conf text)
returns timestamptz language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_conf text := private.backup_conf(p_file_name, p_conf);
    v_at timestamptz := now();
begin
    -- Tambien serializa las subidas simultaneas del mismo usuario (el recuento de abajo es fiable).
    perform private.rate_limit(v_uid, 'backup_put', 1000, interval '1 day');
    if not exists (select 1 from public.profile_backups b where b.user_id = v_uid and b.file_name = p_file_name)
       and (select count(*) from public.profile_backups b where b.user_id = v_uid) >= 200 then
        perform private.fail('LIMIT', 'Tu copia ya tiene 200 perfiles. Borra alguno para subir más.');
    end if;
    insert into public.profile_backups (user_id, file_name, conf, updated_at)
    values (v_uid, p_file_name, v_conf, v_at)
    on conflict (user_id, file_name) do update set conf = excluded.conf, updated_at = excluded.updated_at;
    return v_at;
end $$;

-- Lista la copia (sin el contenido).
create or replace function public.backup_list()
returns table (file_name text, updated_at timestamptz, size integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    perform private.rate_limit(v_uid, 'backup_list', 500, interval '1 day');
    return query
        select b.file_name, b.updated_at, octet_length(b.conf)
          from public.profile_backups b
         where b.user_id = v_uid
         order by b.file_name
         limit 200;
end $$;

-- Un perfil de la copia.
create or replace function public.backup_get(p_file_name text)
returns table (file_name text, conf text, updated_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    perform private.rate_limit(v_uid, 'backup_get', 2000, interval '1 day');
    return query
        select b.file_name, b.conf, b.updated_at
          from public.profile_backups b
         where b.user_id = v_uid and b.file_name = p_file_name;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese perfil no está en tu copia.');
    end if;
end $$;

-- Borra un perfil de la copia (no el del telefono).
create or replace function public.backup_delete(p_file_name text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    perform private.rate_limit(v_uid, 'backup_delete', 1000, interval '1 day');
    delete from public.profile_backups b where b.user_id = v_uid and b.file_name = p_file_name;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese perfil no está en tu copia.');
    end if;
end $$;

-- Borra toda la copia. Devuelve cuantos perfiles se borraron.
create or replace function public.backup_delete_all()
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_n integer;
begin
    perform private.rate_limit(v_uid, 'backup_delete_all', 20, interval '1 day');
    delete from public.profile_backups b where b.user_id = v_uid;
    get diagnostics v_n = row_count;
    return v_n;
end $$;

revoke execute on function public.backup_put(text, text), public.backup_list(), public.backup_get(text),
    public.backup_delete(text), public.backup_delete_all() from public, anon;
grant execute on function public.backup_put(text, text), public.backup_list(), public.backup_get(text),
    public.backup_delete(text), public.backup_delete_all() to authenticated;
revoke execute on function private.backup_conf(text, text) from public, anon, authenticated;
