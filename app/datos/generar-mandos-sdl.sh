#!/usr/bin/env bash
# Genera app/datos/mandos-sdl.txt: un subconjunto pequeno de SDL GameControllerDB (solo Linux y
# solo mandos genericos o pensados para moviles), a partir de la copia de la app de escritorio
# (desktop/app/nucleo/datos/gamecontrollerdb.txt, que se refresca con: make app-escritorio-base).
# La app lo usa en modo root para traducir los codigos crudos de mandos genericos (mando.map).
# Licencia zlib: ver LICENCIA-SDL_GameControllerDB.txt (se incluye en el APK junto al archivo).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$(dirname "$here")")"
src="$root/desktop/app/nucleo/datos/gamecontrollerdb.txt"
out="$here/mandos-sdl.txt"
filtro='shanwan|usb gamepad|^gamepad|generic|gamesir|8bitdo|ipega|flydigi|xiaomi|szmy|twin|vr box|kishi|raiju mobile|backbone|moga|steelseries|mayflash|uniplay|samsung|zhixu|gulikit|betop|dragonrise|^ps3 controller|usb joystick|android'
version="$(sed -n 's/^# Copia incluida en la app: \(commit [0-9a-f]* ([0-9-]*)\).*/\1/p' "$src")"
{
    echo "# Subconjunto de SDL GameControllerDB (https://github.com/mdqinc/SDL_GameControllerDB), licencia zlib"
    echo "# (ver LICENCIA-SDL_GameControllerDB.txt). Origen: ${version:-?}. Solo Linux, mandos genericos y de movil."
    echo "# Generado con app/datos/generar-mandos-sdl.sh"
    grep -E '^[0-9a-f]{32},' "$src" | grep ',platform:Linux,$' | awk -F, -v f="$filtro" 'BEGIN{IGNORECASE=1} tolower($2) ~ f'
} > "$out"
cp "$root/desktop/app/nucleo/datos/LICENCIA-SDL_GameControllerDB.txt" "$here/LICENCIA-SDL_GameControllerDB.txt"
echo "$(grep -vc '^#' "$out") mandos -> $out"
