-- Imitacion minima de lo que Supabase ya trae (roles, auth, storage) para probar las migraciones
-- en un PostgreSQL normal. NO se ejecuta en Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text not null,
    user_id uuid references auth.users (id) on delete cascade, identity_data jsonb, provider text not null);
create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema auth, public, extensions, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
grant all on storage.objects to authenticated;
-- Como en Supabase: el rol de servicio tiene acceso a las tablas que se creen en public.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
