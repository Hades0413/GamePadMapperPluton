#!/usr/bin/env bash
# Genera latest.json para el actualizador de Tauri (version escritorio-latest de GitHub).
#
# Uso: scripts/latest-json.sh <version> <carpeta con los paquetes y sus .sig> <url base de descarga>
#   p. ej. scripts/latest-json.sh 0.3.0 paquetes \
#          https://github.com/Hades0413/GamePadMapperPluton/releases/download/escritorio-latest
#
# Plataformas: linux-x86_64 (AppImage) y windows-x86_64 (instalador NSIS; y windows-x86_64-msi).
# Sin firmas (.sig) no hay nada que actualizar: sale con codigo 2 y no escribe nada.
set -euo pipefail

version="$1"
carpeta="$2"
base="$3"

firma() {
  # La firma de minisign va en una linea (base64): se copia tal cual.
  tr -d '\r\n' < "$1"
}

entrada() {
  local clave="$1" patron="$2" archivo
  archivo="$(find "$carpeta" -maxdepth 2 -type f -name "$patron" | head -n1)"
  [ -n "$archivo" ] && [ -f "$archivo.sig" ] || return 0
  printf '    "%s": { "signature": "%s", "url": "%s/%s" }' "$clave" "$(firma "$archivo.sig")" "$base" "$(basename "$archivo")"
}

plataformas=()
for par in "linux-x86_64|*_${version}_*.AppImage" "windows-x86_64|*_${version}_*-setup.exe" "windows-x86_64-msi|*_${version}_*.msi"; do
  e="$(entrada "${par%%|*}" "${par#*|}")"
  [ -n "$e" ] && plataformas+=("$e")
done

if [ "${#plataformas[@]}" -eq 0 ]; then
  echo "No hay paquetes firmados (.sig) para $version: no se genera latest.json." >&2
  exit 2
fi

fecha="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  printf '{\n  "version": "%s",\n  "notes": "Gamepad Mapper Plutón %s",\n  "pub_date": "%s",\n  "platforms": {\n' "$version" "$version" "$fecha"
  for i in "${!plataformas[@]}"; do
    printf '%s' "${plataformas[$i]}"
    [ "$i" -lt $((${#plataformas[@]} - 1)) ] && printf ','
    printf '\n'
  done
  printf '  }\n}\n'
}
