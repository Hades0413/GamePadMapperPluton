#!/usr/bin/env bash
# Pruebas de la base de datos: aplica TODAS las migraciones en un PostgreSQL desechable (Docker)
# con una imitacion minima de Supabase y comprueba seguridad, «me gusta», imagenes, etc.
#   ./supabase/tests/run.sh        (o: make db-test)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mig="${MIGRATIONS:-$(dirname "$here")/migrations}"
name="gpm-db-test-$$"
command -v docker >/dev/null || { echo "Hace falta Docker para las pruebas de la base de datos" >&2; exit 1; }
docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
until docker exec "$name" pg_isready -U postgres -q 2>/dev/null; do sleep 1; done
sleep 1
psql() { docker exec -i "$name" psql -U postgres -q -v ON_ERROR_STOP=1 -o /dev/null "$@"; }
psql < "$here/00_supabase.sql"
for f in "$mig"/*.sql; do echo "   migracion $(basename "$f")"; psql < "$f"; done
psql < "$here/01_ayudas.sql"
for f in "$here"/[1-9]*.sql; do psql < "$f"; done
echo "BASE DE DATOS: TODO CORRECTO"
