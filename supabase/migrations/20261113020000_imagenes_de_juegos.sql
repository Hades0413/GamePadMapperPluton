-- =====================================================================================
--  Imagenes de los juegos: icono y fondo (captura del juego para la vista previa).
--
--  - Se guardan en Supabase Storage, cubo publico "juegos" (carpetas iconos/ y fondos/).
--  - Solo los administradores suben imagenes (desde Moderacion o la funcion importar-juego).
--  - games.icon_url / games.background_url solo admiten direcciones de ese cubo: nunca enlaces
--    externos (evita rastreo de los visitantes y contenido no revisado).
-- =====================================================================================

-- Direccion publica de un archivo del cubo "juegos" de este proyecto (o null).
create or replace function private.is_game_image_url(p_url text)
returns boolean language sql immutable set search_path = '' as $$
    select p_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/juegos/(iconos|fondos)/[A-Za-z0-9._-]{1,160}(\?v=[0-9]{1,15})?$';
$$;

alter table public.games add column background_url text;
alter table public.games drop constraint if exists games_icon_url_check;
update public.games set icon_url = null where icon_url is not null and not private.is_game_image_url(icon_url);
alter table public.games add constraint games_icon_url_check
    check (icon_url is null or private.is_game_image_url(icon_url));
alter table public.games add constraint games_background_url_check
    check (background_url is null or private.is_game_image_url(background_url));

grant select (background_url) on public.games to anon, authenticated;

-- ¿La sesion actual es de un administrador? (la usan las reglas del Storage)
create or replace function public.am_i_admin()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.authors where id = auth.uid() and is_admin and not is_banned);
$$;

-- Cubo publico (lectura por URL) con limite de tamano y tipos de imagen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('juegos', 'juegos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- Escritura solo de administradores y solo en iconos/ o fondos/ (la lectura es por URL publica).
create policy "juegos: admins leen" on storage.objects for select to authenticated
    using (bucket_id = 'juegos' and public.am_i_admin());
create policy "juegos: admins suben" on storage.objects for insert to authenticated
    with check (bucket_id = 'juegos' and public.am_i_admin() and (storage.foldername(name))[1] in ('iconos', 'fondos'));
create policy "juegos: admins reemplazan" on storage.objects for update to authenticated
    using (bucket_id = 'juegos' and public.am_i_admin())
    with check (bucket_id = 'juegos' and public.am_i_admin() and (storage.foldername(name))[1] in ('iconos', 'fondos'));
create policy "juegos: admins borran" on storage.objects for delete to authenticated
    using (bucket_id = 'juegos' and public.am_i_admin());

-- Asigna icono y/o fondo a un juego (null deja el valor actual; '' lo quita).
create or replace function public.admin_set_game_images(p_package text, p_icon_url text, p_background_url text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    perform private.require_admin();
    if (nullif(p_icon_url, '') is not null and not private.is_game_image_url(p_icon_url))
       or (nullif(p_background_url, '') is not null and not private.is_game_image_url(p_background_url)) then
        perform private.fail('INVALID_IMAGE', 'La imagen tiene que estar en el almacenamiento del proyecto.');
    end if;
    update public.games
       set icon_url = case when p_icon_url is null then icon_url else nullif(p_icon_url, '') end,
           background_url = case when p_background_url is null then background_url else nullif(p_background_url, '') end
     where package = p_package;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese juego no existe.');
    end if;
end $$;

-- El nombre y la visibilidad se siguen editando aqui; el icono ya no (va por admin_set_game_images).
drop function if exists public.admin_update_game(text, text, text, boolean);
create or replace function public.admin_update_game(p_package text, p_name text, p_hidden boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
    perform private.require_admin();
    update public.games
       set name = private.clean_line(p_name, 2, 60, 'juego'),
           is_hidden = p_hidden
     where package = p_package;
    if not found then
        perform private.fail('NOT_FOUND', 'Ese juego no existe.');
    end if;
end $$;

revoke execute on function public.am_i_admin(), public.admin_set_game_images(text, text, text),
    public.admin_update_game(text, text, boolean) from public, anon;
grant execute on function public.am_i_admin(), public.admin_set_game_images(text, text, text),
    public.admin_update_game(text, text, boolean) to authenticated;
revoke execute on function private.is_game_image_url(text) from public, anon, authenticated;
