-- =====================================================================================
--  Moderacion 2:
--   - Reportar comentarios (motivos de la lista, 1 por usuario y comentario, limite diario).
--     Con 3 reportes de cuentas con algunos dias (igual que los perfiles) el comentario se oculta
--     solo hasta que lo revise un admin (pestana «Comentarios»).
--   - Historial de moderacion (private.moderation_log): cada accion de un admin queda anotada
--     (quien, que, sobre que, motivo y cuando). Solo lo leen los admins (admin_moderation_log).
--   - Bloqueos temporales (authors.banned_until): 1, 7 o 30 dias. Mientras dura, la cuenta no
--     puede publicar, comentar, dar «me gusta», reportar ni enviar mandos (private.require_author),
--     pero su contenido sigue visible. El bloqueo para siempre es el de antes (oculta sus perfiles
--     y bloquea tambien su cuenta de GitHub).
--  Las funciones de admin que ya existian mantienen sus parametros: solo se anade el registro.
-- =====================================================================================

-- -------------------------------------------------------------------------- bloqueos temporales
alter table public.authors add column banned_until timestamptz;
create index authors_banned_idx on public.authors (banned_until) where banned_until is not null or is_banned;

-- Autor de la sesion actual; falla si no hay sesion o esta bloqueado (para siempre o por ahora).
create or replace function private.require_author()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
    v_uid uuid := auth.uid();
    v_banned boolean;
    v_until timestamptz;
    v_github text;
begin
    if v_uid is null then
        perform private.fail('AUTH_REQUIRED', 'Inicia sesión con GitHub para hacer esto.');
    end if;
    select is_banned, banned_until, github_id into v_banned, v_until, v_github from public.authors where id = v_uid;
    if not found then
        perform private.fail('AUTH_REQUIRED', 'Tu cuenta no está lista. Cierra sesión y vuelve a entrar.');
    end if;
    if v_banned or exists (select 1 from private.banned_github b where b.github_id = v_github) then
        perform private.fail('BANNED', 'Tu cuenta está bloqueada por incumplir las normas.');
    end if;
    if v_until > now() then
        perform private.fail('BANNED', format('Tu cuenta está suspendida hasta el %s (UTC) por incumplir las normas.',
            to_char(v_until at time zone 'UTC', 'DD/MM/YYYY HH24:MI')));
    end if;
    return v_uid;
end $$;

-- -------------------------------------------------------------------------- historial
create table private.moderation_log (
    id            bigint generated always as identity primary key,
    -- Sin clave ajena: el registro se conserva aunque se borre la cuenta del admin.
    admin_id      uuid,
    admin_name    text not null check (char_length(admin_name) <= 40),
    action        text not null check (action in (
                      'profile_publish', 'profile_hide', 'profile_delete', 'profile_feature', 'profile_unfeature',
                      'author_ban', 'author_unban', 'game_update', 'game_images',
                      'comment_hide', 'comment_restore', 'comment_delete',
                      'mapping_approve', 'mapping_reject', 'mapping_delete', 'diagnostic_delete')),
    target_type   text not null check (target_type in ('profile', 'author', 'game', 'comment', 'mapping', 'diagnostic')),
    target_id     text not null check (char_length(target_id) <= 160),
    target_label  text not null default '' check (char_length(target_label) <= 120),
    reason        text not null default '' check (char_length(reason) <= 300),
    created_at    timestamptz not null default now()
);
create index moderation_log_recent_idx on private.moderation_log (created_at desc);
alter table private.moderation_log enable row level security;

create or replace function private.log_moderation(
    p_action text, p_type text, p_target text, p_label text default '', p_reason text default '')
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := auth.uid();
begin
    insert into private.moderation_log (admin_id, admin_name, action, target_type, target_id, target_label, reason)
    values (v_uid, coalesce((select a.username from public.authors a where a.id = v_uid), '?'),
            p_action, p_type, left(coalesce(p_target, ''), 160),
            left(btrim(regexp_replace(coalesce(p_label, ''), '[[:cntrl:]]', ' ', 'g')), 120),
            left(btrim(regexp_replace(coalesce(p_reason, ''), '[[:cntrl:]]', ' ', 'g')), 300));
