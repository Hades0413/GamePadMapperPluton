#!/usr/bin/env bash
# Equivalente Linux de mapper/build.ps1:
#  1. Compila src/gpmapper.c con Zig (ARM64, estatico) -> module/gpmapper
#  2. Empaqueta module/ con ../build.sh -> ../dist/gamepad_mapper-<version>.zip
# Uso: ./build.sh            (usa tools/zig/zig o zig del PATH)
#      ZIG=/ruta/zig ./build.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"

if [ -z "${ZIG:-}" ]; then
    if [ -x "$root/tools/zig/zig" ]; then ZIG="$root/tools/zig/zig"
    elif [ -f "$root/tools/zig/zig.exe" ]; then ZIG="$root/tools/zig/zig.exe"
    elif command -v zig >/dev/null; then ZIG="$(command -v zig)"
    else echo "No se encontro Zig. Ponlo en tools/zig/ o usa ZIG=<ruta>" >&2; exit 1; fi
fi

src="$here/src/gpmapper.c"
bin="$here/module/gpmapper"
echo "Compilando gpmapper..."
rm -f "$bin"
# Solo se muestran avisos de nuestro codigo (no el conocido de musl crt/dlstart.c)
set +e
# max-page-size=16384: segmentos alineados a 16 KB, para que arranque en los telefonos con paginas
# de 16 KB (requisito de Google Play desde Android 15).
out="$("$ZIG" cc -target aarch64-linux-musl -static -O2 -Wall -Wextra -Wl,-z,max-page-size=16384 -o "$bin" "$src" -lm 2>&1)"
code=$?
set -e
grep 'gpmapper\.c' <<<"$out" || true
if [ $code -ne 0 ] || [ ! -f "$bin" ]; then echo "$out" >&2; echo "Fallo la compilacion" >&2; exit 1; fi

"$root/build.sh" "$here/module" "$root/dist"
