#!/usr/bin/env bash
# Pruebas del formato de perfil, sin telefono:
#  1. ProfileTest (Java, la app): leer/guardar/leer, estabilidad y compatibilidad.
#  2. gpmapper -c (C, motor root) sobre el mismo perfil: debe entenderlo igual que la app.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
jdk="${JDK:-$root/tools/jdk}"
sdk="${ANDROID_SDK:-$root/tools/android-sdk}"
jar="$sdk/platforms/${PLATFORM:-android-36}/android.jar"
zig="${ZIG:-$root/tools/zig/zig}"; [ -f "$zig" ] || zig="$zig.exe"
sep=":"; case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) sep=";" ;; esac   # separador de classpath en Windows
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

echo "== Java (app)"
"$jdk/bin/javac" -nowarn -encoding UTF-8 -cp "$jar" -sourcepath "$root/app/src" -d "$out/cls" "$here/ProfileTest.java"
"$jdk/bin/java" -cp "$out/cls$sep$jar" ProfileTest "$here/fixture.conf" > "$out/java.txt"

echo "== C (gpmapper)"
"$zig" cc -target x86_64-linux-musl -static -O1 -w -o "$out/gpmapper" "$root/mapper/src/gpmapper.c" -lm
"$out/gpmapper" -c "$here/fixture.conf" 2>/dev/null > "$out/c.raw"
{ sed -n '1,2p' "$out/c.raw"; sed -n '3,$p' "$out/c.raw" | LC_ALL=C sort; } > "$out/c.txt"
{ sed -n '1,2p' "$out/java.txt"; sed -n '3,$p' "$out/java.txt" | LC_ALL=C sort; } > "$out/j.txt"
mv "$out/j.txt" "$out/java.txt"

if diff -u "$out/java.txt" "$out/c.txt"; then
    echo "gpmapper: entiende el perfil igual que la app"
    echo "TODO CORRECTO"
else
    echo "DIFERENCIAS entre la app (-) y gpmapper (+)" >&2
    exit 1
fi
