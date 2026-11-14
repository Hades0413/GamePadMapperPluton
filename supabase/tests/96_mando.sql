\set ON_ERROR_STOP 1
-- Mando de cada perfil (controller_model) y su tipo (controller_type): limpieza, tipo calculado
-- por la base de datos, llamadas antiguas sin el parametro nuevo, filtros y lectura publica.
-- Usuarios propios c1..c9 (los de 01_ayudas se borran o bloquean en otras pruebas).
insert into auth.users values
    ('a0000000-0000-0000-0000-0000000000c1', '{}'), ('a0000000-0000-0000-0000-0000000000c2', '{}'),
    ('a0000000-0000-0000-0000-0000000000c3', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
    ('c1', 'a0000000-0000-0000-0000-0000000000c1', '{"user_name":"mando1"}', 'github'),
    ('c2', 'a0000000-0000-0000-0000-0000000000c2', '{"user_name":"mando2"}', 'github'),
    ('c3', 'a0000000-0000-0000-0000-0000000000c3', '{"user_name":"mando3"}', 'github');

-- Estructura: columnas, indices y una sola version de cada funcion.
select t.check((select count(*) = 2 from information_schema.columns where table_schema = 'public'
                 and table_name = 'game_profiles' and column_name in ('controller_model', 'controller_type')), 'columnas');
select t.check((select count(*) = 2 from pg_indexes where schemaname = 'public'
                 and indexname in ('game_profiles_controller_idx', 'game_profiles_all_controller_idx')), 'indices');
select t.check((select count(*) = 1 from pg_proc where proname = 'publish_profile'), 'una sola publish_profile');
select t.check((select count(*) = 1 from pg_proc where proname = 'update_profile'), 'una sola update_profile');

-- Tipo a partir del texto (ids del fabricante, palabras del nombre o nada).
select t.check(private.controller_type(v) is not distinct from e, format('tipo de %L = %L', v, e))
  from (values
    ('Wireless Controller (054c:05c4)', 'playstation'), ('Wireless Controller', 'playstation'),
    ('DualSense Wireless Controller', 'playstation'), ('Sony PS4 pad', 'playstation'),
    ('Xbox Wireless Controller (045e:0b13)', 'xbox'), ('Xbox One S', 'xbox'), ('PDP Wired (0e6f:02a8)', 'xbox'),
    ('PowerA (24c6:543a)', 'xbox'), ('Pro Controller (057e:2009)', 'nintendo'), ('Joy-Con (L)', 'nintendo'),
    ('8BitDo Pro 2', '8bitdo'), ('8BitDo Pro 2 (045e:02e0)', '8bitdo'), ('Pro 2 (2dc8:6006)', '8bitdo'),
    ('8Bitdo SN30 Pro', '8bitdo'), ('Gamepad (0079:0011)', 'generico'), ('ShanWan Gamepad', 'generico'),
    ('Generic USB Joystick', 'generico'), ('Mi mando', 'generico'), ('Redmi K50', 'otro'),
    (null, null), ('', null), ('   ', null)
  ) as c(v, e);

-- Visitantes: leen las columnas nuevas, pero no llaman a las funciones privadas ni escriben.
set role anon;
select set_config('test.uid', '', false);
select t.check((select count(*) >= 0 from public.game_profiles where controller_type = 'xbox' and controller_model is not null),
               'anon lee controller_model y controller_type');
select t.fails('select private.controller_type(''x'')', 'permission denied');
select t.fails('select private.clean_controller(''x'')', 'permission denied');
select t.fails(format('select public.publish_profile(p_package => %L, p_game_name => %L, p_title => %L, p_description => %L, p_conf => %L, p_controller_model => %L)',
               'com.mando.uno', 'Mando Uno', 'Anonimo', '', E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 1 1', 'Xbox'),
               'permission denied');
reset role;

set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000c1', false);
-- Con el mando (por nombre, como la web nueva): tipo calculado.
select set_config('test.p1', public.publish_profile(p_package => 'com.mando.uno', p_game_name => 'Mando Uno',
    p_title => 'Con mando', p_description => '', p_conf => E'# modelo: Redmi Note 9\n# mando: Wireless Controller (054c:05c4)\npackage = com.mando.uno\nscreen = 2400x1080\nA = tap 1 1',
    p_device => 'Redmi Note 9', p_controller_model => '  Wireless   Controller (054c:05c4) ')::text, false);
select t.check((select controller_model = 'Wireless Controller (054c:05c4)' and controller_type = 'playstation'
                  and device_model = 'Redmi Note 9' and conf like '# modelo: Redmi Note 9%'
                  from public.game_profiles where id = current_setting('test.p1')::uuid), 'publicar con mando');
-- Llamadas antiguas: por nombre sin el mando (web anterior) y por posicion con 5 y 6 argumentos.
select set_config('test.p2', public.publish_profile(p_package => 'com.mando.uno', p_game_name => 'Mando Uno',
    p_title => 'Sin mando', p_description => '', p_conf => E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 1 1',
    p_device => 'Pixel 7')::text, false);
select t.check((select controller_model is null and controller_type is null from public.game_profiles
                 where id = current_setting('test.p2')::uuid), 'llamada antigua por nombre: sin mando');
select t.check(public.publish_profile('com.mando.uno', 'Mando Uno', 'Cinco args', '', E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 1 1') is not null,
               'llamada antigua con 5 argumentos');
select t.check(public.publish_profile('com.mando.uno', 'Mando Uno', 'Seis args', '', E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 1 1', '') is not null,
               'llamada antigua con 6 argumentos');

-- Mandos no validos: se rechazan (nada de HTML, comillas, punto y coma, saltos raros ni unicode).
select t.fails(format('select public.publish_profile(p_package => %L, p_game_name => %L, p_title => %L, p_description => %L, p_conf => %L, p_controller_model => %L)',
               'com.mando.uno', 'Mando Uno', 'Malo', '', E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 1 1', v), 'INVALID_CONTROLLER')
  from unnest(array['<script>alert(1)</script>', 'x''; drop table public.game_profiles; --', 'a', repeat('x', 61),
                    'DualSense™', '# mando', '-Xbox', 'Pad%', 'Pad_*', E'Pad\u0007', 'Pad\\n', 'Mando ñ', 'Pad,1',
                    '${jndi:x}']) as v;
select t.check((select count(*) = 4 from public.game_profiles where package = 'com.mando.uno'), 'los malos no se guardan');

-- Editar: null = no tocar; '' = quitar; otro = cambiar (y su tipo).
select public.update_profile(current_setting('test.p1')::uuid, 'Con mando', '', E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 2 2');
select t.check((select controller_type = 'playstation' from public.game_profiles where id = current_setting('test.p1')::uuid),
               'editar sin el mando (llamada antigua) no lo toca');
select public.update_profile(p_id => current_setting('test.p1')::uuid, p_title => 'Con mando', p_description => '',
    p_conf => E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 2 2', p_device => null, p_controller_model => '8BitDo Ultimate');
select t.check((select controller_model = '8BitDo Ultimate' and controller_type = '8bitdo' and device_model = 'Redmi Note 9'
                  from public.game_profiles where id = current_setting('test.p1')::uuid), 'editar el mando cambia el tipo');
select t.fails(format('select public.update_profile(p_id => %L, p_title => %L, p_description => %L, p_conf => %L, p_controller_model => %L)',
               current_setting('test.p1'), 'Con mando', '', E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 2 2', '<b>x</b>'),
               'INVALID_CONTROLLER');
select public.update_profile(p_id => current_setting('test.p1')::uuid, p_title => 'Con mando', p_description => '',
    p_conf => E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 2 2', p_controller_model => '');
select t.check((select controller_model is null and controller_type is null from public.game_profiles
                 where id = current_setting('test.p1')::uuid), 'editar con '''' quita el mando');

-- Nadie escribe directamente (ni el tipo ni el mando).
select t.fails(format('update public.game_profiles set controller_type = %L where id = %L', 'xbox', current_setting('test.p1')), 'permission denied');
select t.fails(format('update public.game_profiles set controller_model = %L where id = %L', 'Xbox', current_setting('test.p1')), 'permission denied');

-- c2 no edita el mando de c1.
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000c2', false);
select t.fails(format('select public.update_profile(p_id => %L, p_title => %L, p_description => %L, p_conf => %L, p_controller_model => %L)',
               current_setting('test.p1'), 'Mio', '', E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 2 2', 'Xbox'), 'NOT_FOUND');
select public.publish_profile(p_package => 'com.mando.dos', p_game_name => 'Mando Dos', p_title => 'Xbox dos', p_description => '',
    p_conf => E'package = com.mando.dos\nscreen = 1920x1080\nA = tap 1 1', p_controller_model => 'Xbox Wireless Controller (045e:0b13)');
select public.publish_profile(p_package => 'com.mando.uno', p_game_name => 'Mando Uno', p_title => 'Xbox uno', p_description => '',
    p_conf => E'package = com.mando.uno\nscreen = 2400x1080\nA = tap 1 1', p_controller_model => 'Xbox One S');
reset role;

-- Aunque alguien con permisos escriba un tipo a mano, el disparador lo recalcula del texto.
update public.game_profiles set controller_type = 'nintendo' where title = 'Xbox uno';
select t.check((select controller_type = 'xbox' from public.game_profiles where title = 'Xbox uno'), 'el tipo siempre sale del texto');

-- Filtros como los de la web (visitante): por juego y tipo, y en todos los juegos.
select set_config('test.uid', '', false);
set role anon;
select t.check((select count(*) = 1 from public.game_profiles where status = 'published' and package = 'com.mando.uno'
                 and controller_type = 'xbox'), 'filtro por juego y tipo');
select t.check((select count(*) = 2 from public.game_profiles where status = 'published' and controller_type = 'xbox'),
               'filtro global por tipo');
select t.check((select count(*) = 1 from public.game_profiles where status = 'published' and controller_type = 'xbox'
                 and screen_ratio between 1.74 and 1.81), 'tipo y proporcion de pantalla');
reset role;
\echo mando de los perfiles: OK
