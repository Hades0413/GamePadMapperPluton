-- Ayudas para las pruebas.
create schema t;
grant usage on schema t to anon, authenticated, service_role;

-- Ejecuta SQL y exige que falle con un mensaje que contenga p_like.
create function t.fails(p_sql text, p_like text) returns void language plpgsql as $$
declare
    v_ok boolean := false;
    v_msg text := '(no fallo)';
begin
    begin
        execute p_sql;
    exception when others then
        v_msg := sqlerrm;
        v_ok := sqlerrm like '%' || p_like || '%';
    end;
    if not v_ok then
        raise exception 'PRUEBA FALLIDA: % debia fallar con «%», dio: %', p_sql, p_like, v_msg;
    end if;
end $$;

create function t.check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
    if p_ok is not true then
        raise exception 'PRUEBA FALLIDA: %', p_what;
    end if;
end $$;

grant execute on all functions in schema t to anon, authenticated, service_role;

-- Usuarios de prueba (entran con GitHub): admin, autor, fan y otro.
insert into auth.users values
    ('a0000000-0000-0000-0000-000000000001', '{}'), ('a0000000-0000-0000-0000-000000000002', '{}'),
    ('a0000000-0000-0000-0000-000000000003', '{}'), ('a0000000-0000-0000-0000-000000000004', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
    ('1', 'a0000000-0000-0000-0000-000000000001', '{"user_name":"admin","avatar_url":"https://avatars.githubusercontent.com/u/1"}', 'github'),
    ('2', 'a0000000-0000-0000-0000-000000000002', '{"user_name":"autor"}', 'github'),
    ('3', 'a0000000-0000-0000-0000-000000000003', '{"user_name":"fan"}', 'github'),
    ('4', 'a0000000-0000-0000-0000-000000000004', '{"user_name":"otro"}', 'github');
update public.authors set is_admin = true where username = 'admin';
