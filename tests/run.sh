#!/usr/bin/env bash
# Pruebas del formato de perfil, sin telefono:
#  1. ProfileTest (Java, la app): leer/guardar/leer, estabilidad y compatibilidad.
#  2. gpmapper -c (C, motor root) sobre el mismo perfil: debe entenderlo igual que la app.
#  3. gpmapper -F: adaptar a otras pantallas igual que la app.
#  4. gpmapper -r: guiones de eventos del mando (tests/engine) -> toques, comparados con lo esperado.
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
else
    echo "DIFERENCIAS entre la app (-) y gpmapper (+)" >&2
    exit 1
fi

echo "== Otras pantallas (app y gpmapper adaptan igual)"
# sw,sh,w,h,x,y: misma proporcion, mas ancha (21:9), mas estrecha (16:9), vertical, bordes y centro.
cases="2400,1080,2400,1080,1932,960 2400,1080,1200,540,1932,960 2400,1080,2560,1080,1932,960
2400,1080,2560,1080,344,828 2400,1080,2560,1080,1200,300 2400,1080,1920,1080,1932,960
2400,1080,1920,1080,344,828 2400,1080,1920,1080,1200,540 2400,1080,2340,1080,900,500
2340,1080,2400,1080,0,0 2340,1080,2400,1080,2339,1079 1080,2400,1080,1920,540,2200 1080,2400,1080,1920,100,300"
"$jdk/bin/javac" -nowarn -encoding UTF-8 -cp "$jar" -sourcepath "$root/app/src" -d "$out/cls" "$here/FitTest.java"
"$jdk/bin/java" -cp "$out/cls$sep$jar" FitTest $cases > "$out/fit-java.txt"
for c in $cases; do "$out/gpmapper" -F "$c"; done > "$out/fit-c.txt"
# Iguales salvo redondeo de float (app) frente a double (gpmapper): tolerancia de 0,05 px.
if paste -d' ' "$out/fit-java.txt" "$out/fit-c.txt" | awk '{ for (i = 1; i <= 3; i++) { d = $i - $(i + 3); if (d < 0) d = -d; if (d > 0.05) bad = 1 } } END { exit bad }'; then
    echo "gpmapper: adapta a otras pantallas igual que la app"
else
    echo "DIFERENCIAS al adaptar entre la app y gpmapper:" >&2
    paste "$out/fit-java.txt" "$out/fit-c.txt" >&2
    exit 1
fi
# Misma proporcion = sin cambios; cada borde conserva su distancia (mas ancha: +160 px a la derecha).
expect="1932.00 960.00 1.0000
966.00 480.00 0.5000
2092.00 960.00 1.0000
344.00 828.00 1.0000
1280.00 300.00 1.0000
1452.00 960.00 1.0000
344.00 828.00 1.0000
960.00 540.00 1.0000"
if [ "$(sed -n '1,8p' "$out/fit-java.txt")" = "$expect" ]; then
    echo "anclaje a los bordes: correcto"
else
    echo "El anclaje no da lo esperado:" >&2; cat "$out/fit-java.txt" >&2; exit 1
fi

echo "== Motor (gpmapper -r: guiones de eventos -> toques, con reloj virtual)"
# Cada tests/engine/NOMBRE.txt se repite con NOMBRE.conf (o perfil.conf) y se compara con
# NOMBRE.esperado. Si un cambio del motor es intencionado: ACTUALIZAR=1 make test
fallos=0
for guion in "$here"/engine/*.txt; do
    nombre="$(basename "$guion" .txt)"
    conf="$here/engine/$nombre.conf"; [ -f "$conf" ] || conf="$here/engine/perfil.conf"
    esperado="$here/engine/$nombre.esperado"
    "$out/gpmapper" -r "$conf" "$guion" 2>/dev/null > "$out/$nombre.txt" || { echo "  $nombre: fallo al repetir" >&2; fallos=1; continue; }
    if [ "${ACTUALIZAR:-0}" = 1 ]; then cp "$out/$nombre.txt" "$esperado"; echo "  $nombre: actualizado"; continue; fi
    if diff -u "$esperado" "$out/$nombre.txt" > "$out/$nombre.diff"; then
        echo "  $nombre: igual"
    else
        echo "  $nombre: DIFERENTE (- esperado, + ahora)" >&2; head -n 40 "$out/$nombre.diff" >&2; fallos=1
    fi
done
[ "$fallos" = 0 ] || exit 1
echo "TODO CORRECTO"
