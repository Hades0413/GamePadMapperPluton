-- =====================================================================================
--  Mandos de la comunidad (lineas SDL GameControllerDB), con moderacion.
--
--  - La app de escritorio (Linux/Windows) reconoce mandos con lineas como
--      03000000c82d00000161000000000000,8BitDo SN30 Pro,a:b1,b:b0,...,platform:Linux,
--    Quien configura un mando desconocido en la app la exporta («Exportar SDL») y la envia aqui.
--  - Enviar exige sesion de GitHub; el envio queda «pendiente» y SOLO lo ve su autor.
--  - Un admin lo aprueba o lo rechaza. Solo lo aprobado es publico (anon), y es lo que descarga
--    la app: controller_mappings?select=mapping&status=eq.approved&platform=eq.Linux
--  - Seguridad / abusos:
--      * Nadie escribe en la tabla por el API: solo las funciones de abajo.
--      * La linea se valida con una lista cerrada de controles y valores (private.canonical_sdl)
--        y se guarda reconstruida en forma canonica: nunca se guarda el texto tal cual llego.
--      * Como mucho 1024 bytes por linea, 10 envios al dia, 20 pendientes por autor y 1000
--        pendientes en total (la cola de revision no puede crecer sin limite).
--      * Los rechazados se borran solos a los 30 dias.
--      * Las filas de autores bloqueados no se ven (como el resto de tablas).
--  - Al aprobar un mando, el que estuviera aprobado antes para el mismo guid y plataforma SE
--    BORRA (no se marca como rechazado: no fue un error de su autor, simplemente se sustituye
--    por una version mas reciente). Asi solo hay una linea publica por mando y plataforma.
-- =====================================================================================

create table public.controller_mappings (
    id           uuid primary key default gen_random_uuid(),
    guid         text not null check (guid ~ '^[0-9a-f]{32}$'),
    name         text not null check (char_length(name) between 2 and 80 and name !~ '[[:cntrl:],<>]'),
    platform     text not null check (platform in ('Windows', 'Linux')),
    mapping      text not null check (octet_length(mapping) <= 1024 and mapping !~ '[[:cntrl:]<>]'
                                      and left(mapping, 33) = guid || ','),
    author_id    uuid not null references public.authors (id) on delete cascade,
    status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    created_at   timestamptz not null default now(),
    reviewed_at  timestamptz
);
-- Una sola linea aprobada por mando y plataforma.
create unique index controller_mappings_approved_idx on public.controller_mappings (guid, platform)
    where status = 'approved';
create index controller_mappings_status_idx on public.controller_mappings (status, created_at desc);
create index controller_mappings_author_idx on public.controller_mappings (author_id);
create index controller_mappings_platform_idx on public.controller_mappings (platform, created_at desc)
    where status = 'approved';

alter table public.controller_mappings enable row level security;
revoke all on public.controller_mappings from public, anon, authenticated;
grant select (id, guid, name, platform, mapping, author_id, status, created_at, reviewed_at)
    on public.controller_mappings to anon, authenticated;
-- Aprobados para todos; los propios (cualquier estado) para su autor. Nunca los de autores bloqueados.
create policy "mandos aprobados o propios" on public.controller_mappings for select to anon, authenticated
    using ((status = 'approved' or author_id = (select auth.uid()))
           and exists (select 1 from public.authors a where a.id = author_id));

-- -------------------------------------------------------------------------- validacion
-- Valida una linea SDL y la devuelve en forma canonica (guid en minusculas, controles en un orden
-- fijo, platform al final). Misma regla en web/src/domain/controller/sdlMapping.ts.
create or replace function private.canonical_sdl(p_line text)
returns table (guid text, name text, platform text, mapping text)
language plpgsql immutable set search_path = '' as $$
declare
    c_keys constant text[] := array['a', 'b', 'x', 'y', 'back', 'guide', 'start', 'leftstick', 'rightstick',
        'leftshoulder', 'rightshoulder', 'dpup', 'dpdown', 'dpleft', 'dpright', 'leftx', 'lefty', 'rightx',
        'righty', 'lefttrigger', 'righttrigger', 'misc1', 'paddle1', 'paddle2', 'paddle3', 'paddle4', 'touchpad'];
    v_line text;
    v_parts text[];
    v_vals text[] := array_fill(null::text, array[27]);
    v_field text;
    v_key text;
    v_value text;
    v_idx integer;
    v_count integer := 0;
    v_out text := '';
    i integer;
