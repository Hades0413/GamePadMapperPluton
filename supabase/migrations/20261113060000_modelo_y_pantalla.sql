-- =====================================================================================
--  Modelo del telefono y proporcion de pantalla de cada perfil.
--
--  - device_model: opcional ("Redmi Note 9"); la app lo rellena al subir un perfil.
--  - screen_ratio: proporcion de la pantalla del perfil (calculada), para filtrar y ordenar
--    los perfiles que encajan con la pantalla de quien los busca.
-- =====================================================================================

alter table public.game_profiles add column device_model text
    check (device_model is null or (char_length(device_model) between 2 and 60
           and device_model ~ '^[A-Za-z0-9][A-Za-z0-9 ._()+/-]*$'));
alter table public.game_profiles add column screen_ratio numeric(5, 3)
    generated always as (round(greatest(screen_w, screen_h)::numeric / least(screen_w, screen_h), 3)) stored;
create index game_profiles_ratio_idx on public.game_profiles (package, screen_ratio) where status = 'published';
create index game_profiles_device_idx on public.game_profiles (package, lower(device_model)) where status = 'published';

grant select (device_model, screen_ratio) on public.game_profiles to anon, authenticated;

-- Modelo limpio (o null): una linea, letras, numeros y pocos simbolos.
create or replace function private.clean_device(p_value text)
returns text language plpgsql immutable set search_path = '' as $$
declare
    v text := btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'));
begin
    if v = '' then
        return null;
    end if;
    if char_length(v) > 60 or char_length(v) < 2 or v !~ '^[A-Za-z0-9][A-Za-z0-9 ._()+/-]*$' then
        perform private.fail('INVALID_DEVICE', 'El modelo del teléfono solo admite letras, números y . _ ( ) + / - (2 a 60 caracteres).');
    end if;
    return v;
end $$;

-- publish_profile / update_profile con el modelo (opcional). Se quitan las versiones anteriores
-- para que no haya dos funciones con el mismo nombre.
drop function if exists public.publish_profile(text, text, text, text, text);
drop function if exists public.update_profile(uuid, text, text, text);

create or replace function public.publish_profile(
    p_package text, p_game_name text, p_title text, p_description text, p_conf text, p_device text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_package text := btrim(coalesce(p_package, ''));
    v_title text := private.clean_line(p_title, 3, 60, 'título');
    v_description text := private.clean_text(p_description, 500, 'descripción');
    v_device text := private.clean_device(p_device);
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

    insert into public.game_profiles (package, author_id, title, description, conf, screen_w, screen_h, binding_count, device_model)
    values (v_package, v_uid, v_title, v_description, v_conf.conf, v_conf.screen_w, v_conf.screen_h, v_conf.binding_count, v_device)
    returning id into v_id;
    return v_id;
end $$;

create or replace function public.update_profile(
    p_id uuid, p_title text, p_description text, p_conf text, p_device text default null)
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
           binding_count = v_conf.binding_count,
           -- null = no tocar el modelo; '' = quitarlo
           device_model = case when p_device is null then device_model else private.clean_device(p_device) end
     where id = p_id;
end $$;

revoke execute on function public.publish_profile(text, text, text, text, text, text),
    public.update_profile(uuid, text, text, text, text) from public, anon;
grant execute on function public.publish_profile(text, text, text, text, text, text),
    public.update_profile(uuid, text, text, text, text) to authenticated;
revoke execute on function private.clean_device(text) from public, anon, authenticated;
