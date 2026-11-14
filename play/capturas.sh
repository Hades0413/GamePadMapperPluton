#!/usr/bin/env bash
# Capturas de la ficha de Google Play (adb screencap a 1080x2400, español e inglés) desde un EMULADOR.
#   ./play/capturas.sh [apk] [serie]     (por defecto: el APK mas reciente de dist/ y emulator-5554)
# Resultado: play/capturas/<es|en>/NN-nombre.png, listas para Play (1080x2160 y 2160x1080; revisalas).
#
# - SOLO emuladores: instala la app, un juego de demostracion (play/demo-juego) y perfiles de
#   ejemplo, y toca la pantalla con adb. Nunca en un telefono real.
# - Activa la Accesibilidad de la app en el emulador para que el estado salga «activo».
# - Juego de demostracion: se compila aqui (aapt2 + javac + d8) y se firma con una clave
#   temporal que se borra al terminar. No se publica.
# Necesita: make setup (tools/jdk y tools/android-sdk), adb y un emulador ya arrancado, p. ej.
#   ~/Android/Sdk/emulator/emulator -avd Pixel_7_API_35 -no-snapshot-save -no-audio &
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
apk="${1:-$(ls -t "$root"/dist/GamepadMapper-*.apk 2>/dev/null | head -n1)}"
serial="${2:-${ANDROID_SERIAL:-emulator-5554}}"
pkg=com.gamepadmapper.app
demo=org.pluton.demojuego
case "$serial" in
    emulator-*) ;;
    *) echo "Solo en emuladores: este script toca la pantalla e instala apps de prueba" >&2; exit 1 ;;
esac
[ -f "$apk" ] || { echo "Falta el APK (make apk)" >&2; exit 1; }
adb_bin="$(command -v adb)" || { echo "Falta adb" >&2; exit 1; }
adb() { timeout "${ADB_TIMEOUT:-60}" "$adb_bin" -s "$serial" "$@"; }

jdk="${JDK:-$root/tools/jdk}"
sdk="${ANDROID_SDK:-$root/tools/android-sdk}"
bt="$sdk/build-tools/${BUILD_TOOLS:-36.1.0}"
jar="$sdk/platforms/${PLATFORM:-android-36}/android.jar"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "== Juego de demostración"
src="$here/demo-juego"
"$bt/aapt2" compile --dir "$src/res" -o "$tmp/res.zip"
"$bt/aapt2" link -I "$jar" --manifest "$src/AndroidManifest.xml" -o "$tmp/demo.apk" "$tmp/res.zip"
mkdir -p "$tmp/cls" "$tmp/dex"
"$jdk/bin/javac" -nowarn -encoding UTF-8 --release 11 -cp "$jar" -d "$tmp/cls" $(find "$src/src" -name '*.java')
"$bt/d8" --release --min-api 26 --lib "$jar" --output "$tmp/dex" $(find "$tmp/cls" -name '*.class')
(cd "$tmp/dex" && python3 -I -c 'import zipfile,sys;zipfile.ZipFile(sys.argv[1],"a",zipfile.ZIP_DEFLATED).write("classes.dex")' "$tmp/demo.apk")
"$bt/zipalign" -p -f 4 "$tmp/demo.apk" "$tmp/demo-al.apk"
pw="$(python3 -I -c 'import secrets;print(secrets.token_hex(12))')"
"$jdk/bin/keytool" -genkeypair -keystore "$tmp/demo.jks" -storetype PKCS12 -alias demo -keyalg RSA -keysize 2048 \
    -validity 2 -storepass "$pw" -keypass "$pw" -dname 'CN=Demo capturas' >/dev/null 2>&1
"$bt/apksigner" sign --ks "$tmp/demo.jks" --ks-key-alias demo --ks-pass "pass:$pw" --key-pass "pass:$pw" \
    --out "$tmp/demo-firmado.apk" "$tmp/demo-al.apk"

