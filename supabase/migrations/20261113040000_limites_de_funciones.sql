-- =====================================================================================
--  Limites de uso de la funcion importar-juego (evita abusos: muchas llamadas seguidas,
--  descargas repetidas de Google Play, consumo de la cuota de la funcion).
--
--  Solo la usa la propia funcion con el rol de servicio: el API (anon / authenticated) no puede
--  leerla ni escribirla.
-- =====================================================================================

create table public.edge_function_calls (
    user_id     uuid not null,
    action      text not null check (action in ('icono', 'capturas', 'fondo', 'rellenar')),
    package     text not null check (char_length(package) <= 150),
    created_at  timestamptz not null default now()
);
create index edge_function_calls_user_idx on public.edge_function_calls (user_id, action, created_at desc);
create index edge_function_calls_package_idx on public.edge_function_calls (package, action, created_at desc);

alter table public.edge_function_calls enable row level security;
revoke all on public.edge_function_calls from public, anon, authenticated;
grant select, insert, delete on public.edge_function_calls to service_role;
