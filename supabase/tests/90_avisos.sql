\set ON_ERROR_STOP 1
-- Avisos: se crean solos, cada uno ve solo los suyos, se marcan como leidos, limite y limpieza.
-- Usuarios propios (a1 = autor, a2 = otro, a9 = admin): los de 01_ayudas se borran o bloquean en otras pruebas.
insert into auth.users values ('a0000000-0000-0000-0000-0000000000a1', '{}'), ('a0000000-0000-0000-0000-0000000000a2', '{}'),
    ('a0000000-0000-0000-0000-0000000000a9', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
    ('91', 'a0000000-0000-0000-0000-0000000000a1', '{"user_name":"avisos1"}', 'github'),
    ('92', 'a0000000-0000-0000-0000-0000000000a2', '{"user_name":"avisos2"}', 'github'),
    ('99', 'a0000000-0000-0000-0000-0000000000a9', '{"user_name":"admin9"}', 'github');
update public.authors set is_admin = true where id = 'a0000000-0000-0000-0000-0000000000a9';

set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a1', false);
select set_config('test.pid', public.publish_profile('com.avisos.x', 'Avisos X', 'Perfil avisos', '',
    E'package = com.avisos.x\nscreen = 2400x1080\nA = tap 1 1')::text, false);
-- Comentar en tu propio perfil no avisa.
select public.add_comment(current_setting('test.pid')::uuid, 'Mi propio comentario');
select t.check(public.unread_notification_count() = 0, 'sin aviso por comentar lo propio');

-- Otro comenta: aviso para el autor, con datos minimos (sin el texto del comentario).
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a2', false);
select public.add_comment(current_setting('test.pid')::uuid, 'Muy buen perfil');
select t.check(public.unread_notification_count() = 0, 'quien comenta no recibe aviso');
select t.check((select count(*) = 0 from public.notifications), 'no se ven los avisos ajenos');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a1', false);
select t.check(public.unread_notification_count() = 1, 'aviso de comentario');
select t.check((select kind = 'comment' and data ->> 'actor' = 'avisos2' and data ->> 'title' = 'Perfil avisos'
                  and data ->> 'profile_id' = current_setting('test.pid') and not data ? 'body' and read_at is null
                  from public.notifications), 'datos del aviso');
-- Nadie escribe en la tabla por el API.
select t.fails('insert into public.notifications (user_id, kind) values (''a0000000-0000-0000-0000-0000000000a1'', ''comment'')', 'permission denied');
select t.fails('update public.notifications set read_at = now()', 'permission denied');
select t.fails('delete from public.notifications', 'permission denied');
select t.fails('select user_id from public.notifications', 'permission denied');
select t.fails('select private.notify(''a0000000-0000-0000-0000-0000000000a1'', ''comment'')', 'permission denied');
reset role;

-- Visitantes: nada.
select set_config('test.uid', '', false);
set role anon;
select t.fails('select * from public.notifications', 'permission denied');
select t.fails('select public.unread_notification_count()', 'permission denied');
select t.fails('select public.mark_all_notifications_read()', 'permission denied');
reset role;

-- Marcar como leidos: los ajenos no cambian; los propios si.
select set_config('test.nid', (select id::text from public.notifications where user_id = 'a0000000-0000-0000-0000-0000000000a1'), false);
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a2', false);
select public.mark_notifications_read(array[current_setting('test.nid')::uuid]);
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a1', false);
select t.check(public.unread_notification_count() = 1, 'otro no marca mis avisos');
select t.fails(format('select public.mark_notifications_read(%L::uuid[])',
    (select array_agg(gen_random_uuid()) from generate_series(1, 101))), 'Demasiados');
select public.mark_notifications_read(array[current_setting('test.nid')::uuid]);
select t.check(public.unread_notification_count() = 0 and (select read_at is not null from public.notifications), 'leido');

-- Mando aprobado o rechazado: aviso con el nombre y la plataforma.
select public.submit_controller_mapping('03000000aaaa00000161000000000000,Pad Avisos,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,');
select public.submit_controller_mapping('03000000aaaa00000161000000000000,Pad Avisos,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Windows,');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a9', false);
select public.admin_review_controller_mapping((select id from public.admin_controller_mappings('pending')
    where name = 'Pad Avisos' and platform = 'Linux'), true);
select public.admin_review_controller_mapping((select id from public.admin_controller_mappings('pending')
    where name = 'Pad Avisos' and platform = 'Windows'), false);
-- Ocultar su perfil (moderacion): aviso.
select public.admin_set_profile_status(current_setting('test.pid')::uuid, 'hidden', false);
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a1', false);
select t.check(public.unread_notification_count() = 3, 'avisos de mando y de perfil oculto');
select t.check((select count(*) = 1 from public.notifications
                 where kind = 'mapping_approved' and data ->> 'name' = 'Pad Avisos' and data ->> 'platform' = 'Linux'), 'mando aprobado');
select t.check((select count(*) = 1 from public.notifications
                 where kind = 'mapping_rejected' and data ->> 'platform' = 'Windows'), 'mando rechazado');
select t.check((select count(*) = 1 from public.notifications
                 where kind = 'profile_hidden' and data ->> 'profile_id' = current_setting('test.pid')), 'perfil oculto');
select public.mark_all_notifications_read();
select t.check(public.unread_notification_count() = 0, 'todos leidos');
reset role;
-- Volver a publicarlo no avisa; volver a ocultarlo si.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a9', false);
select public.admin_set_profile_status(current_setting('test.pid')::uuid, 'published', true);
reset role;
select t.check((select count(*) = 4 from public.notifications where user_id = 'a0000000-0000-0000-0000-0000000000a1'), 'publicar no avisa');

-- Como mucho 200 por usuario (se borran los mas antiguos).
select private.notify('a0000000-0000-0000-0000-0000000000a1', 'comment', p_title => 'Masivo ' || n, p_actor => 'avisos2')
  from generate_series(1, 210) n;
select t.check((select count(*) = 200 from public.notifications where user_id = 'a0000000-0000-0000-0000-0000000000a1'), 'limite de 200');
-- Datos de la lista cerrada y limpios.
select private.notify('a0000000-0000-0000-0000-0000000000a1', 'comment', p_title => E'Hola\u0007' || repeat('x', 200),
    p_actor => '<script>', p_platform => 'Mac');
select t.check((select char_length(data ->> 'title') = 80 and data ->> 'title' !~ '[[:cntrl:]]' and not data ? 'actor'
                  and not data ? 'platform' from public.notifications order by created_at desc, id limit 1), 'datos saneados');

-- Limpieza: los de hace mas de 90 dias se borran.
update public.notifications set created_at = now() - interval '91 days'
 where user_id = 'a0000000-0000-0000-0000-0000000000a1' and data ->> 'title' like 'Masivo%';
select private.cleanup_notifications();
select t.check((select count(*) = 0 from public.notifications where data ->> 'title' like 'Masivo%'), 'avisos antiguos borrados');
select t.check((select count(*) >= 1 from public.notifications where user_id = 'a0000000-0000-0000-0000-0000000000a1'), 'los recientes siguen');
\echo avisos: OK
