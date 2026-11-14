\set ON_ERROR_STOP 1
-- Copia en la nube de los perfiles (app): validacion, solo las filas propias, limites y borrado
-- con la cuenta. Usuarios propios b1..b9 (los de 01_ayudas se borran o bloquean en otras pruebas).
insert into auth.users values
    ('a0000000-0000-0000-0000-0000000000b1', '{}'), ('a0000000-0000-0000-0000-0000000000b2', '{}'),
    ('a0000000-0000-0000-0000-0000000000b3', '{}'), ('a0000000-0000-0000-0000-0000000000b4', '{}'),
    ('a0000000-0000-0000-0000-0000000000b5', '{}'), ('a0000000-0000-0000-0000-0000000000b6', '{}'),
    ('a0000000-0000-0000-0000-0000000000b9', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
    ('b1', 'a0000000-0000-0000-0000-0000000000b1', '{"user_name":"copias1"}', 'github'),
    ('b2', 'a0000000-0000-0000-0000-0000000000b2', '{"user_name":"copias2"}', 'github'),
    ('b3', 'a0000000-0000-0000-0000-0000000000b3', '{"user_name":"copias3"}', 'github'),
    ('b4', 'a0000000-0000-0000-0000-0000000000b4', '{"user_name":"copias4"}', 'github'),
    ('b5', 'a0000000-0000-0000-0000-0000000000b5', '{"user_name":"copias5"}', 'github'),
    ('b6', 'a0000000-0000-0000-0000-0000000000b6', '{"user_name":"copias6"}', 'github');
-- b9: sesion sin autor (no entro con GitHub).

select set_config('test.conf', E'# Mi perfil\r\npackage = com.ejemplo.juego\nname = Prueba\nscreen = 2400x1080\nA = tap 100 200\n', false);

-- Visitantes: ni leen ni llaman a las funciones.
select set_config('test.uid', '', false);
set role anon;
select t.fails('select * from public.profile_backups', 'permission denied');
select t.fails(format('select public.backup_put(%L, %L)', 'a.conf', current_setting('test.conf')), 'permission denied');
select t.fails('select * from public.backup_list()', 'permission denied');
select t.fails('select * from public.backup_get(''a.conf'')', 'permission denied');
select t.fails('select public.backup_delete(''a.conf'')', 'permission denied');
select t.fails('select public.backup_delete_all()', 'permission denied');
select t.fails('select private.backup_conf(''a.conf'', ''x'')', 'permission denied');
reset role;

set role authenticated;
-- Sin sesion o sin autor: AUTH_REQUIRED.
select t.fails(format('select public.backup_put(%L, %L)', 'a.conf', current_setting('test.conf')), 'AUTH_REQUIRED');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000b9', false);
select t.fails(format('select public.backup_put(%L, %L)', 'a.conf', current_setting('test.conf')), 'AUTH_REQUIRED');

-- b1 sube, lista y recupera (CRLF normalizado).
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000b1', false);
select public.backup_put('com.ejemplo.juego.conf', current_setting('test.conf'));
select public.backup_put('com.ejemplo.juego-2.conf', current_setting('test.conf'));
select t.check((select count(*) = 2 from public.backup_list()), 'b1 lista sus 2 perfiles');
select t.check((select conf = replace(current_setting('test.conf'), E'\r\n', E'\n')
                  from public.backup_get('com.ejemplo.juego.conf')), 'b1 recupera el perfil normalizado');
-- Subir otra vez el mismo archivo lo sustituye (no duplica).
select public.backup_put('com.ejemplo.juego.conf', current_setting('test.conf') || E'B = tap 300 400\n');
select t.check((select count(*) = 2 from public.backup_list()), 'sustituir no duplica');
select t.check((select conf like '%B = tap 300 400%' from public.backup_get('com.ejemplo.juego.conf')), 'contenido nuevo');
select t.check((select count(*) = 2 from public.profile_backups), 'RLS: b1 ve sus filas');
-- Escribir directamente en la tabla: prohibido.
select t.fails('insert into public.profile_backups (user_id, file_name, conf) values (auth.uid(), ''x.conf'', ''package = a.b'')', 'permission denied');
select t.fails('update public.profile_backups set conf = ''package = a.b''', 'permission denied');
select t.fails('delete from public.profile_backups', 'permission denied');

-- Nombres y perfiles no validos.
select t.fails(format('select public.backup_put(%L, %L)', '../evil.conf', current_setting('test.conf')), 'INVALID_NAME');
select t.fails(format('select public.backup_put(%L, %L)', 'dir/x.conf', current_setting('test.conf')), 'INVALID_NAME');
select t.fails(format('select public.backup_put(%L, %L)', 'x.txt', current_setting('test.conf')), 'INVALID_NAME');
select t.fails(format('select public.backup_put(%L, %L)', '.conf', current_setting('test.conf')), 'INVALID_NAME');
select t.fails(format('select public.backup_put(%L, %L)', repeat('a', 121) || '.conf', current_setting('test.conf')), 'INVALID_NAME');
select t.fails(format('select public.backup_put(%L, %L)', E'a\n.conf', current_setting('test.conf')), 'INVALID_NAME');
select t.fails(format('select public.backup_put(%L, %L)', null, current_setting('test.conf')), 'INVALID_NAME');
select t.fails(format('select public.backup_put(%L, %L)', 'a.conf', 'A = tap 1 2'), 'falta «package');
select t.fails(format('select public.backup_put(%L, %L)', 'a.conf', '   '), 'vacío');
select t.fails(format('select public.backup_put(%L, %L)', 'a.conf', E'package = a.b\nA = tap 1 2\u0007'), 'caracteres no permitidos');
select t.fails(format('select public.backup_put(%L, %L)', 'a.conf', E'package = a.b\n' || repeat('# relleno ', 1700)), 'demasiado grande');
select t.fails(format('select public.backup_put(%L, %L)', 'a.conf', repeat('x', 100000)), 'demasiado grande');
select t.check(public.backup_put('ok_max-1.2.conf', E'Package = Com.Ejemplo.Juego   # comentario\nA = tap 1 2') is not null,
               'package sin distinguir mayusculas y con comentario');
select public.backup_delete('ok_max-1.2.conf');

-- b2 no ve ni toca lo de b1.
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000b2', false);
select t.check((select count(*) = 0 from public.profile_backups), 'RLS: b2 no ve las copias de b1');
select t.check((select count(*) = 0 from public.backup_list()), 'b2 lista vacia');
select t.fails('select * from public.backup_get(''com.ejemplo.juego.conf'')', 'NOT_FOUND');
select t.fails('select public.backup_delete(''com.ejemplo.juego.conf'')', 'NOT_FOUND');
select t.check(public.backup_delete_all() = 0, 'b2 borrar todo no toca lo de b1');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000b1', false);
select t.check((select count(*) = 2 from public.backup_list()), 'b1 conserva sus perfiles');
-- Borrar uno y luego todo.
select public.backup_delete('com.ejemplo.juego-2.conf');
select t.check((select count(*) = 1 from public.backup_list()), 'borrar uno');
select t.fails('select public.backup_delete(''com.ejemplo.juego-2.conf'')', 'NOT_FOUND');
select t.check(public.backup_delete_all() = 1, 'borrar toda la copia');
select t.check((select count(*) = 0 from public.backup_list()), 'copia vacia');
reset role;

-- Maximo 200 archivos por cuenta (sustituir uno existente si se puede).
insert into public.profile_backups (user_id, file_name, conf)
select 'a0000000-0000-0000-0000-0000000000b3', 'p' || i || '.conf', 'package = a.b' from generate_series(1, 200) i;
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000b3', false);
select t.fails(format('select public.backup_put(%L, %L)', 'nuevo.conf', current_setting('test.conf')), 'LIMIT');
select t.check(public.backup_put('p7.conf', current_setting('test.conf')) is not null, 'con 200 se puede sustituir uno');
select t.check((select count(*) = 200 from public.backup_list()), 'la lista devuelve los 200');
reset role;

-- Limite de uso diario.
insert into private.action_log (user_id, action)
select 'a0000000-0000-0000-0000-0000000000b4', 'backup_put' from generate_series(1, 1000);
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000b4', false);
select t.fails(format('select public.backup_put(%L, %L)', 'a.conf', current_setting('test.conf')), 'RATE_LIMIT');
reset role;

-- Bloqueado: no usa la copia.
update public.authors set is_banned = true where id = 'a0000000-0000-0000-0000-0000000000b6';
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000b6', false);
select t.fails('select * from public.backup_list()', 'BANNED');
reset role;

-- Borrar la cuenta borra la copia.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000b5', false);
select public.backup_put('com.ejemplo.juego.conf', current_setting('test.conf'));
select public.delete_my_account();
reset role;
select t.check((select count(*) = 0 from public.profile_backups where user_id = 'a0000000-0000-0000-0000-0000000000b5'),
               'borrar la cuenta borra su copia');
select t.check((select count(*) = 200 from public.profile_backups where user_id = 'a0000000-0000-0000-0000-0000000000b3'),
               'las copias de otros siguen');
select set_config('test.uid', '', false);
\echo copias en la nube: OK
