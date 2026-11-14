\set ON_ERROR_STOP 1
-- Mandos de la comunidad (lineas SDL): validacion, limites, visibilidad y moderacion.
-- Usuarios propios (25 = autor, 26 = otro): los de 01_ayudas se borran o bloquean en otras pruebas.
insert into auth.users values ('a0000000-0000-0000-0000-000000000025', '{}'), ('a0000000-0000-0000-0000-000000000026', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
    ('25', 'a0000000-0000-0000-0000-000000000025', '{"user_name":"mandos25"}', 'github'),
    ('26', 'a0000000-0000-0000-0000-000000000026', '{"user_name":"mandos26"}', 'github');

-- Linea de ejemplo (8BitDo SN30 Pro, Linux).
select set_config('test.sdl', '03000000c82d00000161000000000000,8BitDo SN30 Pro,a:b1,b:b0,back:b10,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1,leftshoulder:b6,leftstick:b13,lefttrigger:b8,leftx:a0,lefty:a1,rightshoulder:b7,rightstick:b14,righttrigger:b9,rightx:a2,righty:a3,start:b11,x:b4,y:b3,platform:Linux,', false);

-- Forma canonica: GUID en minusculas, controles en orden fijo, platform al final.
select t.check((select mapping = '03000000c82d00000161000000000000,8BitDo SN30 Pro,a:b1,b:b0,x:b4,y:b3,back:b10,start:b11,leftstick:b13,rightstick:b14,leftshoulder:b6,rightshoulder:b7,dpup:h0.1,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,leftx:a0,lefty:a1,rightx:a2,righty:a3,lefttrigger:b8,righttrigger:b9,platform:Linux,'
                  from private.canonical_sdl(current_setting('test.sdl'))), 'linea canonica');
select t.check((select guid = '03000000c82d00000161000000000000' and name = 'Pad X' and platform = 'Windows'
                  and mapping = '03000000c82d00000161000000000000,Pad X,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,leftx:-a0~,platform:Windows,'
                  from private.canonical_sdl(E'  03000000C82D00000161000000000000,  Pad   X ,platform:Windows,start:b7,leftx:-a0~,y:b3,x:b2,b:b1,a:b0,back:b6\n')),
    'guid en minusculas, espacios y orden');

-- Lineas rechazadas.
select t.fails($q$select * from private.canonical_sdl('03000000c82d0000016100000000000,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,')$q$, 'GUID');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000zzz,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,')$q$, 'GUID');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,hack:b7,platform:Linux,')$q$, 'desconocido');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,start:x7,platform:Linux,')$q$, 'Valor no válido');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,start:h0.3,platform:Linux,')$q$, 'Valor no válido');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,start:b1234,platform:Linux,')$q$, 'Valor no válido');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,<script>alert(1)</script>,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,')$q$, '< ni >');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,P,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,')$q$, 'entre 2 y 80');
select t.fails(format('select * from private.canonical_sdl(%L)', '03000000c82d00000161000000000000,Pad,' || repeat('a:b0,', 220) || 'platform:Linux,'), 'demasiado larga');
select t.fails(format('select * from private.canonical_sdl(%L)', repeat('x', 100000)), 'demasiado larga');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,')$q$, 'Falta la plataforma');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Mac,')$q$, 'Windows o Linux');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,b:b1,x:b2,platform:Linux,')$q$, 'al menos 6');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,a:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,')$q$, 'repetido');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,platform:Windows,')$q$, 'repetida');
select t.fails($q$select * from private.canonical_sdl('03000000c82d00000161000000000000,Pad,a:b0,b:b1,x:b2,y:b3,back:b6,startb7,platform:Linux,')$q$, 'nombre:valor');
select t.fails(format('select * from private.canonical_sdl(%L)', E'03000000c82d00000161000000000000,Pad\u0007,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,'), 'caracteres no permitidos');
select t.fails(format('select * from private.canonical_sdl(%L)', E'03000000c82d00000161000000000000,Pad,a:b0,\nb:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,'), 'caracteres no permitidos');
select t.fails($q$select * from private.canonical_sdl('hola')$q$, 'No parece una línea SDL');

