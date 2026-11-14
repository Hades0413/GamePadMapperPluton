#!/usr/bin/env bash
# Compila gpm-escritorio con Zig (desde Linux, macOS o Windows con Git Bash):
#   ./desktop/build.sh linux     -> dist/gpm-escritorio-linux-x86_64 (estatico, musl)
#   ./desktop/build.sh windows   -> dist/gpm-escritorio-windows-x86_64.exe (Windows 8+)
# Usa tools/zig/zig, o ZIG=/ruta/zig. Cualquier aviso del compilador en nuestro codigo es un error.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
if [ -z "${ZIG:-}" ]; then
    if [ -x "$root/tools/zig/zig" ]; then ZIG="$root/tools/zig/zig"
    elif [ -f "$root/tools/zig/zig.exe" ]; then ZIG="$root/tools/zig/zig.exe"
    elif command -v zig >/dev/null; then ZIG="$(command -v zig)"
    else echo "No se encontro Zig. Ejecuta make setup o usa ZIG=<ruta>" >&2; exit 1; fi
fi

core=("$root/mapper/src/core/gpm_core.c" "$root/mapper/src/core/gpm_repeticion.c" "$here/comun/escritorio.c")
mkdir -p "$root/dist"
case "${1:-}" in
    linux)
        bin="$root/dist/gpm-escritorio-linux-x86_64"
        args=(-target x86_64-linux-musl -static "$here/linux/gpm_escritorio_linux.c" "$root/mapper/src/linux/gpm_evdev.c")
        libs=(-lm) ;;
    windows)
        bin="$root/dist/gpm-escritorio-windows-x86_64.exe"
        args=(-target x86_64-windows-gnu "$here/windows/gpm_escritorio_windows.c")
        libs=(-luser32 -lwinmm) ;;
    *) echo "uso: $0 linux|windows" >&2; exit 2 ;;
esac

echo "Compilando $(basename "$bin")..."
rm -f "$bin"
set +e
out="$("$ZIG" cc -std=gnu11 -O2 -Wall -Wextra -o "$bin" "${args[@]}" "${core[@]}" "${libs[@]}" 2>&1)"
code=$?
set -e
# Solo cuentan los avisos de nuestro codigo (no el conocido de musl crt/dlstart.c)
avisos="$(grep -E '(desktop|mapper)/.*(warning|error)' <<<"$out" || true)"
if [ $code -ne 0 ] || [ ! -f "$bin" ]; then echo "$out" >&2; echo "Fallo la compilacion" >&2; exit 1; fi
if [ -n "$avisos" ]; then echo "$out" >&2; echo "Hay avisos del compilador: corrigelos" >&2; rm -f "$bin"; exit 1; fi
rm -f "${bin%.exe}.pdb"   # simbolos de depuracion de Windows: no se distribuyen
echo "Listo: $bin ($(du -h "$bin" | cut -f1))"
