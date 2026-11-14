\set ON_ERROR_STOP 1
-- Ajustes de mando (1.6): se aceptan con valores validos y se rechazan fuera de rango.
select t.check((select binding_count = 3 from private.validate_conf(
    E'package = com.x.y\nscreen = 1000x500\naim_button = l2\naim_scale = 0.40\nlook_accel = 0.5\n'
    || E'controller = Xbox Wireless\nrumble = 0.3\ngyro = 1.2\ngyro_button = L2\ngyro_invert = 1\nmouse = 0.8\n'
    || E'RS = look 500 250 14\nKB_W = tap 10 10\nMOUSE_LEFT = tap 20 20', 'com.x.y')), 'ajustes de mando validos');
select t.fails($$select private.validate_conf(E'package = com.x.y\nscreen = 1000x500\nrumble = 2\nA = tap 1 1', 'com.x.y')$$, 'entre 0 y 1');
select t.fails($$select private.validate_conf(E'package = com.x.y\nscreen = 1000x500\naim_button = L2;drop\nA = tap 1 1', 'com.x.y')$$, 'botón');
select t.fails($$select private.validate_conf(E'package = com.x.y\nscreen = 1000x500\ncontroller = <script>\nA = tap 1 1', 'com.x.y')$$, 'mando');
\echo ajustes de mando: OK
