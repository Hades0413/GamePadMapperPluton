-- =====================================================================================
--  Avisos dentro de la web (sin correos).
--
--  - Se crean solos (triggers) cuando:
--      * alguien comenta en tu perfil (no cuando comentas tu mismo),
--      * un admin aprueba o rechaza un mando que enviaste,
--      * la moderacion oculta uno de tus perfiles (por reportes o a mano).
--  - Cada aviso guarda solo unos pocos datos de una lista cerrada (id y titulo del perfil, nombre
--    de quien comento, nombre y plataforma del mando): nunca el texto de un comentario.
--  - Cada usuario solo ve los suyos (RLS). Nadie los escribe por el API: solo se marcan como
--    leidos con las funciones de abajo.
--  - Como mucho 200 por usuario (se borran los mas antiguos) y se borran a los 90 dias.
-- =====================================================================================

create table public.notifications (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.authors (id) on delete cascade,
    kind        text not null check (kind in ('comment', 'mapping_approved', 'mapping_rejected', 'profile_hidden')),
    data        jsonb not null default '{}'::jsonb
                check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 1024),
    read_at     timestamptz,
    created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_old_idx on public.notifications (created_at);

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select (id, kind, data, read_at, created_at) on public.notifications to authenticated;
create policy "mis avisos" on public.notifications for select to authenticated
    using (user_id = (select auth.uid()));

-- -------------------------------------------------------------------------- crear avisos
-- Datos del aviso: solo estas claves, con su tipo y longitud comprobados (lista cerrada).
create or replace function private.notify(
    p_user uuid, p_kind text,
    p_profile uuid default null, p_title text default null, p_actor text default null,
    p_name text default null, p_platform text default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_data jsonb;
begin
    if p_user is null then
        return;
    end if;
    v_data := jsonb_strip_nulls(jsonb_build_object(
        'profile_id', p_profile,
        'title', left(regexp_replace(p_title, '[[:cntrl:]]', ' ', 'g'), 80),
        'actor', case when p_actor ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,38}$' then p_actor end,
        'name', left(regexp_replace(p_name, '[[:cntrl:]]', ' ', 'g'), 80),
        'platform', case when p_platform in ('Windows', 'Linux') then p_platform end));
    insert into public.notifications (user_id, kind, data) values (p_user, p_kind, v_data);
    -- Como mucho 200 por usuario: se borran los mas antiguos.
    delete from public.notifications
     where id in (select n.id from public.notifications n where n.user_id = p_user
                   order by n.created_at desc, n.id offset 200);
end $$;

-- Comentario nuevo en tu perfil (no si lo escribes tu).
create or replace function private.notify_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_owner uuid;
    v_title text;
begin
    select p.author_id, p.title into v_owner, v_title from public.game_profiles p where p.id = new.profile_id;
    if v_owner is not null and v_owner <> new.author_id then
        perform private.notify(v_owner, 'comment', p_profile => new.profile_id, p_title => v_title,
            p_actor => (select a.username from public.authors a where a.id = new.author_id));
    end if;
    return null;
end $$;

create trigger profile_comments_notify after insert on public.profile_comments
    for each row execute function private.notify_comment();

-- Tu mando enviado se ha aprobado o rechazado.
create or replace function private.notify_mapping_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    perform private.notify(new.author_id,
        case when new.status = 'approved' then 'mapping_approved' else 'mapping_rejected' end,
        p_name => new.name, p_platform => new.platform);
    return null;
end $$;

create trigger controller_mappings_notify after update of status on public.controller_mappings
    for each row when (old.status = 'pending' and new.status in ('approved', 'rejected'))
    execute function private.notify_mapping_review();

-- La moderacion oculta tu perfil (a mano o por reportes). A un autor bloqueado no se le avisa.
create or replace function private.notify_profile_hidden()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if exists (select 1 from public.authors a where a.id = new.author_id and not a.is_banned) then
        perform private.notify(new.author_id, 'profile_hidden', p_profile => new.id, p_title => new.title);
    end if;
    return null;
end $$;

create trigger game_profiles_notify_hidden after update of status on public.game_profiles
    for each row when (old.status = 'published' and new.status = 'hidden')
    execute function private.notify_profile_hidden();

-- -------------------------------------------------------------------------- API
-- Avisos sin leer de la sesion actual (0 sin sesion). Se consulta a menudo: solo usa el indice.
create or replace function public.unread_notification_count()
returns integer language sql stable security definer set search_path = '' as $$
    select count(*)::integer from public.notifications
     where user_id = auth.uid() and read_at is null;
$$;

-- Marca como leidos algunos avisos propios (como mucho 100 de una vez).
create or replace function public.mark_notifications_read(p_ids uuid[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    if p_ids is null or cardinality(p_ids) = 0 then
        return;
    end if;
    if cardinality(p_ids) > 100 then
        perform private.fail('INVALID_INPUT', 'Demasiados avisos de una vez.');
    end if;
    perform private.rate_limit(v_uid, 'notifications_read', 500, interval '1 day');
    update public.notifications set read_at = now()
     where user_id = v_uid and read_at is null and id = any (p_ids);
end $$;

create or replace function public.mark_all_notifications_read()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    perform private.rate_limit(v_uid, 'notifications_read', 500, interval '1 day');
    update public.notifications set read_at = now() where user_id = v_uid and read_at is null;
end $$;

-- Limpieza diaria: avisos de hace mas de 90 dias.
create or replace function private.cleanup_notifications()
returns void language sql security definer set search_path = '' as $$
    delete from public.notifications where created_at < now() - interval '90 days';
$$;

-- -------------------------------------------------------------------------- permisos
revoke execute on function public.unread_notification_count(), public.mark_notifications_read(uuid[]),
    public.mark_all_notifications_read() from public, anon;
grant execute on function public.unread_notification_count(), public.mark_notifications_read(uuid[]),
    public.mark_all_notifications_read() to authenticated;
revoke execute on function private.notify(uuid, text, uuid, text, text, text, text), private.notify_comment(),
    private.notify_mapping_review(), private.notify_profile_hidden(), private.cleanup_notifications()
    from public, anon, authenticated;

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule(jobid) from cron.job where jobname = 'limpiar-avisos';
        perform cron.schedule('limpiar-avisos', '29 4 * * *', 'select private.cleanup_notifications()');
    end if;
end $$;
