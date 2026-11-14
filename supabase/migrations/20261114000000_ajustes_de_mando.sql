-- =====================================================================================
--  Ajustes de mando nuevos en los perfiles (version 1.6 de la app):
--   aim_button / aim_scale (apuntar), look_accel (aceleracion de la camara), controller
--   (perfil segun el mando), rumble (vibracion), gyro / gyro_button / gyro_invert (giroscopio)
--   y mouse (raton como camara). Las teclas KB_* y MOUSE_* ya eran nombres de boton validos.
--  Mismas reglas que web/src/domain/profile/conf/validateConf.ts.
-- =====================================================================================

create or replace function private.validate_conf(
    p_conf text, p_package text,
    out conf text, out screen_w integer, out screen_h integer, out binding_count integer)
language plpgsql immutable set search_path = '' as $$
declare
    v_lines text[];
    v_line text;
    v_n integer := 0;
    v_key text;
    v_val text;
    v_lkey text;
    v_args text[];
    v_type text;
    v_nums integer;
    v_check integer;
    v_steps text[];
    v_step text;
    v_pkg text;
    v_keys text[] := '{}';
    v_max_x numeric := 0;
    v_max_y numeric := 0;
    v_num text := '^-?[0-9]{1,6}(\.[0-9]{1,4})?$';
    v_bad text;
