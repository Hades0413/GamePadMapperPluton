\set ON_ERROR_STOP 1
-- Diagnosticos desde la app: cualquiera envia (con limite), solo los admins leen.
set role anon;
select t.check(public.submit_diagnostic('d0000000-0000-0000-0000-000000000001', '1.6', 'Android 15', 'Xiaomi 23129RA5FL',
    'accesibilidad', E'no toca\u0007 bien', E'linea 1\nlinea 2\u0001') is not null, 'enviar diagnostico');
select t.fails('select * from private.diagnostics', 'permission denied');
select t.fails('select * from public.admin_list_diagnostics()', 'permission denied');
do $$
declare
    i integer;
    v_ok boolean := false;
begin
    for i in 1..5 loop
        begin
            perform public.submit_diagnostic('d0000000-0000-0000-0000-000000000001', '1.6', 'A', 'B', 'C', '', 'x');
        exception when others then
            v_ok := sqlerrm like '%RATE_LIMIT%';
        end;
    end loop;
    perform t.check(v_ok, 'limite de diagnosticos por instalacion');
end $$;
reset role;
select t.check((select message = 'no toca bien' and log = E'linea 1\nlinea 2' from private.diagnostics
                 order by created_at limit 1), 'diagnostico limpio');

set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', false);
select t.fails('select * from public.admin_list_diagnostics()', 'FORBIDDEN');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
select t.check((select count(*) = 5 from public.admin_list_diagnostics()), 'el admin los lee');
select public.admin_delete_diagnostic((select id from public.admin_list_diagnostics(1)));
select t.check((select count(*) = 4 from public.admin_list_diagnostics()), 'el admin los borra');
reset role;
\echo diagnosticos: OK
