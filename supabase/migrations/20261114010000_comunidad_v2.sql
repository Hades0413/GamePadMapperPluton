-- =====================================================================================
--  Comunidad 1.6:
--   - Etiquetas por perfil (lista cerrada: nada de texto libre que moderar).
--   - Comentarios cortos (con sesion de GitHub, limite diario; los borra su autor, el autor
--     del perfil o un admin).
--   - Historial de versiones: cada cambio del .conf guarda una copia (las 20 ultimas).
--   - Destacados (los elige un admin).
--   - Señal de calidad: votos «¿te funcionó?» de los ultimos 30 dias.
-- =====================================================================================

-- -------------------------------------------------------------------------- etiquetas
create or replace function private.valid_tags(p_tags text[])
returns boolean language sql immutable set search_path = '' as $$
    select cardinality(p_tags) <= 4
       and p_tags <@ array['competitivo', 'casual', 'zurdo', 'una-mano', 'sin-gatillos', 'tablet',
                           'giroscopio', 'teclado-raton', 'xbox', 'playstation']::text[];
$$;

alter table public.game_profiles add column tags text[] not null default '{}'
    check (private.valid_tags(tags));
create index game_profiles_tags_idx on public.game_profiles using gin (tags) where status = 'published';
grant select (tags) on public.game_profiles to anon, authenticated;