begin
    -- Corte rapido antes de cualquier expresion regular sobre textos enormes.
    if p_line is null or octet_length(p_line) > 2048 then
        perform private.fail('INVALID_MAPPING', 'La línea es demasiado larga (máximo 1024 bytes).');
    end if;
    v_line := regexp_replace(p_line, '^\s+|\s+$', '', 'g');
    if octet_length(v_line) > 1024 then
        perform private.fail('INVALID_MAPPING', 'La línea es demasiado larga (máximo 1024 bytes).');
    end if;
    if v_line ~ '[[:cntrl:]]' then
        perform private.fail('INVALID_MAPPING', 'La línea tiene caracteres no permitidos (debe ser una sola línea).');
    end if;
    v_parts := string_to_array(v_line, ',');
    if cardinality(v_parts) < 3 then
        perform private.fail('INVALID_MAPPING', 'No parece una línea SDL: GUID,nombre,controles…,platform:Linux,');
    end if;

    guid := lower(btrim(v_parts[1]));
    if guid !~ '^[0-9a-f]{32}$' then
        perform private.fail('INVALID_MAPPING', 'El GUID debe tener 32 caracteres hexadecimales.');
    end if;

    name := btrim(regexp_replace(v_parts[2], '\s+', ' ', 'g'));
    if char_length(name) not between 2 and 80 then
        perform private.fail('INVALID_MAPPING', 'El nombre del mando debe tener entre 2 y 80 caracteres.');
    end if;
    if name ~ '[<>]' then
        perform private.fail('INVALID_MAPPING', 'El nombre del mando no puede contener < ni >.');
    end if;

    for i in 3 .. cardinality(v_parts) loop
        v_field := btrim(v_parts[i]);
        continue when v_field = '';
        if position(':' in v_field) = 0 then
            perform private.fail('INVALID_MAPPING', 'Cada control debe ir como nombre:valor (por ejemplo a:b0).');
        end if;
        v_key := split_part(v_field, ':', 1);
        v_value := substr(v_field, position(':' in v_field) + 1);
        if v_key = 'platform' then
            if platform is not null then
                perform private.fail('INVALID_MAPPING', 'La plataforma aparece repetida.');
            end if;
            if v_value not in ('Windows', 'Linux') then
                perform private.fail('INVALID_MAPPING', 'La plataforma debe ser Windows o Linux.');
            end if;
            platform := v_value;
            continue;
        end if;
        v_idx := array_position(c_keys, v_key);
        if v_idx is null then
            perform private.fail('INVALID_MAPPING', case when v_key ~ '^[A-Za-z0-9+-]{1,20}$'
                then format('Control desconocido: «%s».', v_key) else 'Hay un control desconocido.' end);
        end if;
        if v_vals[v_idx] is not null then
            perform private.fail('INVALID_MAPPING', format('El control «%s» aparece repetido.', v_key));
        end if;
        if v_value !~ '^[+-]?(b[0-9]{1,3}|a[0-9]{1,2}~?|h[0-9]{1,2}\.(1|2|4|8))$' then
            perform private.fail('INVALID_MAPPING', format('Valor no válido para «%s» (ejemplos: b0, a1, a2~, h0.4).', v_key));
        end if;
        v_vals[v_idx] := v_value;
        v_count := v_count + 1;
    end loop;

    if platform is null then
        perform private.fail('INVALID_MAPPING', 'Falta la plataforma (platform:Windows o platform:Linux).');
    end if;
    if v_count < 6 then
        perform private.fail('INVALID_MAPPING', 'Faltan controles: asigna al menos 6.');
    end if;

    for i in 1 .. 27 loop
        if v_vals[i] is not null then
            v_out := v_out || c_keys[i] || ':' || v_vals[i] || ',';
        end if;
    end loop;
    mapping := guid || ',' || name || ',' || v_out || 'platform:' || platform || ',';
    return next;
end $$;

