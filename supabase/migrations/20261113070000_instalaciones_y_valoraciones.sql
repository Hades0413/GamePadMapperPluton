-- =====================================================================================
--  Instalaciones y valoraciones «¿te funcionó?» desde la app (sin cuenta).
--
--  - La app no tiene cuentas: se identifica con un id de instalacion ALEATORIO (UUID que genera
--    la propia app; no es el telefono ni la persona). Una instalacion cuenta una vez por perfil.
--  - Contadores diferidos (como los «me gusta»): se anotan y pg_cron recalcula cada minuto.
--  - Limites: cada instalacion como mucho 60 registros por hora; los contadores son orientativos.
-- =====================================================================================

alter table public.game_profiles add column install_count integer not null default 0 check (install_count >= 0);
alter table public.game_profiles add column works_yes integer not null default 0 check (works_yes >= 0);
alter table public.game_profiles add column works_no integer not null default 0 check (works_no >= 0);
grant select (install_count, works_yes, works_no) on public.game_profiles to anon, authenticated;
create index game_profiles_installs_idx on public.game_profiles (package, install_count desc, created_at desc)
    where status = 'published';

create table public.profile_installs (
    profile_id  uuid not null references public.game_profiles (id) on delete cascade,
    install_id  uuid not null,
    created_at  timestamptz not null default now(),
    primary key (profile_id, install_id)
);
create table public.profile_feedback (
    profile_id  uuid not null references public.game_profiles (id) on delete cascade,
    install_id  uuid not null,
    works       boolean not null,
    created_at  timestamptz not null default now(),
    primary key (profile_id, install_id)
);
create index profile_installs_recent_idx on public.profile_installs (install_id, created_at desc);
create index profile_feedback_recent_idx on public.profile_feedback (install_id, created_at desc);
alter table public.profile_installs enable row level security;
alter table public.profile_feedback enable row level security;
revoke all on public.profile_installs, public.profile_feedback from public, anon, authenticated;

create table private.stats_pending (profile_id uuid primary key);
alter table private.stats_pending enable row level security;

create or replace function private.mark_stats()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    insert into private.stats_pending (profile_id)
    values (case when tg_op = 'DELETE' then old.profile_id else new.profile_id end)
    on conflict do nothing;
    return null;
end $$;

create trigger profile_installs_stats after insert or delete on public.profile_installs
    for each row execute function private.mark_stats();
create trigger profile_feedback_stats after insert or update or delete on public.profile_feedback
    for each row execute function private.mark_stats();

create or replace function private.flush_stats()
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_n integer;
begin
    with done as (delete from private.stats_pending returning profile_id)
    update public.game_profiles p
       set install_count = (select count(*) from public.profile_installs i where i.profile_id = p.id),
           works_yes = (select count(*) from public.profile_feedback f where f.profile_id = p.id and f.works),
           works_no = (select count(*) from public.profile_feedback f where f.profile_id = p.id and not f.works)
      from done
     where p.id = done.profile_id;
    get diagnostics v_n = row_count;
    return v_n;
end $$;

-- Limite por instalacion (sin cuenta): como mucho p_max registros en la ultima hora en esa tabla.
create or replace function private.install_rate(p_install uuid, p_table text, p_max integer)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_count integer;
begin
    perform pg_advisory_xact_lock(hashtextextended(p_install::text || ':' || p_table, 0));
    if p_table = 'installs' then
        select count(*) into v_count from public.profile_installs
         where install_id = p_install and created_at > now() - interval '1 hour';
    else
        select count(*) into v_count from public.profile_feedback
         where install_id = p_install and created_at > now() - interval '1 hour';
    end if;
    if v_count >= p_max then
        perform private.fail('RATE_LIMIT', 'Demasiadas peticiones. Inténtalo más tarde.');
    end if;
end $$;

-- La app avisa de que ha instalado un perfil de la comunidad.
create or replace function public.register_install(p_id uuid, p_install uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    if p_install is null or not exists (select 1 from public.game_profiles where id = p_id and status = 'published') then
        return;   -- silencioso: no da pistas de que existe o no
    end if;
    perform private.install_rate(p_install, 'installs', 60);
    insert into public.profile_installs (profile_id, install_id) values (p_id, p_install) on conflict do nothing;
end $$;

-- «¿Te funcionó?» (una respuesta por instalacion; se puede cambiar).
create or replace function public.rate_profile(p_id uuid, p_install uuid, p_works boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    if p_install is null or p_works is null
       or not exists (select 1 from public.profile_installs where profile_id = p_id and install_id = p_install) then
        return;   -- solo valora quien lo instalo desde la comunidad
    end if;
    perform private.install_rate(p_install, 'feedback', 60);
    insert into public.profile_feedback (profile_id, install_id, works) values (p_id, p_install, p_works)
    on conflict (profile_id, install_id) do update set works = excluded.works, created_at = now();
end $$;

revoke execute on function public.register_install(uuid, uuid), public.rate_profile(uuid, uuid, boolean) from public;
grant execute on function public.register_install(uuid, uuid), public.rate_profile(uuid, uuid, boolean) to anon, authenticated;
revoke execute on function private.flush_stats(), private.install_rate(uuid, text, integer), private.mark_stats()
    from public, anon, authenticated;

-- Recalculo cada minuto junto a los «me gusta».
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule(jobid) from cron.job where jobname = 'contar-instalaciones';
        perform cron.schedule('contar-instalaciones', '* * * * *', 'select private.flush_stats()');
    end if;
end $$;
