\set ON_ERROR_STOP 1
-- Busqueda global: indices, misma visibilidad que siempre y uso del indice trigram.
-- Usuario propio (a3): los de 01_ayudas se borran o bloquean en otras pruebas.
insert into auth.users values ('a0000000-0000-0000-0000-0000000000a3', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
    ('93', 'a0000000-0000-0000-0000-0000000000a3', '{"user_name":"buscar3"}', 'github');

select t.check((select count(*) = 7 from pg_indexes where schemaname = 'public' and indexname in (
    'game_profiles_all_popular_idx', 'game_profiles_all_installs_idx', 'game_profiles_all_rating_idx',
    'game_profiles_all_recent_idx', 'game_profiles_all_ratio_idx', 'game_profiles_title_trgm_idx',
    'game_profiles_description_trgm_idx')), 'indices de la busqueda global');

set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a3', false);
select public.publish_profile('com.buscar.uno', 'Buscar Uno', 'Zigzag rapido', 'Para tablet', E'package = com.buscar.uno\nscreen = 2400x1080\nA = tap 1 1', 'Redmi Note 9');
select public.publish_profile('com.buscar.dos', 'Buscar Dos', 'Otro zigzag', '', E'package = com.buscar.dos\nscreen = 1920x1080\nA = tap 1 1', 'Samsung A52');
reset role;
update public.games set is_hidden = true where package = 'com.buscar.dos';

-- Visitante: busca en todos los juegos; los perfiles de juegos ocultos no salen.
select set_config('test.uid', '', false);
set role anon;
select t.check((select count(*) = 1 from public.game_profiles where status = 'published' and title ilike '%zigzag%'), 'busqueda por texto global');
select t.check((select count(*) = 1 from public.game_profiles where status = 'published' and description ilike '%tablet%'), 'busqueda en la descripcion');
select t.check((select count(*) = 1 from public.game_profiles where status = 'published' and device_model ilike 'Redmi %'
                  and screen_ratio between 2.17 and 2.27), 'marca y proporcion de pantalla');
reset role;
update public.games set is_hidden = false where package = 'com.buscar.dos';

-- Indices trigram (sirven para ilike '%texto%') solo sobre los perfiles publicados.
select t.check((select count(*) = 2 from pg_indexes where schemaname = 'public'
                 and indexname in ('game_profiles_title_trgm_idx', 'game_profiles_description_trgm_idx')
                 and indexdef like '%USING gin%gin_trgm_ops%' and indexdef like '%WHERE (status = ''published''::text)%'),
    'indices trigram');
\echo busqueda global: OK
