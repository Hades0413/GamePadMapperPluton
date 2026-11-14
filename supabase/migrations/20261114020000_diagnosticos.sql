-- =====================================================================================
--  Diagnosticos enviados desde la app (opcional, siempre a peticion del usuario).
--
--  - La app muestra el texto completo antes de enviarlo: version, Android, modelo, modo,
--    mandos conectados y las ultimas lineas del registro. Sin cuentas ni datos personales.
--  - Se guarda en el esquema privado: solo los admins lo leen (admin_list_diagnostics).
--  - Limites: 5 por instalacion al dia y 300 en total al dia; se borran a los 30 dias.
-- =====================================================================================

create table private.diagnostics (
    id          uuid primary key default gen_random_uuid(),
    install_id  uuid not null,
    app_version text not null check (char_length(app_version) <= 20),
    android     text not null check (char_length(android) <= 20),
    device      text not null check (char_length(device) <= 60),
    mode        text not null check (char_length(mode) <= 40),
    message     text not null default '' check (char_length(message) <= 500),
    log         text not null check (octet_length(log) <= 32768),
    created_at  timestamptz not null default now()
);
create index diagnostics_install_idx on private.diagnostics (install_id, created_at desc);
create index diagnostics_recent_idx on private.diagnostics (created_at desc);
alter table private.diagnostics enable row level security;

-- Texto de una linea (sin caracteres de control) o bloque (permite saltos de linea y tabuladores).
create or replace function private.clean_text(p text, p_max integer, p_multiline boolean)
returns text language sql immutable set search_path = '' as $$
    select left(case when p_multiline
                     then regexp_replace(coalesce(p, ''), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g')
                     else btrim(regexp_replace(coalesce(p, ''), '[[:cntrl:]]', ' ', 'g')) end, p_max);
$$;

create or replace function public.submit_diagnostic(
    p_install uuid, p_app text, p_android text, p_device text, p_mode text, p_message text, p_log text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
    v_id uuid;
    v_log text := private.clean_text(p_log, 32000, true);
begin
    if p_install is null then
        perform private.fail('INVALID_INPUT', 'Falta el id de instalación.');
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_install::text || ':diag', 0));
    if (select count(*) from private.diagnostics
         where install_id = p_install and created_at > now() - interval '1 day') >= 5
       or (select count(*) from private.diagnostics where created_at > now() - interval '1 day') >= 300 then
        perform private.fail('RATE_LIMIT', 'Has enviado muchos diagnósticos hoy. Inténtalo mañana.');
    end if;
    while octet_length(v_log) > 32768 loop
        v_log := left(v_log, char_length(v_log) - 500);
    end loop;
    insert into private.diagnostics (install_id, app_version, android, device, mode, message, log)
    values (p_install, private.clean_text(p_app, 20, false), private.clean_text(p_android, 20, false),
            private.clean_text(p_device, 60, false), private.clean_text(p_mode, 40, false),
            private.clean_text(p_message, 500, true), v_log)
    returning id into v_id;
    return v_id;
end $$;

create or replace function public.admin_list_diagnostics(p_limit integer default 50)
returns table (id uuid, app_version text, android text, device text, mode text, message text, log text,
               created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
    perform private.require_admin();
    return query
        select d.id, d.app_version, d.android, d.device, d.mode, d.message, d.log, d.created_at
          from private.diagnostics d
         order by d.created_at desc
         limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create or replace function public.admin_delete_diagnostic(p_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    perform private.require_admin();
    delete from private.diagnostics where id = p_id;
end $$;

create or replace function private.cleanup_diagnostics()
returns void language sql security definer set search_path = '' as $$
    delete from private.diagnostics where created_at < now() - interval '30 days';
$$;

revoke execute on function public.submit_diagnostic(uuid, text, text, text, text, text, text),
    public.admin_list_diagnostics(integer), public.admin_delete_diagnostic(uuid) from public;
grant execute on function public.submit_diagnostic(uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_list_diagnostics(integer), public.admin_delete_diagnostic(uuid) to authenticated;
revoke execute on function private.clean_text(text, integer, boolean), private.cleanup_diagnostics()
    from public, anon, authenticated;

do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_cron') then
        perform cron.unschedule(jobid) from cron.job where jobname = 'limpiar-diagnosticos';
        perform cron.schedule('limpiar-diagnosticos', '23 4 * * *', 'select private.cleanup_diagnostics()');
    end if;
end $$;
