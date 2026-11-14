\set ON_ERROR_STOP 1
-- Instalaciones y valoraciones desde la app (sin cuenta, con id de instalacion aleatorio).
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
select public.publish_profile('com.est.x', 'Est X', 'Para estadisticas', '', E'package = com.est.x\nscreen = 2400x1080\nA = tap 1 1');
reset role;

set role anon;
-- Valorar sin haberlo instalado no cuenta.
select public.rate_profile((select id from public.game_profiles where title = 'Para estadisticas'), 'b0000000-0000-0000-0000-000000000001', true);
-- Dos instalaciones (una repetida) y valoraciones.
select public.register_install((select id from public.game_profiles where title = 'Para estadisticas'), 'b0000000-0000-0000-0000-000000000001');
select public.register_install((select id from public.game_profiles where title = 'Para estadisticas'), 'b0000000-0000-0000-0000-000000000001');
select public.register_install((select id from public.game_profiles where title = 'Para estadisticas'), 'b0000000-0000-0000-0000-000000000002');
select public.rate_profile((select id from public.game_profiles where title = 'Para estadisticas'), 'b0000000-0000-0000-0000-000000000001', true);
select public.rate_profile((select id from public.game_profiles where title = 'Para estadisticas'), 'b0000000-0000-0000-0000-000000000002', false);
select public.rate_profile((select id from public.game_profiles where title = 'Para estadisticas'), 'b0000000-0000-0000-0000-000000000002', true);
select t.fails('select * from public.profile_installs', 'permission denied');
select t.fails('update public.game_profiles set install_count = 999', 'permission denied');
reset role;

select private.flush_stats();
select t.check((select install_count = 2 and works_yes = 2 and works_no = 0 from public.game_profiles where title = 'Para estadisticas'),
    'contadores de instalaciones y valoraciones');

-- Limite por instalacion: 60 por hora.
do $$
declare
    i integer;
    v_ok boolean := false;
begin
    for i in 1..61 loop
        insert into public.game_profiles (package, author_id, title, conf, screen_w, screen_h, binding_count)
        values ('com.est.x', 'a0000000-0000-0000-0000-000000000001', 'Masivo ' || i, 'package = com.est.x', 2400, 1080, 1);
    end loop;
    begin
        perform public.register_install(id, 'b0000000-0000-0000-0000-000000000009')
           from public.game_profiles where title like 'Masivo %';
    exception when others then
        v_ok := sqlerrm like 'RATE_LIMIT%';
    end;
    if not v_ok then raise exception 'PRUEBA FALLIDA: limite de instalaciones'; end if;
end $$;
\echo estadisticas: OK
