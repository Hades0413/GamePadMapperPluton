#!/usr/bin/env bash
# Compila la app sin Gradle (Linux, macOS y Windows con Git Bash).
#   ./app/build.sh          APK firmado  -> dist/GamepadMapper-<version>.apk   (instalar por USB)
#   ./app/build.sh aab      App Bundle   -> dist/GamepadMapper-<version>.aab   (Google Play)
#   ./app/build.sh all      los dos
# aapt2 -> javac -> d8 -> (zipalign + apksigner | bundletool + jarsigner).
#
# Herramientas (las descarga "make setup"): tools/jdk, tools/android-sdk (platform $PLATFORM,
# build-tools $BUILD_TOOLS) y tools/bundletool.jar (solo AAB). Se pueden cambiar con JDK=,
# ANDROID_SDK=, PLATFORM=, BUILD_TOOLS=, BUNDLETOOL=.
# Clave de firma: se busca en $KEYSTORE_DIR, ../keystore o
# ../../../gamepad-mapper-CLAVE-FIRMA-PRIVADA/keystore. Si no aparece, NO se crea una
# nueva salvo con NEW_KEY=1 (una clave distinta impide actualizar la app instalada).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
mode="${1:-apk}"
case "$mode" in apk|aab|all) ;; *) echo "uso: $0 [apk|aab|all]" >&2; exit 2 ;; esac

jdk="${JDK:-$root/tools/jdk}"
sdk="${ANDROID_SDK:-$root/tools/android-sdk}"
platform="${PLATFORM:-android-36}"
bt="$sdk/build-tools/${BUILD_TOOLS:-36.1.0}"
android_jar="$sdk/platforms/$platform/android.jar"
bundletool="${BUNDLETOOL:-$root/tools/bundletool.jar}"

# Nombre real de una herramienta: en Windows es aapt2.exe, d8.bat, javac.exe...
tool() {
    local ext
    for ext in "" .exe .bat .cmd; do
        if [ -f "$1$ext" ]; then echo "$1$ext"; return 0; fi
    done
    echo "Falta $1 (ejecuta: make setup)" >&2
    exit 1
}
PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "Falta Python 3 (python3 o python en el PATH)" >&2; exit 1; }

javac="$(tool "$jdk/bin/javac")"
java="$(tool "$jdk/bin/java")"
aapt2="$(tool "$bt/aapt2")"
d8="$(tool "$bt/d8")"
[ -f "$android_jar" ] || { echo "Falta $android_jar (ejecuta: make setup)" >&2; exit 1; }
export JAVA_HOME="$jdk"
export PATH="$jdk/bin:$PATH"

run() {  # solo cuenta el codigo de salida; muestra lineas con "error"
    local out code
    set +e; out="$("$@" 2>&1)"; code=$?; set -e
    grep -i 'error' <<<"$out" | sed 's/^/  /' || true
    if [ $code -ne 0 ]; then echo "$out" | sed 's/^/  /'; echo "Fallo: $(basename "$1") (codigo $code)" >&2; exit 1; fi
}

