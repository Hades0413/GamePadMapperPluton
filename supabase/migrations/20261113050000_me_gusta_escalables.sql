-- =====================================================================================
--  «Me gusta» preparados para mucha gente a la vez.
--
--  Antes: cada «me gusta» actualizaba al momento game_profiles.like_count, asi que muchos
--  usuarios a la vez sobre el mismo perfil esperaban su turno para modificar la misma fila.
--  Ahora:
--   - El «me gusta» solo se anota en profile_likes y marca el perfil como pendiente de recontar
--     (una marca que no bloquea a nadie).
--   - Una tarea programada (pg_cron) recalcula los contadores pendientes una vez por minuto.
--   - like_profile() devuelve a quien pulsa el numero exacto en ese momento (contado con el
--     indice), asi que su pantalla siempre muestra el valor correcto.
--   - Los registros de limites de uso se limpian con la tarea programada, no en cada clic.
-- =====================================================================================

-- Perfiles con «me gusta» nuevos cuyo contador hay que recalcular.
create table private.like_count_pending (
    profile_id  uuid primary key
);
alter table private.like_count_pending enable row level security;

create or replace function private.count_likes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    insert into private.like_count_pending (profile_id)
    values (case when tg_op = 'INSERT' then new.profile_id else old.profile_id end)
    on conflict do nothing;
    return null;
end $$;

-- Recalcula los contadores pendientes (lo llama la tarea programada; tambien se puede a mano).
create or replace function private.flush_like_counts()
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_n integer;
begin
    with done as (
        delete from private.like_count_pending returning profile_id
    )
    update public.game_profiles p
       set like_count = (select count(*) from public.profile_likes l where l.profile_id = p.id)
      from done
     where p.id = done.profile_id;
    get diagnostics v_n = row_count;
    return v_n;
end $$;

-- Limpieza periodica de los registros de limites de uso.
create or replace function private.cleanup_logs()
returns void language sql security definer set search_path = '' as $$
    delete from private.action_log where created_at < now() - interval '2 days';
    delete from public.edge_function_calls where created_at < now() - interval '1 day';
$$;

-- El limite de uso ya no borra en cada llamada: solo cuenta en su ventana (indice) y anota.
create or replace function private.rate_limit(p_uid uuid, p_action text, p_max integer, p_window interval)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_count integer;
begin
    -- Serializa solo las peticiones simultaneas del MISMO usuario y accion (no afecta a los demas).
    perform pg_advisory_xact_lock(hashtextextended(p_uid::text || ':' || p_action, 0));
    select count(*) into v_count from private.action_log
     where user_id = p_uid and action = p_action and created_at >= now() - p_window;
    if v_count >= p_max then
        perform private.fail('RATE_LIMIT', 'Has hecho esto demasiadas veces. Inténtalo más tarde.');
    end if;
    insert into private.action_log (user_id, action) values (p_uid, p_action);
end $$;

-- «Me gusta» / quitarlo. Devuelve si queda con «me gusta» y el total exacto en ese momento.
create or replace function public.like_profile(p_id uuid)
returns table (liked boolean, like_count integer)
language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_liked boolean;
begin
    if not exists (select 1 from public.game_profiles where id = p_id and status = 'published') then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe.');
    end if;
    perform private.rate_limit(v_uid, 'like', 300, interval '1 day');
    delete from public.profile_likes where profile_id = p_id and user_id = v_uid;
    v_liked := not found;
    if v_liked then
        insert into public.profile_likes (profile_id, user_id) values (p_id, v_uid) on conflict do nothing;
    end if;
    return query select v_liked, (select count(*)::integer from public.profile_likes l where l.profile_id = p_id);
end $$;

-- toggle_like se mantiene por compatibilidad (devuelve solo si queda con «me gusta»).
create or replace function public.toggle_like(p_id uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
    select liked from public.like_profile(p_id);
$$;

revoke execute on function public.like_profile(uuid), public.toggle_like(uuid) from public, anon;
grant execute on function public.like_profile(uuid), public.toggle_like(uuid) to authenticated;
revoke execute on function private.flush_like_counts(), private.cleanup_logs() from public, anon, authenticated;

-- Tareas programadas (pg_cron viene con Supabase; si no esta disponible, no se crean).
do $$
begin
    if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
        create extension if not exists pg_cron;
        perform cron.unschedule(jobid) from cron.job where jobname in ('contar-me-gusta', 'limpiar-registros');
        perform cron.schedule('contar-me-gusta', '* * * * *', 'select private.flush_like_counts()');
        perform cron.schedule('limpiar-registros', '17 4 * * *', 'select private.cleanup_logs()');
    end if;
end $$;