echo "== Emulador $serial"
ADB_TIMEOUT=300 adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
size_before="$(adb shell wm size | sed -n 's/^Override size: //p' | tr -d '\r')"
dens_before="$(adb shell wm density | sed -n 's/^Override density: //p' | tr -d '\r')"
restore() {
    adb shell settings put system user_rotation 0 >/dev/null 2>&1 || true
    if [ -n "$size_before" ]; then adb shell wm size "$size_before"; else adb shell wm size reset; fi
    if [ -n "$dens_before" ]; then adb shell wm density "$dens_before"; else adb shell wm density reset; fi
    rm -rf "$tmp"
}
trap restore EXIT
adb shell wm size 1080x2400
adb shell wm density 420
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 0
# Barra de estado limpia (modo demo de SystemUI: hora fija, bateria llena, sin notificaciones)
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 1200 >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4 -e mobile hide >/dev/null
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false >/dev/null

ADB_TIMEOUT=240 adb install -r -g "$apk" >/dev/null
adb uninstall "$demo" >/dev/null 2>&1 || true   # la clave temporal cambia en cada ejecucion
ADB_TIMEOUT=240 adb install "$tmp/demo-firmado.apk" >/dev/null
# Permisos del emulador para que todo salga activo (en un telefono los da el usuario).
adb shell appops set "$pkg" SYSTEM_ALERT_WINDOW allow
adb shell appops set "$pkg" GET_USAGE_STATS allow
adb shell appops set "$pkg" ACCESS_RESTRICTED_SETTINGS allow
adb shell dumpsys deviceidle whitelist +"$pkg" >/dev/null 2>&1 || true
# Sin el aviso de pantalla completa del juego de demostracion
adb shell settings put secure immersive_mode_confirmations confirmed
# Abrir la app con la Accesibilidad activa (Android la desactiva al forzar la detencion).
start_app() {
    adb shell wm size 1080x2400
    adb shell settings put system user_rotation 0
    adb shell cmd window user-rotation lock 0 >/dev/null 2>&1 || true
    adb shell am force-stop "$pkg"
    adb shell settings put secure enabled_accessibility_services "$pkg/.PadService"
    adb shell settings put secure accessibility_enabled 1
    adb shell am start -n "$pkg/.MainActivity" >/dev/null
    sleep 4
}
base="/sdcard/Android/data/$pkg/files"
start_app
adb shell mkdir -p "$base/profiles"
adb shell "rm -f $base/profiles/*.conf $base/active.txt"   # solo perfiles de ejemplo en las capturas
adb push "$here/demo-juego/$demo.conf" "$base/profiles/$demo.conf" >/dev/null
# Varios perfiles para el mismo juego (modos de juego), como haria un jugador
sed "s/^name = .*/name = Derrape/" "$here/demo-juego/$demo.conf" > "$tmp/derrape.conf"
sed "s/^name = .*/name = Contrarreloj/" "$here/demo-juego/$demo.conf" > "$tmp/crono.conf"
adb push "$tmp/derrape.conf" "$base/profiles/$demo-2.conf" >/dev/null
adb push "$tmp/crono.conf" "$base/profiles/$demo-3.conf" >/dev/null

tap_text() {   # toca el primer texto que coincida (expresion regular) segun uiautomator (3 intentos)
    local b="" i
    for i in 1 2 3; do
        if adb shell uiautomator dump /sdcard/gpm-ui.xml >/dev/null 2>&1; then
            b="$(adb shell cat /sdcard/gpm-ui.xml | tr '>' '\n' | grep -E "text=\"($1)\"" | head -n1 \
                | sed -nE 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/p' || true)"
        fi
        [ -n "$b" ] && break
        sleep 1
    done
    [ -n "$b" ] || return 1
    set -- $b
    adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}