-- Solo el autor cambia las etiquetas de su perfil.
create or replace function public.set_profile_tags(p_id uuid, p_tags text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_tags text[] := (select coalesce(array_agg(distinct t order by t), '{}') from unnest(coalesce(p_tags, '{}')) t);
begin
    if not private.valid_tags(v_tags) then
        perform private.fail('INVALID_TAGS', 'Elige como mucho 4 etiquetas de la lista.');
    end if;
    update public.game_profiles set tags = v_tags where id = p_id and author_id = v_uid;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe o no es tuyo.');
    end if;
end $$;

-- -------------------------------------------------------------------------- destacados
alter table public.game_profiles add column featured_at timestamptz;
create index game_profiles_featured_idx on public.game_profiles (featured_at desc)
    where featured_at is not null and status = 'published';
grant select (featured_at) on public.game_profiles to anon, authenticated;

create or replace function public.admin_feature_profile(p_id uuid, p_on boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    perform private.require_admin();
    update public.game_profiles set featured_at = case when p_on then now() end where id = p_id;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe.');
    end if;
end $$;

-- -------------------------------------------------------------------------- calidad reciente
alter table public.game_profiles add column recent_yes integer not null default 0 check (recent_yes >= 0);
alter table public.game_profiles add column recent_no integer not null default 0 check (recent_no >= 0);
grant select (recent_yes, recent_no) on public.game_profiles to anon, authenticated;

create or replace function private.flush_stats()
returns integer language plpgsql security definer set search_path = '' as $$
declare
    v_n integer;
begin
    with done as (delete from private.stats_pending returning profile_id)
    update public.game_profiles p
       set install_count = (select count(*) from public.profile_installs i where i.profile_id = p.id),
           works_yes = (select count(*) from public.profile_feedback f where f.profile_id = p.id and f.works),
           works_no = (select count(*) from public.profile_feedback f where f.profile_id = p.id and not f.works),
           recent_yes = (select count(*) from public.profile_feedback f
                          where f.profile_id = p.id and f.works and f.created_at > now() - interval '30 days'),
           recent_no = (select count(*) from public.profile_feedback f
                         where f.profile_id = p.id and not f.works and f.created_at > now() - interval '30 days')
      from done
     where p.id = done.profile_id;
    get diagnostics v_n = row_count;
    return v_n;
end $$;

-- Una vez al dia: los votos de hace mas de 30 dias dejan de contar como recientes.
create or replace function private.refresh_recent_stats()
returns void language sql security definer set search_path = '' as $$
    update public.game_profiles p
       set recent_yes = (select count(*) from public.profile_feedback f
                          where f.profile_id = p.id and f.works and f.created_at > now() - interval '30 days'),
           recent_no = (select count(*) from public.profile_feedback f
                         where f.profile_id = p.id and not f.works and f.created_at > now() - interval '30 days')
     where p.recent_yes > 0 or p.recent_no > 0;
$$;

-- -------------------------------------------------------------------------- versiones
create table public.profile_versions (
    profile_id  uuid not null references public.game_profiles (id) on delete cascade,
    version     integer not null check (version >= 1),
    title       text not null,
    conf        text not null,
    created_at  timestamptz not null default now(),
    primary key (profile_id, version)
);
alter table public.profile_versions enable row level security;
revoke all on public.profile_versions from public, anon, authenticated;
grant select (profile_id, version, title, conf, created_at) on public.profile_versions to anon, authenticated;
-- Se ven las versiones de los perfiles que se pueden ver (la politica de game_profiles decide).
create policy "versiones de perfiles visibles" on public.profile_versions for select to anon, authenticated
    using (exists (select 1 from public.game_profiles p where p.id = profile_id));

create or replace function private.save_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_next integer;
begin
    if tg_op = 'UPDATE' and new.conf is not distinct from old.conf then
        return null;
    end if;
    select coalesce(max(version), 0) + 1 into v_next from public.profile_versions where profile_id = new.id;
    insert into public.profile_versions (profile_id, version, title, conf) values (new.id, v_next, new.title, new.conf);
    delete from public.profile_versions where profile_id = new.id and version <= v_next - 20;
    return null;
end $$;

create trigger game_profiles_versions after insert or update of conf on public.game_profiles
    for each row execute function private.save_version();

-- Los perfiles que ya existian empiezan con su version actual.
insert into public.profile_versions (profile_id, version, title, conf, created_at)
select id, 1, title, conf, updated_at from public.game_profiles;

-- -------------------------------------------------------------------------- comentarios
create table public.profile_comments (
    id          uuid primary key default gen_random_uuid(),
    profile_id  uuid not null references public.game_profiles (id) on delete cascade,
    author_id   uuid not null references public.authors (id) on delete cascade,
    body        text not null check (char_length(btrim(body)) between 2 and 280
                and body !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'),
    created_at  timestamptz not null default now()
);
create index profile_comments_profile_idx on public.profile_comments (profile_id, created_at desc);
create index profile_comments_author_idx on public.profile_comments (author_id);
alter table public.profile_comments enable row level security;
revoke all on public.profile_comments from public, anon, authenticated;
grant select (id, profile_id, author_id, body, created_at) on public.profile_comments to anon, authenticated;
-- Visibles si el perfil se puede ver y el autor del comentario no esta bloqueado.
create policy "comentarios visibles" on public.profile_comments for select to anon, authenticated
    using (exists (select 1 from public.game_profiles p where p.id = profile_id)
           and exists (select 1 from public.authors a where a.id = author_id));

create or replace function public.add_comment(p_id uuid, p_body text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
    v_id uuid;
begin
    if char_length(v_body) not between 2 and 280 then
        perform private.fail('INVALID_COMMENT', 'El comentario debe tener entre 2 y 280 caracteres.');
    end if;
    if not exists (select 1 from public.game_profiles where id = p_id and status = 'published' and not game_hidden) then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe.');
    end if;
    perform private.rate_limit(v_uid, 'comment', 30, interval '1 day');
    insert into public.profile_comments (profile_id, author_id, body) values (p_id, v_uid, v_body) returning id into v_id;
    return v_id;
end $$;

create or replace function public.delete_comment(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
begin
    delete from public.profile_comments c
     where c.id = p_id
       and (c.author_id = v_uid
            or exists (select 1 from public.game_profiles p where p.id = c.profile_id and p.author_id = v_uid)
            or exists (select 1 from public.authors a where a.id = v_uid and a.is_admin));
    if not found then
        perform private.fail('NOT_FOUND', 'Ese comentario no existe o no puedes borrarlo.');
    end if;
end $$;

-- -------------------------------------------------------------------------- permisos
revoke execute on function public.set_profile_tags(uuid, text[]), public.admin_feature_profile(uuid, boolean),
    public.add_comment(uuid, text), public.delete_comment(uuid) from public, anon;
grant execute on function public.set_profile_tags(uuid, text[]), public.admin_feature_profile(uuid, boolean),
    public.add_comment(uuid, text), public.delete_comment(uuid) to authenticated;
revoke execute on function private.save_version(), private.refresh_recent_stats(), private.valid_tags(text[])
    from public, anon, authenticated;

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule(jobid) from cron.job where jobname = 'votos-recientes';
        perform cron.schedule('votos-recientes', '41 3 * * *', 'select private.refresh_recent_stats()');
    end if;
end $$;