manifest="$here/AndroidManifest.xml"
version="$("$PY" -I -c 'import sys,xml.etree.ElementTree as E;print(E.parse(sys.argv[1]).getroot().get("{http://schemas.android.com/apk/res/android}versionName"))' "$manifest")"

build="$here/build"
rm -rf "$build"
mkdir -p "$build/gen" "$build/classes" "$build/dex" "$build/assets/presets"

# Modulo root dentro de la app (la version mas alta de dist/gamepad_mapper-vN.zip)
mod="$("$PY" -I - "$root/dist" <<'PY'
import glob, os, re, sys
z = glob.glob(os.path.join(sys.argv[1], "gamepad_mapper-v*.zip"))
z.sort(key=lambda p: int(re.sub(r"\D", "", os.path.basename(p)) or 0))
print(z[-1] if z else "")
PY
)"
[ -n "$mod" ] || { echo "Falta dist/gamepad_mapper-v*.zip (genera el modulo con mapper/build.sh)" >&2; exit 1; }
cp "$mod" "$build/assets/gamepad_mapper.zip"
echo "   modulo root incluido: $(basename "$mod")"
gpm="$root/mapper/module/gpmapper"
[ -f "$gpm" ] || { echo "Falta $gpm (compila antes con mapper/build.sh)" >&2; exit 1; }
cp "$gpm" "$build/assets/gpmapper"
cp "$root"/presets/*.json "$root"/presets/*.conf "$build/assets/presets/" 2>/dev/null || true
echo "   catalogo incluido: $(ls "$build/assets/presets" | wc -l | tr -d ' ') archivos"

echo "1/5 Recursos (aapt2, $platform)..."
run "$aapt2" compile --dir "$here/res" -o "$build/res.zip"
run "$aapt2" link -I "$android_jar" --manifest "$manifest" --java "$build/gen" \
    -A "$build/assets" -o "$build/unsigned.apk" "$build/res.zip"

echo "2/5 Java (javac)..."
find "$here/src" "$build/gen" -name '*.java' > "$build/sources.txt"
run "$javac" -encoding UTF-8 --release 11 -classpath "$android_jar" -d "$build/classes" "@$build/sources.txt"

echo "3/5 Dex (d8)..."
find "$build/classes" -name '*.class' > "$build/classes.txt"
run "$d8" --release --min-api 26 --lib "$android_jar" --output "$build/dex" "@$build/classes.txt"

echo "4/5 Clave de firma..."
ks_dir=""
for d in "${KEYSTORE_DIR:-}" "$root/keystore" "$root/../../gamepad-mapper-CLAVE-FIRMA-PRIVADA/keystore"; do
    if [ -n "$d" ] && [ -f "$d/gamepad-mapper.jks" ]; then ks_dir="$(cd "$d" && pwd)"; break; fi
done
if [ -z "$ks_dir" ]; then
    if [ "${NEW_KEY:-0}" != "1" ]; then
        echo "No se encontro keystore/gamepad-mapper.jks. Usa KEYSTORE_DIR=<carpeta>, o NEW_KEY=1 para crear una" >&2
        echo "clave NUEVA (las apps firmadas con la anterior no se podran actualizar)." >&2
        exit 1
    fi
    ks_dir="${KEYSTORE_DIR:-$root/keystore}"; mkdir -p "$ks_dir"
    pw="$("$PY" -I -c 'import secrets; print(secrets.token_hex(16))')"
    printf '%s' "$pw" > "$ks_dir/password.txt"; chmod 600 "$ks_dir/password.txt" 2>/dev/null || true
    run "$(tool "$jdk/bin/keytool")" -genkeypair -keystore "$ks_dir/gamepad-mapper.jks" -storetype PKCS12 \
        -alias gamepadmapper -keyalg RSA -keysize 4096 -validity 10950 -storepass "$pw" -keypass "$pw" \
        -dname 'CN=Gamepad Mapper, O=Personal'
    echo "  Clave creada en $ks_dir (guardala fuera de git)"
fi
echo "   clave: $ks_dir/gamepad-mapper.jks"
ks="$ks_dir/gamepad-mapper.jks"
pw="$(tr -d '\r\n' < "$ks_dir/password.txt")"
mkdir -p "$root/dist"

echo "5/5 Empaquetado y firma..."
if [ "$mode" = apk ] || [ "$mode" = all ]; then
    (cd "$build/dex" && "$PY" -I -c 'import zipfile,sys;zipfile.ZipFile(sys.argv[1],"a",zipfile.ZIP_DEFLATED).write("classes.dex")' "$build/unsigned.apk")
    run "$(tool "$bt/zipalign")" -p -f 4 "$build/unsigned.apk" "$build/aligned.apk"
    apk="$root/dist/GamepadMapper-$version.apk"
    apksigner="$(tool "$bt/apksigner")"
    run "$apksigner" sign --ks "$ks" --ks-key-alias gamepadmapper --ks-pass "pass:$pw" \
        --key-pass "pass:$pw" --out "$apk" "$build/aligned.apk"
    run "$apksigner" verify "$apk"
    rm -f "$apk.idsig"
    echo "APK generado: $apk"
fi

if [ "$mode" = aab ] || [ "$mode" = all ]; then
    [ -f "$bundletool" ] || { echo "Falta $bundletool (ejecuta: make setup)" >&2; exit 1; }
    # Recursos en formato protobuf y modulo "base" con la estructura que pide bundletool:
    # manifest/AndroidManifest.xml, resources.pb, res/, assets/, dex/classes.dex
    run "$aapt2" link --proto-format -I "$android_jar" --manifest "$manifest" \
        -A "$build/assets" -o "$build/proto.zip" "$build/res.zip"
    "$PY" -I - "$build/proto.zip" "$build/dex/classes.dex" "$build/base.zip" <<'PY'
import sys, zipfile
src, dex, out = sys.argv[1:]
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        name = "manifest/AndroidManifest.xml" if item.filename == "AndroidManifest.xml" else item.filename
        zout.writestr(name, zin.read(item.filename))
    zout.write(dex, "dex/classes.dex")
PY
    aab="$root/dist/GamepadMapper-$version.aab"
    rm -f "$aab" "$build/unsigned.aab"
    run "$java" -jar "$bundletool" build-bundle --modules="$build/base.zip" --output="$build/unsigned.aab"
    jarsigner="$(tool "$jdk/bin/jarsigner")"
    run "$jarsigner" -keystore "$ks" -storepass "$pw" -keypass "$pw" -sigalg SHA256withRSA -digestalg SHA-256 \
        -signedjar "$aab" "$build/unsigned.aab" gamepadmapper
    run "$jarsigner" -verify "$aab"
    echo "AAB generado (Google Play): $aab"
fi