-- Visitantes: no envian, no escriben, no llaman a funciones internas.
select set_config('test.uid', '', false);
set role anon;
select t.fails(format('select public.submit_controller_mapping(%L)', current_setting('test.sdl')), 'permission denied');
select t.fails('select public.delete_controller_mapping(gen_random_uuid())', 'permission denied');
select t.fails('select * from public.admin_controller_mappings()', 'permission denied');
select t.fails('select public.admin_review_controller_mapping(gen_random_uuid(), true)', 'permission denied');
select t.fails('select * from private.canonical_sdl(''x'')', 'permission denied');
select t.fails('insert into public.controller_mappings (guid, name, platform, mapping, author_id) values (''x'', ''x'', ''Linux'', ''x'', gen_random_uuid())', 'permission denied');
reset role;

-- Autor: envia (se guarda canonico y pendiente) y lo ve; nadie mas lo ve.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000025', false);
select set_config('test.m1', public.submit_controller_mapping(upper(left(current_setting('test.sdl'), 32)) || substr(current_setting('test.sdl'), 33))::text, false);
select t.check((select status = 'pending' and guid = '03000000c82d00000161000000000000' and mapping like '%,a:b1,b:b0,x:b4,%'
                  from public.controller_mappings where id = current_setting('test.m1')::uuid), 'el autor ve su envio pendiente y canonico');
-- Reenviar el mismo mando y plataforma actualiza el pendiente (no duplica).
select t.check(public.submit_controller_mapping(replace(current_setting('test.sdl'), '8BitDo SN30 Pro', '8BitDo SN30 Pro v2'))::text
               = current_setting('test.m1'), 'reenviar actualiza el pendiente');
select t.check((select count(*) = 1 and min(name) = '8BitDo SN30 Pro v2' from public.controller_mappings), 'sin duplicados');
select t.fails('update public.controller_mappings set status = ''approved''', 'permission denied');
select t.fails(format('select public.admin_review_controller_mapping(%L, true)', current_setting('test.m1')), 'FORBIDDEN');
select t.fails('select * from public.admin_controller_mappings()', 'FORBIDDEN');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000026', false);
select t.check((select count(*) = 0 from public.controller_mappings), 'otro usuario no ve pendientes ajenos');
select t.fails(format('select public.delete_controller_mapping(%L)', current_setting('test.m1')), 'NOT_FOUND');
reset role;
select set_config('test.uid', '', false);
set role anon;
select t.check((select count(*) = 0 from public.controller_mappings), 'anon no ve pendientes');
reset role;

-- Admin: lista los pendientes con el autor y aprueba; entonces es publico.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
select t.check((select count(*) = 1 and min(username) = 'mandos25' from public.admin_controller_mappings('pending')), 'admin ve pendientes');
select t.fails('select * from public.admin_controller_mappings(''otro'')', 'INVALID_STATUS');
select public.admin_review_controller_mapping(current_setting('test.m1')::uuid, true);
reset role;
select set_config('test.uid', '', false);
set role anon;
select t.check((select count(*) = 1 from public.controller_mappings where status = 'approved' and platform = 'Linux'), 'anon ve aprobados');
select t.check((select reviewed_at is not null from public.controller_mappings where id = current_setting('test.m1')::uuid), 'fecha de revision');
reset role;

-- Ya aprobado e identico: aviso amable. El autor no puede borrar un aprobado.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000026', false);
select t.fails(format('select public.submit_controller_mapping(%L)', replace(current_setting('test.sdl'), '8BitDo SN30 Pro', '8BitDo SN30 Pro v2')), 'ALREADY_EXISTS');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000025', false);
select t.fails(format('select public.delete_controller_mapping(%L)', current_setting('test.m1')), 'NOT_FOUND');
-- Otra version del mismo mando (otro autor): al aprobarla, sustituye (borra) a la anterior.
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000026', false);
select set_config('test.m2', public.submit_controller_mapping(replace(current_setting('test.sdl'), 'a:b1,b:b0', 'a:b0,b:b1'))::text, false);
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
select public.admin_review_controller_mapping(current_setting('test.m2')::uuid, true);
reset role;
select t.check((select count(*) = 1 from public.controller_mappings where status = 'approved'), 'un solo aprobado por mando');
select t.check((select id::text = current_setting('test.m2') from public.controller_mappings where status = 'approved'), 'el nuevo sustituye al viejo');
select t.check(not exists (select 1 from public.controller_mappings where id = current_setting('test.m1')::uuid), 'el viejo se borra');