end $$;

-- Motivo opcional que escribe el admin (una linea, sin < >).
create or replace function private.clean_reason(p_reason text)
returns text language sql immutable set search_path = '' as $$
    select private.clean_line(coalesce(p_reason, ''), 0, 300, 'motivo');
$$;

create or replace function public.admin_moderation_log(p_limit integer default 100, p_before bigint default null)
returns table (id bigint, admin_name text, action text, target_type text, target_id text, target_label text,
               reason text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return query
        select l.id, l.admin_name, l.action, l.target_type, l.target_id, l.target_label, l.reason, l.created_at
          from private.moderation_log l
         where p_before is null or l.id < p_before
         order by l.id desc
         limit least(greatest(coalesce(p_limit, 100), 1), 200);
end $$;

create or replace function private.cleanup_moderation_log()
returns void language sql security definer set search_path = '' as $$
    delete from private.moderation_log where created_at < now() - interval '365 days';
$$;

-- -------------------------------------------------------------------------- bloquear / desbloquear
-- p_days: 1, 7 o 30 = temporal; null = para siempre.
create or replace function public.admin_ban_author(p_user uuid, p_days integer default null, p_reason text default '')
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_admin uuid := private.require_admin();
    v_reason text := private.clean_reason(p_reason);
    v_github text;
    v_name text;
begin
    if v_admin = p_user then
        perform private.fail('FORBIDDEN', 'No puedes bloquearte a ti mismo.');
    end if;
    if p_days is not null and p_days not in (1, 7, 30) then
        perform private.fail('INVALID_INPUT', 'Duración no válida: 1, 7 o 30 días, o para siempre.');
    end if;
    if p_days is null then
        update public.authors set is_banned = true, banned_until = null where id = p_user and not is_admin
        returning github_id, username into v_github, v_name;
        if not found then
            perform private.fail('FORBIDDEN', 'Ese usuario no existe o es administrador.');
        end if;
        update public.game_profiles set status = 'hidden' where author_id = p_user;
        if v_github is not null then
            insert into private.banned_github (github_id) values (v_github) on conflict do nothing;
        end if;
        perform private.log_moderation('author_ban', 'author', p_user::text, '@' || v_name || ' (para siempre)', v_reason);
    else
        update public.authors set banned_until = now() + make_interval(days => p_days)
         where id = p_user and not is_admin and not is_banned
        returning username into v_name;
        if not found then
            perform private.fail('FORBIDDEN', 'Ese usuario no existe, es administrador o ya está bloqueado para siempre.');
        end if;
        perform private.log_moderation('author_ban', 'author', p_user::text,
            '@' || v_name || format(' (%s %s)', p_days, case when p_days = 1 then 'día' else 'días' end), v_reason);
    end if;
end $$;

create or replace function public.admin_unban_author(p_user uuid, p_reason text default '')
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_reason text;
    v_github text;
    v_name text;
begin
    perform private.require_admin();
    v_reason := private.clean_reason(p_reason);
    update public.authors set is_banned = false, banned_until = null where id = p_user and not is_admin
    returning github_id, username into v_github, v_name;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese usuario no existe.');
    end if;
    if v_github is not null then
        delete from private.banned_github where github_id = v_github;
    end if;
    perform private.log_moderation('author_unban', 'author', p_user::text, '@' || v_name, v_reason);
end $$;

-- Se mantiene por compatibilidad: true = bloqueo para siempre, false = desbloquear.
create or replace function public.admin_set_banned(p_user uuid, p_banned boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    if p_banned then
        perform public.admin_ban_author(p_user, null, '');
    else
        perform public.admin_unban_author(p_user, '');
    end if;
end $$;

-- Cuentas bloqueadas ahora mismo (para siempre o temporalmente).
create or replace function public.admin_banned_authors()
returns table (id uuid, username text, is_banned boolean, banned_until timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return query
        select a.id, a.username, a.is_banned, a.banned_until, a.created_at
          from public.authors a
         where a.is_banned or a.banned_until > now()
         order by a.is_banned desc, a.banned_until desc nulls last
         limit 200;
end $$;

-- -------------------------------------------------------------------------- acciones de admin con registro
create or replace function public.admin_set_profile_status(p_id uuid, p_status text, p_clear_reports boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_title text;
begin
    perform private.require_admin();
    if p_status not in ('published', 'hidden') then
        perform private.fail('INVALID_STATUS', 'Estado no válido.');
    end if;
    if p_clear_reports then
        delete from public.profile_reports where profile_id = p_id;
        update public.game_profiles set report_count = 0 where id = p_id;
    end if;
    update public.game_profiles set status = p_status where id = p_id returning title into v_title;
    if found then
        perform private.log_moderation(case when p_status = 'hidden' then 'profile_hide' else 'profile_publish' end,
            'profile', p_id::text, v_title, case when p_clear_reports then 'reportes borrados' else '' end);
    end if;
end $$;

create or replace function public.delete_profile(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_owner uuid;
    v_title text;
begin
    delete from public.game_profiles
     where id = p_id
       and (author_id = v_uid or exists (select 1 from public.authors where id = v_uid and is_admin))
    returning author_id, title into v_owner, v_title;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe o no es tuyo.');
    end if;
    if v_owner <> v_uid then
        perform private.log_moderation('profile_delete', 'profile', p_id::text, v_title);
    end if;
end $$;

create or replace function public.admin_feature_profile(p_id uuid, p_on boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_title text;
begin
    perform private.require_admin();
    update public.game_profiles set featured_at = case when p_on then now() end where id = p_id returning title into v_title;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese perfil no existe.');
    end if;
    perform private.log_moderation(case when p_on then 'profile_feature' else 'profile_unfeature' end, 'profile', p_id::text, v_title);
end $$;

create or replace function public.admin_update_game(p_package text, p_name text, p_hidden boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_name text;
begin
    perform private.require_admin();
    update public.games
       set name = private.clean_line(p_name, 2, 60, 'juego'),
           is_hidden = p_hidden
     where package = p_package
    returning name into v_name;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese juego no existe.');
    end if;
    perform private.log_moderation('game_update', 'game', p_package, v_name || case when p_hidden then ' (oculto)' else '' end);
end $$;

create or replace function public.admin_set_game_images(p_package text, p_icon_url text, p_background_url text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_name text;
begin
    perform private.require_admin();
    if (nullif(p_icon_url, '') is not null and not private.is_game_image_url(p_icon_url))
       or (nullif(p_background_url, '') is not null and not private.is_game_image_url(p_background_url)) then
        perform private.fail('INVALID_IMAGE', 'La imagen tiene que estar en el almacenamiento del proyecto.');
    end if;
    update public.games
       set icon_url = case when p_icon_url is null then icon_url else nullif(p_icon_url, '') end,
           background_url = case when p_background_url is null then background_url else nullif(p_background_url, '') end
     where package = p_package
    returning name into v_name;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese juego no existe.');
    end if;
    perform private.log_moderation('game_images', 'game', p_package,
        v_name || case when p_icon_url is not null then ' · icono' else '' end
               || case when p_background_url is not null then ' · fondo' else '' end);
end $$;

create or replace function public.admin_delete_diagnostic(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    perform private.require_admin();
    delete from private.diagnostics where id = p_id;
    if found then
        perform private.log_moderation('diagnostic_delete', 'diagnostic', p_id::text, upper(left(p_id::text, 8)));
    end if;
end $$;

create or replace function public.admin_review_controller_mapping(p_id uuid, p_approve boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_guid text;
    v_platform text;
    v_name text;
begin
    perform private.require_admin();
    select m.guid, m.platform, m.name into v_guid, v_platform, v_name from public.controller_mappings m where m.id = p_id;
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
    perform private.log_moderation(case when coalesce(p_approve, false) then 'mapping_approve' else 'mapping_reject' end,
        'mapping', p_id::text, v_name || ' (' || v_platform || ')');
end $$;

create or replace function public.delete_controller_mapping(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_owner uuid;
    v_label text;
begin
    delete from public.controller_mappings m
     where m.id = p_id
       and ((m.author_id = v_uid and m.status in ('pending', 'rejected'))
            or exists (select 1 from public.authors a where a.id = v_uid and a.is_admin))
    returning m.author_id, m.name || ' (' || m.platform || ')' into v_owner, v_label;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese mando no existe o no puedes borrarlo.');
    end if;
    if v_owner <> v_uid then
        perform private.log_moderation('mapping_delete', 'mapping', p_id::text, v_label);
    end if;
end $$;

-- -------------------------------------------------------------------------- comentarios: ocultar y reportar
alter table public.profile_comments add column is_hidden boolean not null default false;
alter table public.profile_comments add column report_count integer not null default 0 check (report_count >= 0);
create index profile_comments_reported_idx on public.profile_comments (report_count desc, created_at desc)
    where report_count > 0 or is_hidden;

-- Los ocultos no se ven (ni siquiera su autor): solo los admins, por admin_reported_comments.
drop policy if exists "comentarios visibles" on public.profile_comments;
create policy "comentarios visibles" on public.profile_comments for select to anon, authenticated
    using (not is_hidden
           and exists (select 1 from public.game_profiles p where p.id = profile_id)
           and exists (select 1 from public.authors a where a.id = author_id));

create table public.comment_reports (
    comment_id  uuid not null references public.profile_comments (id) on delete cascade,
    user_id     uuid not null references public.authors (id) on delete cascade,
    reason      text not null check (reason in ('spam', 'broken', 'offensive', 'copyright', 'other')),
    details     text not null default '' check (char_length(details) <= 300 and details !~ '[[:cntrl:]]'),
    created_at  timestamptz not null default now(),
    primary key (comment_id, user_id)
);
create index comment_reports_user_idx on public.comment_reports (user_id);
alter table public.comment_reports enable row level security;
revoke all on public.comment_reports from public, anon, authenticated;
-- Sin politicas: nadie lo lee por el API.

-- Cada reporte suma; con 3 de cuentas con mas de 3 dias el comentario se oculta.
create or replace function private.count_comment_reports()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    v_trusted integer;
begin
    select count(*) into v_trusted
      from public.comment_reports r
      join public.authors a on a.id = r.user_id
     where r.comment_id = new.comment_id and a.created_at < now() - interval '3 days' and not a.is_banned;
    update public.profile_comments
       set report_count = report_count + 1,
           is_hidden = is_hidden or v_trusted >= 3
     where id = new.comment_id;
    return null;
end $$;

create trigger comment_reports_count after insert on public.comment_reports
    for each row execute function private.count_comment_reports();

create or replace function public.report_comment(p_id uuid, p_reason text, p_details text default '')
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_owner uuid;
begin
    select c.author_id into v_owner
      from public.profile_comments c
      join public.game_profiles p on p.id = c.profile_id
     where c.id = p_id and not c.is_hidden and p.status = 'published' and not p.game_hidden;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese comentario no existe.');
    end if;
    if v_owner = v_uid then
        perform private.fail('OWN_COMMENT', 'No puedes reportar tu propio comentario.');
    end if;
    if p_reason is null or p_reason not in ('spam', 'broken', 'offensive', 'copyright', 'other') then
        perform private.fail('INVALID_REASON', 'Elige un motivo válido.');
    end if;
    perform private.rate_limit(v_uid, 'comment_report', 30, interval '1 day');
    insert into public.comment_reports (comment_id, user_id, reason, details)
    values (p_id, v_uid, p_reason, private.clean_line(coalesce(p_details, ''), 0, 300, 'detalles'))
    on conflict (comment_id, user_id) do nothing;
end $$;

-- El autor del comentario, el del perfil o un admin lo borran (si es un admin, queda anotado).
create or replace function public.delete_comment(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_uid uuid := private.require_author();
    v_author uuid;
    v_profile_author uuid;
    v_label text;
begin
    select c.author_id, p.author_id, '@' || coalesce(a.username, '?') || ': ' || left(c.body, 80)
      into v_author, v_profile_author, v_label
      from public.profile_comments c
      join public.game_profiles p on p.id = c.profile_id
      left join public.authors a on a.id = c.author_id
     where c.id = p_id;
    if not found
       or not (v_author = v_uid or v_profile_author = v_uid
               or exists (select 1 from public.authors a where a.id = v_uid and a.is_admin)) then
        perform private.fail('NOT_FOUND', 'Ese comentario no existe o no puedes borrarlo.');
    end if;
    delete from public.profile_comments where id = p_id;
    if v_author <> v_uid and v_profile_author <> v_uid then
        perform private.log_moderation('comment_delete', 'comment', p_id::text, v_label);
    end if;
end $$;

create or replace function public.admin_reported_comments()
returns table (id uuid, profile_id uuid, profile_title text, author_id uuid, username text, body text,
               is_hidden boolean, report_count integer, reasons text[], created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return query
        select c.id, c.profile_id, p.title, c.author_id, a.username, c.body, c.is_hidden, c.report_count,
               array(select r.reason || coalesce(nullif(': ' || r.details, ': '), '')
                       from public.comment_reports r where r.comment_id = c.id order by r.created_at),
               c.created_at
          from public.profile_comments c
          join public.game_profiles p on p.id = c.profile_id
          join public.authors a on a.id = c.author_id
         where c.report_count > 0 or c.is_hidden
         order by c.report_count desc, c.created_at desc
         limit 200;
end $$;

-- p_action: 'restore' (visible y sin reportes), 'hide' u 'delete'.
create or replace function public.admin_moderate_comment(p_id uuid, p_action text, p_reason text default '')
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
    v_reason text;
    v_label text;
begin
    perform private.require_admin();
    v_reason := private.clean_reason(p_reason);
    if p_action is null or p_action not in ('restore', 'hide', 'delete') then
        perform private.fail('INVALID_INPUT', 'Acción no válida.');
    end if;
    select '@' || coalesce(a.username, '?') || ': ' || left(c.body, 80) into v_label
      from public.profile_comments c left join public.authors a on a.id = c.author_id
     where c.id = p_id;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese comentario no existe.');
    end if;
    if p_action = 'restore' then
        delete from public.comment_reports where comment_id = p_id;
        update public.profile_comments set is_hidden = false, report_count = 0 where id = p_id;
    elsif p_action = 'hide' then
        update public.profile_comments set is_hidden = true where id = p_id;
    else
        delete from public.profile_comments where id = p_id;
    end if;
    perform private.log_moderation('comment_' || p_action, 'comment', p_id::text, v_label, v_reason);
end $$;

-- -------------------------------------------------------------------------- permisos
revoke execute on function public.admin_moderation_log(integer, bigint), public.admin_ban_author(uuid, integer, text),
    public.admin_unban_author(uuid, text), public.admin_banned_authors(), public.report_comment(uuid, text, text),
    public.admin_reported_comments(), public.admin_moderate_comment(uuid, text, text)
    from public, anon;
grant execute on function public.admin_moderation_log(integer, bigint), public.admin_ban_author(uuid, integer, text),
    public.admin_unban_author(uuid, text), public.admin_banned_authors(), public.report_comment(uuid, text, text),
    public.admin_reported_comments(), public.admin_moderate_comment(uuid, text, text)
    to authenticated;
revoke execute on function private.log_moderation(text, text, text, text, text), private.clean_reason(text),
    private.cleanup_moderation_log(), private.count_comment_reports()
    from public, anon, authenticated;

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule(jobid) from cron.job where jobname = 'limpiar-historial-moderacion';
        perform cron.schedule('limpiar-historial-moderacion', '47 4 * * *', 'select private.cleanup_moderation_log()');
    end if;
end $$;
