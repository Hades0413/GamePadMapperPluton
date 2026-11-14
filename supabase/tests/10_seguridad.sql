\set ON_ERROR_STOP 1
-- Visitantes: solo leen lo publico; no escriben ni ven datos privados.
set role anon;
select t.fails('insert into public.games (package, name) values (''a.b'', ''xx'')', 'permission denied');
select t.fails('select is_admin from public.authors', 'permission denied');
select t.fails('select * from public.profile_reports', 'permission denied');
select t.fails('select * from public.edge_function_calls', 'permission denied');
select t.fails('select public.publish_profile(''com.x.y'', ''X'', ''Titulo'', '''', ''x'')', 'permission denied');
select t.fails('select public.like_profile(gen_random_uuid())', 'permission denied');
reset role;

-- Autor: publica; paquetes sensibles, perfiles mal formados y HTML rechazados.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
select t.check(public.publish_profile('com.x.y', 'Juego X', 'Basico', 'desc',
    E'package = com.x.y\nscreen = 2400x1080\nA = tap 1932 960\nLS = stick 344 828 112 dpad', 'Redmi Note 9') is not null, 'publicar');
select t.fails('select public.publish_profile(''com.android.vending'', ''P'', ''Titulo'', '''', E''package = com.android.vending\nscreen = 1000x500\nA = tap 1 1'')', 'INVALID_PACKAGE');
select t.fails('select public.publish_profile(''com.x.y'', ''X'', ''Titulo'', '''', E''package = com.x.y\nscreen = 1000x500\nA = tap 2000 1'')', 'fuera de la pantalla');
select t.fails('select public.publish_profile(''com.x.y'', ''X'', ''<b>x</b>'', '''', E''package = com.x.y\nscreen = 1000x500\nA = tap 1 1'')', '< ni >');
select t.fails('select public.publish_profile(''com.x.y'', ''X'', ''Titulo'', '''', E''package = com.x.y\nscreen = 1000x500\nA = tap 1 1'', ''<script>'')', 'INVALID_DEVICE');
select t.fails('update public.authors set is_admin = true', 'permission denied');
reset role;

-- Otro usuario no puede editar ni borrar lo ajeno ni moderar.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000004', false);
select t.fails(format('select public.update_profile(%L, ''Hack'', '''', E''package = com.x.y\nscreen = 2400x1080\nA = tap 1 1'')',
    (select id from public.game_profiles where title = 'Basico')), 'NOT_FOUND');
select t.fails(format('select public.delete_profile(%L)', (select id from public.game_profiles where title = 'Basico')), 'NOT_FOUND');
select t.fails('select * from public.admin_reported_profiles()', 'FORBIDDEN');
reset role;

-- Suplantacion: editar los metadatos no cambia el nombre publico (sale de la identidad de GitHub).
update auth.users set raw_user_meta_data = '{"user_name":"admin"}' where id = 'a0000000-0000-0000-0000-000000000004';
select t.check((select username from public.authors where id = 'a0000000-0000-0000-0000-000000000004') = 'otro', 'no suplantar');

-- Bloqueo por cuenta de GitHub: sobrevive a borrar la cuenta y volver.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
select public.admin_set_banned('a0000000-0000-0000-0000-000000000004', true);
reset role;
delete from auth.users where id = 'a0000000-0000-0000-0000-000000000004';
insert into auth.users values ('a0000000-0000-0000-0000-000000000005', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider)
    values ('4', 'a0000000-0000-0000-0000-000000000005', '{"user_name":"otro"}', 'github');
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000005', false);
select t.fails('select public.publish_profile(''com.x.y'', ''X'', ''Vuelvo'', '''', E''package = com.x.y\nscreen = 1000x500\nA = tap 1 1'')', 'BANNED');
reset role;
\echo seguridad: OK
