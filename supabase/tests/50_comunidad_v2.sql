\set ON_ERROR_STOP 1
-- Comunidad 1.6: etiquetas, comentarios, versiones, destacados y votos recientes.
-- Usuarios propios (5 = autor, 6 = otro): los de 01_ayudas se borran o bloquean en otras pruebas.
insert into auth.users values ('a0000000-0000-0000-0000-000000000015', '{}'), ('a0000000-0000-0000-0000-000000000016', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
    ('15', 'a0000000-0000-0000-0000-000000000015', '{"user_name":"autor5"}', 'github'),
    ('16', 'a0000000-0000-0000-0000-000000000016', '{"user_name":"otro6"}', 'github');
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000015', false);
select public.publish_profile('com.v2.x', 'V2 X', 'Perfil v2', '', E'package = com.v2.x\nscreen = 2400x1080\nA = tap 1 1');
select set_config('test.pid', (select id::text from public.game_profiles where title = 'Perfil v2'), false);

-- Etiquetas: solo de la lista, como mucho 4, solo el autor.
select public.set_profile_tags(current_setting('test.pid')::uuid, array['zurdo', 'casual', 'zurdo']);
select t.check((select tags = array['casual', 'zurdo'] from public.game_profiles where title = 'Perfil v2'), 'etiquetas sin repetir');
select t.fails(format('select public.set_profile_tags(%L, array[''hack''])', current_setting('test.pid')), 'INVALID_TAGS');
select t.fails(format('select public.set_profile_tags(%L, array[''casual'',''zurdo'',''tablet'',''xbox'',''playstation''])',
    current_setting('test.pid')), 'INVALID_TAGS');

-- Versiones: 1 al publicar, otra al cambiar el perfil (no al cambiar solo el titulo).
select public.update_profile(current_setting('test.pid')::uuid, 'Perfil v2', '', E'package = com.v2.x\nscreen = 2400x1080\nA = tap 2 2');
select public.update_profile(current_setting('test.pid')::uuid, 'Perfil v2 b', '', E'package = com.v2.x\nscreen = 2400x1080\nA = tap 2 2');
reset role;
select t.check((select count(*) = 2 from public.profile_versions where profile_id = current_setting('test.pid')::uuid), 'dos versiones');

-- Otro usuario no cambia etiquetas ajenas ni destaca; comenta con limites.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000016', false);
select t.fails(format('select public.set_profile_tags(%L, array[''casual''])', current_setting('test.pid')), 'NOT_FOUND');
select t.fails(format('select public.admin_feature_profile(%L, true)', current_setting('test.pid')), 'FORBIDDEN');
select public.add_comment(current_setting('test.pid')::uuid, '  Me   funciona   genial  ');
select t.check((select body = 'Me funciona genial' from public.profile_comments where profile_id = current_setting('test.pid')::uuid), 'comentario limpio');
select t.fails(format('select public.add_comment(%L, ''x'')', current_setting('test.pid')), 'INVALID_COMMENT');
select t.fails('insert into public.profile_comments (profile_id, author_id, body) values (gen_random_uuid(), gen_random_uuid(), ''hola'')', 'permission denied');
reset role;

-- El autor del perfil puede borrar comentarios de su perfil; un tercero no.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', false);
select t.fails(format('select public.delete_comment(%L)', (select id from public.profile_comments limit 1)), 'NOT_FOUND');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000015', false);
select public.delete_comment((select id from public.profile_comments limit 1));
reset role;
select t.check((select count(*) = 0 from public.profile_comments), 'comentario borrado por el autor del perfil');

-- Destacar (admin) y lectura publica.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
select public.admin_feature_profile(current_setting('test.pid')::uuid, true);
reset role;
set role anon;
select t.check((select featured_at is not null and tags = array['casual', 'zurdo'] from public.game_profiles where title = 'Perfil v2 b'), 'destacado visible');
select t.check((select count(*) = 2 from public.profile_versions where profile_id = current_setting('test.pid')::uuid), 'versiones visibles');
select t.fails('select public.add_comment(gen_random_uuid(), ''hola'')', 'permission denied');
reset role;

-- Votos recientes.
set role anon;
select public.register_install(current_setting('test.pid')::uuid, 'c0000000-0000-0000-0000-000000000001');
select public.rate_profile(current_setting('test.pid')::uuid, 'c0000000-0000-0000-0000-000000000001', false);
reset role;
select private.flush_stats();
select t.check((select recent_no = 1 and recent_yes = 0 from public.game_profiles where id = current_setting('test.pid')::uuid), 'votos recientes');
update public.profile_feedback set created_at = now() - interval '40 days';
select private.refresh_recent_stats();
select t.check((select recent_no = 0 from public.game_profiles where id = current_setting('test.pid')::uuid), 'votos antiguos dejan de contar');
\echo comunidad v2: OK
