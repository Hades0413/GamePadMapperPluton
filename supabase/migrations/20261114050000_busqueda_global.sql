-- =====================================================================================
--  Busqueda global de perfiles (/buscar): todos los juegos a la vez.
--
--  - La web consulta game_profiles con la lectura publica de siempre (mismas columnas y misma
--    politica RLS): esta migracion solo anade indices para que buscar sin juego sea rapido.
--  - Texto: indices trigram (pg_trgm) sobre titulo y descripcion para ilike '%texto%'. La web
--    sanea el texto antes (solo letras, numeros y espacios: sin comodines ni sintaxis).
--  - Orden: un indice por cada orden (populares, instalados, valorados, recientes), solo con
--    los perfiles publicados.
-- =====================================================================================

create index if not exists game_profiles_all_popular_idx on public.game_profiles (like_count desc, created_at desc)
    where status = 'published';
create index if not exists game_profiles_all_installs_idx on public.game_profiles (install_count desc, created_at desc)
    where status = 'published';
create index if not exists game_profiles_all_rating_idx on public.game_profiles (works_yes desc, works_no, created_at desc)
    where status = 'published';
create index if not exists game_profiles_all_recent_idx on public.game_profiles (created_at desc)
    where status = 'published';
create index if not exists game_profiles_all_ratio_idx on public.game_profiles (screen_ratio)
    where status = 'published';

-- Busqueda de texto: con pg_trgm si esta disponible (Supabase lo trae; la primera migracion ya lo
-- crea). Si no, la busqueda sigue funcionando con ilike, solo que sin indice.
do $$
begin
    if exists (select 1 from pg_extension where extname = 'pg_trgm') then
        execute 'create index if not exists game_profiles_title_trgm_idx on public.game_profiles
                 using gin (title extensions.gin_trgm_ops) where status = ''published''';
        execute 'create index if not exists game_profiles_description_trgm_idx on public.game_profiles
                 using gin (description extensions.gin_trgm_ops) where status = ''published''';
    end if;
end $$;