-- -------------------------------------------------------------------------- envios
create or replace function public.submit_controller_mapping(p_line text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v record;
    v_id uuid;
begin
    select * into v from private.canonical_sdl(p_line);
    if exists (select 1 from public.controller_mappings m
                where m.guid = v.guid and m.platform = v.platform and m.status = 'approved' and m.mapping = v.mapping) then
        perform private.fail('ALREADY_EXISTS', 'Ese mando ya está en la lista con esta misma configuración.');
    end if;
    -- Tambien serializa los envios simultaneos del mismo autor (los recuentos de abajo son fiables).
    perform private.rate_limit(v_uid, 'controller_mapping', 10, interval '1 day');

    -- Si ya tenia uno pendiente para ese mando y plataforma, se sustituye (no se duplica).
    update public.controller_mappings m
       set name = v.name, mapping = v.mapping, created_at = now()
     where m.author_id = v_uid and m.guid = v.guid and m.platform = v.platform and m.status = 'pending'
    returning m.id into v_id;
    if v_id is not null then
        return v_id;
    end if;

    if (select count(*) from public.controller_mappings m where m.author_id = v_uid and m.status = 'pending') >= 20 then
        perform private.fail('LIMIT', 'Tienes 20 mandos pendientes de revisión. Espera a que se revisen.');
    end if;
    if (select count(*) from public.controller_mappings m where m.status = 'pending') >= 1000 then
        perform private.fail('LIMIT', 'La cola de revisión está llena. Inténtalo dentro de unos días.');
    end if;
    insert into public.controller_mappings (guid, name, platform, mapping, author_id)
    values (v.guid, v.name, v.platform, v.mapping, v_uid)
    returning id into v_id;
    return v_id;
end $$;

-- El autor borra sus pendientes o rechazados; un admin, cualquiera.
create or replace function public.delete_controller_mapping(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    delete from public.controller_mappings m
     where m.id = p_id
       and ((m.author_id = v_uid and m.status in ('pending', 'rejected'))
            or exists (select 1 from public.authors a where a.id = v_uid and a.is_admin));
    if not found then
        perform private.fail('NOT_FOUND', 'Ese mando no existe o no puedes borrarlo.');
    end if;
end $$;

-- -------------------------------------------------------------------------- moderacion
create or replace function public.admin_controller_mappings(p_status text default 'pending', p_limit integer default 100)
returns table (id uuid, guid text, name text, platform text, mapping text, author_id uuid, username text,
               status text, created_at timestamptz, reviewed_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    perform private.require_admin();
    if p_status is null or p_status not in ('pending', 'approved', 'rejected') then
        perform private.fail('INVALID_STATUS', 'Estado no válido.');
    end if;
    return query
        select m.id, m.guid, m.name, m.platform, m.mapping, m.author_id, a.username, m.status, m.created_at, m.reviewed_at
          from public.controller_mappings m
          join public.authors a on a.id = m.author_id
         where m.status = p_status and not a.is_banned
         order by m.created_at desc
         limit least(greatest(coalesce(p_limit, 100), 1), 200);
end $$;

create or replace function public.admin_review_controller_mapping(p_id uuid, p_approve boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_guid text;
    v_platform text;
begin
    perform private.require_admin();
    select m.guid, m.platform into v_guid, v_platform from public.controller_mappings m where m.id = p_id;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese mando no existe.');
    end if;
    -- Dos aprobaciones a la vez del mismo mando no chocan con el indice unico.
    perform pg_advisory_xact_lock(hashtextextended('mando:' || v_guid || ':' || v_platform, 0));
    if coalesce(p_approve, false) then
        -- El aprobado anterior (si lo hay) se sustituye: se borra.
        delete from public.controller_mappings m
         where m.guid = v_guid and m.platform = v_platform and m.status = 'approved' and m.id <> p_id;
        update public.controller_mappings m set status = 'approved', reviewed_at = now() where m.id = p_id;
    else
        update public.controller_mappings m set status = 'rejected', reviewed_at = now() where m.id = p_id;
    end if;
end $$;

create or replace function private.cleanup_controller_mappings()
returns void language sql security definer set search_path = '' as $$
    delete from public.controller_mappings where status = 'rejected' and reviewed_at < now() - interval '30 days';
$$;

-- -------------------------------------------------------------------------- permisos
revoke execute on function public.submit_controller_mapping(text), public.delete_controller_mapping(uuid),
    public.admin_controller_mappings(text, integer), public.admin_review_controller_mapping(uuid, boolean)
    from public, anon;
grant execute on function public.submit_controller_mapping(text), public.delete_controller_mapping(uuid),
    public.admin_controller_mappings(text, integer), public.admin_review_controller_mapping(uuid, boolean)
    to authenticated;
revoke execute on function private.canonical_sdl(text), private.cleanup_controller_mappings()
    from public, anon, authenticated;

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule(jobid) from cron.job where jobname = 'limpiar-mandos-rechazados';
        perform cron.schedule('limpiar-mandos-rechazados', '37 4 * * *', 'select private.cleanup_controller_mappings()');
    end if;
end $$;