begin
    conf := btrim(replace(coalesce(p_conf, ''), E'\r\n', E'\n'));
    if conf = '' then
        perform private.fail('INVALID_CONF', 'El perfil está vacío.');
    end if;
    if octet_length(conf) > 16384 then
        perform private.fail('INVALID_CONF', 'El perfil es demasiado grande (máximo 16 KB).');
    end if;
    if conf ~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]' then
        perform private.fail('INVALID_CONF', 'El perfil tiene caracteres no permitidos.');
    end if;
    v_lines := string_to_array(conf, E'\n');
    if array_length(v_lines, 1) > 400 then
        perform private.fail('INVALID_CONF', 'El perfil tiene demasiadas líneas (máximo 400).');
    end if;

    foreach v_line in array v_lines loop
        v_n := v_n + 1;
        v_line := btrim(split_part(v_line, '#', 1));
        continue when v_line = '';
        if position('=' in v_line) = 0 then
            perform private.fail('INVALID_CONF', format('Línea %s: falta «=».', v_n));
        end if;
        v_key := btrim(split_part(v_line, '=', 1));
        v_val := btrim(substr(v_line, position('=' in v_line) + 1));
        v_lkey := lower(v_key);
        v_bad := null;

        case v_lkey
            when 'package' then
                v_pkg := v_val;
            when 'name' then
                if char_length(v_val) > 60 then v_bad := 'nombre demasiado largo'; end if;
            when 'screen' then
                if lower(v_val) !~ '^[0-9]{3,5}\s*x\s*[0-9]{3,5}$' then
                    v_bad := 'usa el formato ANCHOxALTO';
                else
                    screen_w := split_part(regexp_replace(lower(v_val), '\s', '', 'g'), 'x', 1)::integer;
                    screen_h := split_part(regexp_replace(lower(v_val), '\s', '', 'g'), 'x', 2)::integer;
                end if;
            when 'deadzone', 'ls_deadzone', 'rs_deadzone' then
                if coalesce(private.to_num(v_val) not between 0 and 0.95, true) then v_bad := 'debe estar entre 0 y 0.95'; end if;
            when 'ls_curve', 'rs_curve' then
                if coalesce(private.to_num(v_val) not between 0.1 and 5, true) then v_bad := 'debe estar entre 0.1 y 5'; end if;
            when 'look_y' then
                if coalesce(private.to_num(v_val) not between 0.1 and 10, true) then v_bad := 'debe estar entre 0.1 y 10'; end if;
            when 'look_invert' then
                if v_val not in ('0', '1') then v_bad := 'debe ser 0 o 1'; end if;
            when 'aim_button', 'gyro_button' then
                if v_val !~ '^[A-Za-z][A-Za-z0-9_]{0,15}$' then v_bad := 'debe ser un botón (por ejemplo L2)'; end if;
            when 'aim_scale' then
                if coalesce(private.to_num(v_val) not between 0.1 and 2, true) then v_bad := 'debe estar entre 0.1 y 2'; end if;
            when 'look_accel' then
                if coalesce(private.to_num(v_val) not between 0 and 3, true) then v_bad := 'debe estar entre 0 y 3'; end if;
            when 'rumble' then
                if coalesce(private.to_num(v_val) not between 0 and 1, true) then v_bad := 'debe estar entre 0 y 1'; end if;
            when 'gyro', 'mouse' then
                if coalesce(private.to_num(v_val) not between 0 and 5, true) then v_bad := 'debe estar entre 0 y 5'; end if;
            when 'gyro_invert' then
                if v_val not in ('0', '1') then v_bad := 'debe ser 0 o 1'; end if;
            when 'controller' then
                if char_length(v_val) > 40 or v_val !~ '^[A-Za-z0-9 ._()+-]*$' then
                    v_bad := 'nombre de mando no válido (letras, números y . _ ( ) + -, máximo 40)';
                end if;
            when 'ls_axes', 'rs_axes' then
                if replace(v_val, ' ', '') !~ '^[0-9A-Fa-f]{1,2},[0-9A-Fa-f]{1,2}$' then v_bad := 'usa el formato 0,1'; end if;
            else
                v_key := upper(replace(v_key, ' ', ''));
                if v_key !~ '^([A-Z0-9_]{1,20}\+)?[A-Z0-9_]{1,20}[+-]?$' then
                    perform private.fail('INVALID_CONF', format('Línea %s: «%s» no es un botón válido.', v_n, v_key));
                end if;
                if v_key = any (v_keys) then
                    perform private.fail('INVALID_CONF', format('Línea %s: el botón %s está repetido.', v_n, v_key));
                end if;
                v_keys := v_keys || v_key;
                v_args := regexp_split_to_array(v_val, '\s+');
                v_type := lower(v_args[1]);
                v_nums := coalesce(array_length(v_args, 1), 1) - 1;

                if v_type = 'macro' then
                    v_steps := string_to_array(btrim(substr(v_val, 6)), ';');
                    if coalesce(array_length(v_steps, 1), 0) not between 1 and 16 then
                        v_bad := 'una macro tiene de 1 a 16 pasos';
                    else
                        foreach v_step in array v_steps loop
                            v_args := regexp_split_to_array(btrim(v_step), '\s+');
                            if array_length(v_args, 1) not between 2 and 4
                               or exists (select 1 from unnest(v_args) a where a !~ v_num) then
                                v_bad := 'cada paso es «x y [espera] [duración]»';
                                exit;
                            end if;
                            v_max_x := greatest(v_max_x, v_args[1]::numeric);
                            v_max_y := greatest(v_max_y, v_args[2]::numeric);
                            if v_args[1]::numeric < 0 or v_args[2]::numeric < 0 then v_bad := 'coordenadas negativas'; exit; end if;
                        end loop;
                    end if;
                else
                    -- Valores numericos a comprobar ("dpad" final de un stick no cuenta).
                    v_check := case when v_type = 'stick' and v_nums = 4 then 3 else least(v_nums, 5) end;
                    if (v_type in ('tap', 'toggle', 'quick') and v_nums <> 2)
                       or (v_type = 'burst' and v_nums not between 2 and 4)
                       or (v_type = 'turbo' and v_nums not between 2 and 3)
                       or (v_type = 'swipe' and v_nums not between 4 and 5)
                       or (v_type = 'look' and v_nums <> 3)
                       or (v_type = 'stick' and not (v_nums = 3 or (v_nums = 4 and lower(v_args[5]) = 'dpad'))) then
                        v_bad := 'número de valores incorrecto';
                    elsif v_type not in ('tap', 'toggle', 'quick', 'burst', 'turbo', 'swipe', 'look', 'stick') then
                        v_bad := format('tipo «%s» desconocido', v_type);
                    elsif exists (select 1 from unnest(v_args[2:v_check + 1]) a where a !~ v_num) then
                        v_bad := 'los valores deben ser números';
                    elsif v_args[2]::numeric < 0 or v_args[3]::numeric < 0 then
                        v_bad := 'coordenadas negativas';
                    else
                        v_max_x := greatest(v_max_x, v_args[2]::numeric);
                        v_max_y := greatest(v_max_y, v_args[3]::numeric);
                        if v_type = 'swipe' then
                            if v_args[4]::numeric < 0 or v_args[5]::numeric < 0 then v_bad := 'coordenadas negativas'; end if;
                            v_max_x := greatest(v_max_x, v_args[4]::numeric);
                            v_max_y := greatest(v_max_y, v_args[5]::numeric);
                        end if;
                    end if;
                end if;
        end case;

        if v_bad is not null then
            perform private.fail('INVALID_CONF', format('Línea %s (%s): %s.', v_n, v_key, v_bad));
        end if;
    end loop;

    if v_pkg is null then
        perform private.fail('INVALID_CONF', 'Falta la línea «package = ...».');
    end if;
    if v_pkg <> p_package then
        perform private.fail('INVALID_CONF', format('El perfil es del juego %s, no de %s.', v_pkg, p_package));
    end if;
    if screen_w is null then
        perform private.fail('INVALID_CONF', 'Falta la línea «screen = ANCHOxALTO».');
    end if;
    binding_count := coalesce(array_length(v_keys, 1), 0);
    if binding_count = 0 then
        perform private.fail('INVALID_CONF', 'El perfil no tiene ningún botón asignado.');
    end if;
    if binding_count > 150 then
        perform private.fail('INVALID_CONF', 'El perfil tiene demasiados botones (máximo 150).');
    end if;
    if v_max_x > screen_w * 1.05 or v_max_y > screen_h * 1.05 then
        perform private.fail('INVALID_CONF', 'Hay botones fuera de la pantalla indicada en «screen».');
    end if;
end $$;