-- Rechazar y borrar: el autor borra sus rechazados; el admin, cualquiera.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000025', false);
select set_config('test.m3', public.submit_controller_mapping(replace(current_setting('test.sdl'), 'platform:Linux', 'platform:Windows'))::text, false);
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
select public.admin_review_controller_mapping(current_setting('test.m3')::uuid, false);
select t.check((select count(*) = 1 from public.admin_controller_mappings('rejected')), 'admin ve rechazados');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000026', false);
select t.check((select count(*) = 1 from public.controller_mappings), 'los rechazados ajenos no se ven');
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000025', false);
select t.check((select status = 'rejected' from public.controller_mappings where id = current_setting('test.m3')::uuid), 'el autor ve su rechazado');
select public.delete_controller_mapping(current_setting('test.m3')::uuid);
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000001', false);
select public.delete_controller_mapping(current_setting('test.m2')::uuid);
reset role;
select t.check((select count(*) = 0 from public.controller_mappings), 'borrados');

-- Limite diario: 10 envios al dia (tambien cuentan los reenvios).
delete from private.action_log;
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000026', false);
do $$
declare
    i integer;
begin
    for i in 1..10 loop
        perform public.submit_controller_mapping(current_setting('test.sdl'));
    end loop;
end $$;
select t.fails(format('select public.submit_controller_mapping(%L)', current_setting('test.sdl')), 'RATE_LIMIT');
reset role;

-- Como mucho 20 pendientes por autor.
delete from private.action_log;
insert into public.controller_mappings (guid, name, platform, mapping, author_id)
select g, 'Pad', 'Linux', g || ',Pad,a:b0,b:b1,x:b2,y:b3,back:b6,start:b7,platform:Linux,', 'a0000000-0000-0000-0000-000000000025'
  from (select lpad(to_hex(n), 32, '0') g from generate_series(1, 20) n) s;
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000025', false);
select t.fails(format('select public.submit_controller_mapping(%L)', current_setting('test.sdl')), 'LIMIT');
reset role;

-- Autor bloqueado: sus mandos dejan de verse (tambien los aprobados).
update public.controller_mappings set status = 'approved' where author_id = 'a0000000-0000-0000-0000-000000000025'
   and guid = lpad(to_hex(1), 32, '0');
select set_config('test.uid', '', false);
set role anon;
select t.check((select count(*) = 1 from public.controller_mappings), 'aprobado visible');
reset role;
update public.authors set is_banned = true where id = 'a0000000-0000-0000-0000-000000000025';
select set_config('test.uid', '', false);
set role anon;
select t.check((select count(*) = 0 from public.controller_mappings), 'los de un bloqueado no se ven');
reset role;
-- Un bloqueado no envia ni borra (private.require_author), aunque tenga sesion.
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000025', false);
select t.fails(format('select public.submit_controller_mapping(%L)', current_setting('test.sdl')), 'BANNED');
select t.fails(format('select public.delete_controller_mapping(%L)',
    (select id from public.controller_mappings where status = 'pending' limit 1)), 'BANNED');
-- Sesion sin cuenta de autor (usuario inexistente): tampoco.
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000ff', false);
select t.fails(format('select public.submit_controller_mapping(%L)', current_setting('test.sdl')), 'AUTH_REQUIRED');
select set_config('test.uid', '', false);
select t.fails(format('select public.submit_controller_mapping(%L)', current_setting('test.sdl')), 'AUTH_REQUIRED');
reset role;
update public.authors set is_banned = false where id = 'a0000000-0000-0000-0000-000000000025';

-- Limpieza: los rechazados de hace mas de 30 dias se borran.
update public.controller_mappings set status = 'rejected', reviewed_at = now() - interval '31 days'
 where author_id = 'a0000000-0000-0000-0000-000000000025' and status = 'pending';
select private.cleanup_controller_mappings();
select t.check((select count(*) = 0 from public.controller_mappings where status = 'rejected'), 'rechazados antiguos borrados');
\echo mandos de la comunidad: OK
