\set ON_ERROR_STOP 1
-- Moderacion 2: reportar comentarios, historial de moderacion y bloqueos temporales.
-- Usa a1 (autor), a2 (comentarista) y a9 (admin) de 90_avisos; y crea sus propios usuarios:
-- a4, a5, a6, a7 = reportan; a8 = bloqueado de prueba.
insert into auth.users values ('a0000000-0000-0000-0000-0000000000a4', '{}'), ('a0000000-0000-0000-0000-0000000000a5', '{}'),
    ('a0000000-0000-0000-0000-0000000000a6', '{}'), ('a0000000-0000-0000-0000-0000000000a7', '{}'),
    ('a0000000-0000-0000-0000-0000000000a8', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
    ('94', 'a0000000-0000-0000-0000-0000000000a4', '{"user_name":"mod4"}', 'github'),
    ('95', 'a0000000-0000-0000-0000-0000000000a5', '{"user_name":"mod5"}', 'github'),
    ('96', 'a0000000-0000-0000-0000-0000000000a6', '{"user_name":"mod6"}', 'github'),
    ('97', 'a0000000-0000-0000-0000-0000000000a7', '{"user_name":"mod7"}', 'github'),
    ('98', 'a0000000-0000-0000-0000-0000000000a8', '{"user_name":"mod8"}', 'github');
-- Cuentas con algunos dias (sus reportes cuentan para ocultar), salvo a6 (nueva).
update public.authors set created_at = now() - interval '10 days'
 where id in ('a0000000-0000-0000-0000-0000000000a4', 'a0000000-0000-0000-0000-0000000000a5', 'a0000000-0000-0000-0000-0000000000a7');
select set_config('test.pid', (select id::text from public.game_profiles where title = 'Perfil avisos'), false);
select set_config('test.cid', (select id::text from public.profile_comments where body = 'Muy buen perfil'), false);

-- ================================================================== reportar comentarios
select set_config('test.uid', '', false);
set role anon;
select t.fails(format('select public.report_comment(%L, ''spam'', '''')', current_setting('test.cid')), 'permission denied');
select t.fails('select * from public.comment_reports', 'permission denied');
select t.fails('select * from public.admin_reported_comments()', 'permission denied');
select t.fails('select is_hidden from public.profile_comments', 'permission denied');
reset role;

set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a2', false);
select t.fails(format('select public.report_comment(%L, ''spam'', '''')', current_setting('test.cid')), 'OWN_COMMENT');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a4', false);
select t.fails(format('select public.report_comment(%L, ''hack'', '''')', current_setting('test.cid')), 'INVALID_REASON');
select t.fails(format('select public.report_comment(%L, ''spam'', ''<b>x</b>'')', current_setting('test.cid')), '< ni >');
select t.fails(format('select public.report_comment(%L, ''spam'', '''')', gen_random_uuid()), 'NOT_FOUND');
select t.fails('insert into public.comment_reports (comment_id, user_id, reason) values (gen_random_uuid(), gen_random_uuid(), ''spam'')', 'permission denied');
select t.fails('update public.profile_comments set is_hidden = true', 'permission denied');
-- Uno por usuario y comentario (repetir no suma).
select public.report_comment(current_setting('test.cid')::uuid, 'spam', 'publicidad');
select public.report_comment(current_setting('test.cid')::uuid, 'offensive', '');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a5', false);
select public.report_comment(current_setting('test.cid')::uuid, 'offensive', '');
-- Cuenta nueva: su reporte suma, pero no cuenta para ocultar.
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a6', false);
select public.report_comment(current_setting('test.cid')::uuid, 'other', '');
reset role;
select t.check((select report_count = 3 and not is_hidden from public.profile_comments where id = current_setting('test.cid')::uuid),
    '3 reportes (uno de cuenta nueva): sigue visible');
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a7', false);
select public.report_comment(current_setting('test.cid')::uuid, 'spam', '');
reset role;
select t.check((select report_count = 4 and is_hidden from public.profile_comments where id = current_setting('test.cid')::uuid),
    '3 reportes de cuentas con dias: oculto');
select t.check((select count(*) = 4 from public.comment_reports where comment_id = current_setting('test.cid')::uuid), 'un reporte por usuario');

-- Oculto: no lo ve nadie por el API (ni el autor del perfil ni el del comentario) y no se reporta mas.
select set_config('test.uid', '', false);
set role anon;
select t.check((select count(*) = 0 from public.profile_comments where id = current_setting('test.cid')::uuid), 'anon no ve el oculto');
reset role;
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a2', false);
select t.check((select count(*) = 0 from public.profile_comments where id = current_setting('test.cid')::uuid), 'su autor no lo ve');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a8', false);
select t.fails(format('select public.report_comment(%L, ''spam'', '''')', current_setting('test.cid')), 'NOT_FOUND');

-- Revision: solo admins.
select t.fails('select * from public.admin_reported_comments()', 'FORBIDDEN');
select t.fails(format('select public.admin_moderate_comment(%L, ''restore'', '''')', current_setting('test.cid')), 'FORBIDDEN');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a9', false);
select t.check((select report_count = 4 and is_hidden and username = 'avisos2' and profile_title = 'Perfil avisos'
                  and cardinality(reasons) = 4 and 'spam: publicidad' = any (reasons)
                  from public.admin_reported_comments() where id = current_setting('test.cid')::uuid), 'admin ve el comentario reportado');
select t.fails(format('select public.admin_moderate_comment(%L, ''explotar'', '''')', current_setting('test.cid')), 'INVALID_INPUT');
select t.fails(format('select public.admin_moderate_comment(%L, ''hide'', ''<x>'')', current_setting('test.cid')), '< ni >');
select public.admin_moderate_comment(current_setting('test.cid')::uuid, 'restore', 'falsa alarma');
reset role;
select t.check((select report_count = 0 and not is_hidden from public.profile_comments where id = current_setting('test.cid')::uuid)
               and not exists (select 1 from public.comment_reports where comment_id = current_setting('test.cid')::uuid), 'restaurado');
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a9', false);
select public.admin_moderate_comment(current_setting('test.cid')::uuid, 'hide', '');
select public.admin_moderate_comment(current_setting('test.cid')::uuid, 'delete', 'spam');
reset role;
select t.check(not exists (select 1 from public.profile_comments where id = current_setting('test.cid')::uuid), 'borrado');

-- ================================================================== historial de moderacion
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a1', false);
select t.fails('select * from public.admin_moderation_log()', 'FORBIDDEN');
select t.fails('select * from private.moderation_log', 'permission denied');
-- Borrar lo propio no queda en el historial; un admin borrando lo ajeno si.
select set_config('test.cid', public.add_comment(current_setting('test.pid')::uuid, 'Comentario propio')::text, false);
select public.delete_comment(current_setting('test.cid')::uuid);
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a2', false);
select set_config('test.cid', public.add_comment(current_setting('test.pid')::uuid, 'Lo borra un admin')::text, false);
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a9', false);
select public.delete_comment(current_setting('test.cid')::uuid);
select public.admin_feature_profile(current_setting('test.pid')::uuid, true);
select public.admin_update_game('com.avisos.x', 'Avisos X', false);
reset role;
select set_config('test.uid', '', false);
set role anon;
select t.fails('select * from public.admin_moderation_log()', 'permission denied');
reset role;
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a9', false);
select t.check((select array_agg(action order by id) = array['mapping_approve', 'mapping_reject', 'profile_hide', 'profile_publish',
                    'comment_restore', 'comment_hide', 'comment_delete', 'comment_delete', 'profile_feature', 'game_update']
                  from public.admin_moderation_log() where admin_name = 'admin9'), 'acciones anotadas en orden');
select t.check((select reason = 'falsa alarma' and target_type = 'comment' and target_label = '@avisos2: Muy buen perfil'
                  from public.admin_moderation_log() where action = 'comment_restore'), 'quien, que, sobre que y motivo');
select t.check((select reason = 'reportes borrados' and target_label = 'Perfil avisos'
                  from public.admin_moderation_log() where action = 'profile_publish' and admin_name = 'admin9'), 'publicar con reportes borrados');
select t.check((select count(*) = 1 from public.admin_moderation_log() where action = 'comment_delete' and target_label like '%Lo borra un admin'),
    'borrado por admin anotado');
select t.check((select count(*) = 0 from public.admin_moderation_log() where target_label like '%Comentario propio'), 'lo propio no se anota');
-- Paginacion: p_before.
select t.check((select count(*) = 2 from public.admin_moderation_log(2)), 'limite');
select t.check((select max(id) < (select min(id) from public.admin_moderation_log(2)) from public.admin_moderation_log(5,
    (select min(id) from public.admin_moderation_log(2)))), 'pagina anterior');
reset role;

-- ================================================================== bloqueos temporales
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a8', false);
select set_config('test.p8', public.publish_profile('com.avisos.x', 'Avisos X', 'Perfil de mod8', '',
    E'package = com.avisos.x\nscreen = 2400x1080\nA = tap 1 1')::text, false);
-- Solo admins bloquean; no a si mismos ni a otros admins; duraciones de la lista.
select t.fails('select public.admin_ban_author(''a0000000-0000-0000-0000-0000000000a1'', 7, '''')', 'FORBIDDEN');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a9', false);
select t.fails('select public.admin_ban_author(''a0000000-0000-0000-0000-0000000000a9'', 7, '''')', 'FORBIDDEN');
select t.fails('select public.admin_ban_author(''a0000000-0000-0000-0000-000000000001'', 7, '''')', 'FORBIDDEN');
select t.fails('select public.admin_ban_author(''a0000000-0000-0000-0000-0000000000a8'', 3, '''')', 'INVALID_INPUT');
select t.fails('select public.admin_ban_author(''a0000000-0000-0000-0000-0000000000a8'', 7, ''<x>'')', '< ni >');
select public.admin_ban_author('a0000000-0000-0000-0000-0000000000a8', 7, 'spam en comentarios');
select t.check((select count(*) = 1 and bool_and(not is_banned and banned_until > now() + interval '6 days')
                  from public.admin_banned_authors() where username = 'mod8'), 'lista de bloqueados');
-- Bloqueado 7 dias: no publica, no comenta, no reporta, no da «me gusta»...
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a8', false);
select t.fails(format('select public.add_comment(%L, ''Hola de nuevo'')', current_setting('test.pid')), 'suspendida hasta');
select t.fails(format('select public.like_profile(%L)', current_setting('test.pid')), 'BANNED');
select t.fails(format('select public.report_profile(%L, ''spam'', '''')', current_setting('test.pid')), 'BANNED');
reset role;
-- ...pero su contenido sigue visible.
select set_config('test.uid', '', false);
set role anon;
select t.check((select count(*) = 1 from public.game_profiles where id = current_setting('test.p8')::uuid), 'perfil visible durante el bloqueo temporal');
select t.check((select count(*) = 1 from public.authors where username = 'mod8'), 'autor visible durante el bloqueo temporal');
select t.fails('select banned_until from public.authors', 'permission denied');
reset role;
-- Al acabar el plazo, vuelve a poder.
update public.authors set banned_until = now() - interval '1 minute' where id = 'a0000000-0000-0000-0000-0000000000a8';
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a8', false);
select public.add_comment(current_setting('test.pid')::uuid, 'Ya puedo comentar');
-- Para siempre: oculta sus perfiles y bloquea su GitHub; desbloquear lo quita todo.
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a9', false);
select public.admin_ban_author('a0000000-0000-0000-0000-0000000000a8', null, 'reincidente');
reset role;
select t.check((select is_banned and banned_until is null from public.authors where id = 'a0000000-0000-0000-0000-0000000000a8')
               and exists (select 1 from private.banned_github where github_id = '98')
               and (select status = 'hidden' from public.game_profiles where id = current_setting('test.p8')::uuid), 'bloqueo para siempre');
select t.check(not exists (select 1 from public.notifications where user_id = 'a0000000-0000-0000-0000-0000000000a8' and kind = 'profile_hidden'),
    'sin aviso al bloqueado');
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a9', false);
select t.fails('select public.admin_ban_author(''a0000000-0000-0000-0000-0000000000a8'', 1, '''')', 'FORBIDDEN');
select public.admin_unban_author('a0000000-0000-0000-0000-0000000000a8', 'apelacion aceptada');
select t.check((select count(*) = 0 from public.admin_banned_authors() where username = 'mod8'), 'desbloqueado');
select t.check((select array_agg(target_label order by id) = array['@mod8 (7 días)', '@mod8 (para siempre)', '@mod8']
                  from public.admin_moderation_log() where target_type = 'author' and admin_name = 'admin9'), 'bloqueos en el historial');
select set_config('test.uid', 'a0000000-0000-0000-0000-0000000000a8', false);
select public.add_comment(current_setting('test.pid')::uuid, 'He vuelto');
reset role;
select t.check(not exists (select 1 from private.banned_github where github_id = '98'), 'GitHub desbloqueado');

-- Limpieza del historial (mas de un ano).
update private.moderation_log set created_at = now() - interval '400 days' where action = 'game_update';
select private.cleanup_moderation_log();
select t.check(not exists (select 1 from private.moderation_log where action = 'game_update'), 'historial antiguo borrado');
\echo moderacion 2: OK