tap_scroll() {   # como tap_text, bajando la pagina hasta encontrarlo
    for _ in 1 2 3 4 5 6; do
        tap_text "$1" && return 0
        adb shell input swipe 540 1700 540 700 250
        sleep 1
    done
    return 1
}
# Google Play admite como mucho 2:1 (1080x2400 es 2,22:1): las verticales se capturan a 1080x2400 y
# se recortan a 1080x2160 quitando la barra de estado (170 px) y el borde de gestos (70 px); las
# horizontales (juego) se capturan con la pantalla a 1080x2160, o sea 2160x1080.
shot() {
    sleep "${2:-2}"
    adb exec-out screencap -p > "$tmp/shot.png"
    local wh
    wh="$(python3 -I -c "import struct,sys;d=open(sys.argv[1],\"rb\").read(24);print(*struct.unpack(\">II\",d[16:24]))" "$tmp/shot.png")"
    if [ "$wh" = "1080 2400" ]; then convert "$tmp/shot.png" -crop 1080x2160+0+170 +repage "$out/$1.png"
    else cp "$tmp/shot.png" "$out/$1.png"; fi
    echo "  $1 ($(python3 -I -c "import struct,sys;d=open(sys.argv[1],\"rb\").read(24);print(\"%dx%d\" % struct.unpack(\">II\",d[16:24]))" "$out/$1.png"))"
}
# Espera a que la pantalla este en vertical (al cerrar el juego, Android tarda en girarla).
portrait() {
    for _ in $(seq 1 20); do
        # (sin grep -q: con pipefail, cortar la tuberia antes de tiempo cuenta como fallo)
        adb shell dumpsys window displays | grep "mCurrentRotation=ROTATION_0" >/dev/null && { sleep 1; return 0; }
        sleep 1
    done
}
nav_y=2240   # altura de la barra inferior: 2240 con 1080x2400, 2000 con 1080x2160
tab() { portrait; adb shell input tap "$1" "$nav_y"; sleep 2; }

for lang in es en; do
    out="$here/capturas/$lang"
    mkdir -p "$out"
    echo "== Capturas ($lang) -> $out"
    adb shell am force-stop "$demo"
    start_app
    tap_text "Saltar|Skip" && sleep 2 || true
    # Idioma de la app: Ajustes > Idioma (reintenta si la pantalla aun estaba girando)
    want="English"; [ "$lang" = es ] && want="Español"
    for _ in 1 2 3; do tab 958; tap_scroll "$want" && break; start_app; done
    sleep 1
    start_app
    tab 120; shot 01-inicio 2
    tab 330; shot 02-juegos 3
    tab 540; shot 03-mando 2
    tab 748; shot 04-perfiles 2
    adb shell am start -a android.intent.action.VIEW -d "gpmapper://juego/com.supercell.brawlstars" "$pkg" >/dev/null
    shot 05-comunidad 6
    adb shell input keyevent KEYCODE_BACK
    # Burbuja sobre el juego de demostracion (horizontal)
    adb shell wm size 1080x2160
    adb shell am start -n "$demo/.Demo" >/dev/null
    sleep 5
    tap_text "Got it|Entendido|Aceptar" || true
    shot 06-burbuja 3
    # Editor dentro del juego: Perfiles > el perfil de la demo > Editar controles (abre el juego)
    # (con la pantalla ya a 1080x2160: cambiarla con la hoja abierta la cierra)
    adb shell am force-stop "$demo"
    start_app
    adb shell wm size 1080x2160
    sleep 2
    nav_y=2000
    tab 748
    tap_text "Carrera"
    sleep 2
    tap_text "Editar controles|Edit controls"
    shot 07-editor 8
    adb shell input keyevent KEYCODE_BACK
    adb shell am force-stop "$demo"
    adb shell wm size 1080x2400
    nav_y=2240
    sleep 1
done
adb shell am force-stop "$demo"
adb shell am broadcast -a com.android.systemui.demo -e command exit >/dev/null
echo "Listo: revisa play/capturas/*/ (la burbuja y el editor salen en horizontal)"
