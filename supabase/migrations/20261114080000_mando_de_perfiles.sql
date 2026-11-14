-- =====================================================================================
--  Mando con el que se hizo cada perfil (opcional) y su tipo.
--
--  - controller_model: texto que escribe el autor o que trae la app ("Wireless Controller
--    (054c:05c4)"): una linea, 2 a 60 caracteres, solo letras, numeros y . _ ( ) + / : -
--    (mismas reglas que el modelo del telefono, mas ':' para los ids del mando).
--  - controller_type: lo calcula la base de datos a partir del texto (un disparador lo pone en
--    cada insert/update; nadie lo puede elegir): xbox, playstation, nintendo, 8bitdo, generico u otro. Sirve para el
--    filtro «Tipo de mando» de la web.
--  - publish_profile / update_profile: nuevo parametro opcional p_controller_model al final
--    (default null), asi las llamadas de siempre (por nombre, desde la web antigua) siguen igual.
--    En update_profile: null = no tocar el mando, '' = quitarlo.
-- =====================================================================================

-- Tipo de mando a partir del texto: primero 8BitDo (en modo Xbox dice ser de Microsoft), luego
-- el fabricante de los ids "(vvvv:pppp)" del final y por ultimo palabras del nombre.
create or replace function private.controller_type(p_model text)
returns text language plpgsql immutable set search_path = '' as $$
declare
    v text := lower(btrim(coalesce(p_model, '')));
    v_vendor text := substring(v from '\(([0-9a-f]{4}):[0-9a-f]{4}\)$');
    v_name text := btrim(regexp_replace(v, '\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$', ''));
begin
    if v = '' then
        return null;
    end if;
    if v ~ '8 ?bit ?do' or v_vendor = '2dc8' then
        return '8bitdo';
    end if;
    if v_vendor in ('045e', '0e6f', '24c6') then
        return 'xbox';
    end if;
    if v_vendor = '054c' then
        return 'playstation';
    end if;
    if v_vendor = '057e' then
        return 'nintendo';
    end if;
    if v ~ '(xbox|x-box)' then
        return 'xbox';
    end if;
    if v ~ '(dualshock|dualsense|playstation|\mps[345]\M)' or v_name = 'wireless controller' then
        return 'playstation';
    end if;
    if v ~ '(pro controller|joy-?con|nintendo|\mswitch\M)' then
        return 'nintendo';
    end if;
    if v_vendor is not null or v ~ '(game ?pad|controller|joystick|mando|\mpad\M)' then
        return 'generico';
    end if;
    return 'otro';
end $$;
revoke execute on function private.controller_type(text) from public, anon, authenticated;

alter table public.game_profiles add column controller_model text
    check (controller_model is null or (char_length(controller_model) between 2 and 60
           and controller_model ~ '^[A-Za-z0-9][A-Za-z0-9 ._()+/:-]*$'));
alter table public.game_profiles add column controller_type text
    check (controller_type is null or controller_type in ('xbox', 'playstation', 'nintendo', '8bitdo', 'generico', 'otro'));

-- El tipo siempre sale del texto (en cualquier insert o update, venga de donde venga). Funcion
-- del disparador con los permisos del propietario: quien actualiza la fila (contadores de «me
-- gusta», moderacion...) no necesita permiso sobre el esquema private.
create or replace function private.set_controller_type()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    new.controller_type := private.controller_type(new.controller_model);
    return new;
end $$;
revoke execute on function private.set_controller_type() from public, anon, authenticated;
create trigger game_profiles_controller_type before insert or update on public.game_profiles
    for each row execute function private.set_controller_type();

create index game_profiles_controller_idx on public.game_profiles (package, controller_type) where status = 'published';
create index game_profiles_all_controller_idx on public.game_profiles (controller_type, created_at desc)
    where status = 'published';

grant select (controller_model, controller_type) on public.game_profiles to anon, authenticated;

-- Mando limpio (o null): una linea, letras, numeros y pocos simbolos. Lo demas se rechaza.
create or replace function private.clean_controller(p_value text)
returns text language plpgsql immutable set search_path = '' as $$
declare
    v text := btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'));
begin
    if v = '' then
        return null;
    end if;
    if char_length(v) > 60 or char_length(v) < 2 or v !~ '^[A-Za-z0-9][A-Za-z0-9 ._()+/:-]*$' then
        perform private.fail('INVALID_CONTROLLER', 'El mando solo admite letras, números y . _ ( ) + / : - (2 a 60 caracteres).');
    end if;
    return v;
end $$;
revoke execute on function private.clean_controller(text) from public, anon, authenticated;

-- publish_profile / update_profile con el mando (opcional). Se quitan las versiones anteriores
-- para que no haya dos funciones con el mismo nombre (PostgREST no sabria cual usar).
drop function if exists public.publish_profile(text, text, text, text, text, text);
drop function if exists public.update_profile(uuid, text, text, text, text);

create or replace function public.publish_profile(
    p_package text, p_game_name text, p_title text, p_description text, p_conf text, p_device text default null,
    p_controller_model text default null)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_package text := btrim(coalesce(p_package, ''));
    v_title text := private.clean_line(p_title, 3, 60, 'título');
    v_description text := private.clean_text(p_description, 500, 'descripción');
    v_device text := private.clean_device(p_device);
    v_controller text := private.clean_controller(p_controller_model);
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

    insert into public.game_profiles (package, author_id, title, description, conf, screen_w, screen_h, binding_count,
                                      device_model, controller_model)
    values (v_package, v_uid, v_title, v_description, v_conf.conf, v_conf.screen_w, v_conf.screen_h, v_conf.binding_count,
            v_device, v_controller)
    returning id into v_id;
    return v_id;
end $$;

create or replace function public.update_profile(
    p_id uuid, p_title text, p_description text, p_conf text, p_device text default null,
    p_controller_model text default null)
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
           -- null = no tocar; '' = quitarlo
           device_model = case when p_device is null then device_model else private.clean_device(p_device) end,
           controller_model = case when p_controller_model is null then controller_model
                                   else private.clean_controller(p_controller_model) end
     where id = p_id;
end $$;

revoke execute on function public.publish_profile(text, text, text, text, text, text, text),
    public.update_profile(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.publish_profile(text, text, text, text, text, text, text),
    public.update_profile(uuid, text, text, text, text, text) to authenticated;
