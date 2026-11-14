\set ON_ERROR_STOP 1
-- «Me gusta»: dar, quitar, contador exacto y recuento programado.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', false);
select t.check((select liked and like_count = 1 from public.like_profile((select id from public.game_profiles where title = 'Basico'))), 'me gusta');
select t.check((select not liked and like_count = 0 from public.like_profile((select id from public.game_profiles where title = 'Basico'))), 'quitar me gusta');
select t.check((select liked from public.like_profile((select id from public.game_profiles where title = 'Basico'))), 'volver a dar');
select t.fails('update public.game_profiles set like_count = 999', 'permission denied');
reset role;
select private.flush_like_counts();
select t.check((select like_count = 1 from public.game_profiles where title = 'Basico'), 'contador tras el recuento');

-- Modelo y proporcion de pantalla.
select t.check((select device_model = 'Redmi Note 9' and screen_ratio = 2.222 from public.game_profiles where title = 'Basico'), 'modelo y proporcion');

-- Imagenes: el rol de servicio (funcion importar-juego) guarda URLs del Storage, nunca externas.
set role service_role;
update public.games set icon_url = 'https://abc.supabase.co/storage/v1/object/public/juegos/iconos/com.x.y.png?v=1' where package = 'com.x.y';
select t.fails('update public.games set background_url = ''https://evil.example.com/x.png'' where package = ''com.x.y''', 'games_background_url_check');
reset role;
select t.check((select icon_url is not null from public.games where package = 'com.x.y'), 'icono guardado por el servicio');

-- Usuarios normales no suben al Storage; los admins solo en iconos/ y fondos/.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', false);
select t.fails('insert into storage.objects (bucket_id, name) values (''juegos'', ''iconos/x.png'')', 'row-level security');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
insert into storage.objects (bucket_id, name) values ('juegos', 'fondos/com.x.y.jpg');
select t.fails('insert into storage.objects (bucket_id, name) values (''juegos'', ''otra/x.png'')', 'row-level security');
reset role;

-- Un juego oculto oculta sus perfiles a los visitantes.
update public.games set is_hidden = true where package = 'com.x.y';
set role anon;
select t.check((select count(*) = 0 from public.game_profiles where package = 'com.x.y'), 'juego oculto');
reset role;
update public.games set is_hidden = false where package = 'com.x.y';

-- Borrar la cuenta borra todo lo del usuario.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000002', false);
select public.delete_my_account();
reset role;
select t.check((select count(*) = 0 from public.game_profiles where title = 'Basico'), 'borrar cuenta');
\echo comunidad: OK
