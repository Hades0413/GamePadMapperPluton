#!/usr/bin/env bash
# Nombres de paquete sin espacios: Tauri usa el nombre del producto («Gamepad Mapper Pluton») en
# los archivos; aqui pasan a «gamepad-mapper-pluton_<version>_<arquitectura>.<ext>» (y sus .sig).
# El nombre que se ve (ventana, menu, accesos directos) sigue siendo «Gamepad Mapper Plutón».
#
# Uso: scripts/renombrar-paquetes.sh [carpeta de bundle]   (por defecto target/release/bundle)
# Escribe en la salida estandar la lista final de paquetes.
set -euo pipefail

carpeta="${1:-target/release/bundle}"
[ -d "$carpeta" ] || { echo "No existe $carpeta" >&2; exit 1; }

shopt -s nullglob
for f in "$carpeta"/*/*; do
  [ -f "$f" ] || continue
  nombre="$(basename "$f")"
  case "$nombre" in
    *" "*) ;;
    *) continue ;;
  esac
  dir="$(dirname "$f")"
  # Solo la parte del producto (antes del primer «_») pasa a minusculas con guiones.
  producto="${nombre%%_*}"
  resto="${nombre#"$producto"}"
  nuevo="$(printf '%s' "$producto" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')$resto"
  mv -f -- "$f" "$dir/$nuevo"
done

for f in "$carpeta"/*/*; do
  case "$f" in
    *.deb|*.AppImage|*.rpm|*.exe|*.msi|*.zip|*.sig) printf '%s\n' "$f" ;;
  esac
done
