#!/usr/bin/env bash
# Pruebas de humo de la app en un emulador (o telefono de pruebas) ya arrancado, sin tocar nada
# de un telefono real: instala el APK, abre cada pantalla y los enlaces, pausa/reanuda con el
# boton de Ajustes rapidos y comprueba que la app no se cierra con un error.
#   ./tests/emulador.sh [apk] [serie]      (por defecto: el APK mas reciente de dist/ y emulator-5554)
# Capturas en: tests/out/emulador-<api>/
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
apk="${1:-$(ls -t "$root"/dist/GamepadMapper-*.apk | head -n1)}"
serial="${2:-${ANDROID_SERIAL:-emulator-5554}}"
pkg=com.gamepadmapper.app
# Cada orden con tiempo maximo: en algunas versiones (p. ej. Android 8) "am start -W" puede no volver.
adb() { timeout "${ADB_TIMEOUT:-60}" adb -s "$serial" "$@"; }

case "$serial" in
    emulator-*) ;;
    *) [ "${GPM_ALLOW_DEVICE:-}" = 1 ] || { echo "Solo en emuladores (GPM_ALLOW_DEVICE=1 para un telefono de pruebas)" >&2; exit 1; } ;;
esac

ADB_TIMEOUT=300 adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
api="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
out="$here/out/emulador-$api"
mkdir -p "$out"   # las capturas se sobrescriben en cada ejecucion
echo "== Android API $api ($serial) · $(basename "$apk")"

fails=0
ok() { echo "  ok    $1"; }
bad() { echo "  FALLO $1" >&2; fails=$((fails + 1)); }
shot() { sleep "${2:-2}"; adb exec-out screencap -p > "$out/$1.png" || true; }
alive() { [ -n "$(adb shell pidof "$pkg" 2>/dev/null | tr -d '\r')" ]; }
# Toca el primer elemento cuyo texto coincida (expresion regular) segun uiautomator.
tap_text() {
    adb shell uiautomator dump /sdcard/gpm-ui.xml >/dev/null 2>&1 || return 1
    local b
    b="$(adb shell cat /sdcard/gpm-ui.xml | tr '>' '\n' | grep -E "text=\"($1)\"" | head -n1 \
        | sed -nE 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/p')"
    [ -n "$b" ] || return 1
    set -- $b
    adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))
}

ADB_TIMEOUT=240 adb install -r -g "$apk" >/dev/null && ok "instalar" || { bad "instalar"; exit 1; }
adb logcat -c 2>/dev/null || true   # Android 8 a veces no deja vaciarlo
adb shell input keyevent KEYCODE_WAKEUP || true
adb shell wm dismiss-keyguard >/dev/null 2>&1 || true

# 1. Abrir la app (bienvenida o inicio)
adb shell am start -n "$pkg/.MainActivity" >/dev/null
shot 01-bienvenida 4
alive && ok "abre la app" || bad "abre la app"
# Saltar la bienvenida (si aparece) para llegar al inicio.
if tap_text "Saltar|Skip"; then shot 01-inicio 3; ok "saltar la bienvenida"; fi

# 2. Un perfil de prueba en la carpeta de la app y volver a abrir
base="/sdcard/Android/data/$pkg/files"
# (En Android 11 el shell no puede crear la carpeta de la app si la app aun no la creo.)
if adb shell mkdir -p "$base/profiles" 2>/dev/null \
   && adb push "$here/fixture.conf" "$base/profiles/com.ejemplo.juego.conf" >/dev/null 2>&1; then
    adb shell am force-stop "$pkg"
    adb shell am start -n "$pkg/.MainActivity" >/dev/null
    shot 02-con-perfil 4
    alive && ok "abre con un perfil (todas las opciones nuevas)" || bad "abre con un perfil"
else
    echo "  --    perfil de prueba omitido (sin acceso a la carpeta de la app en esta versión)"
fi

# 3. Enlaces de la web
adb shell am start -a android.intent.action.VIEW -d "gpmapper://juego/com.supercell.brawlstars" "$pkg" >/dev/null
shot 03-comunidad-juego 5
alive && ok "enlace gpmapper://juego" || bad "enlace gpmapper://juego"
# La lista tiene que cargar: un error del servidor suele ser una migracion sin aplicar.
adb shell uiautomator dump /sdcard/gpm-ui.xml >/dev/null 2>&1 || true
if adb shell cat /sdcard/gpm-ui.xml 2>/dev/null | grep -qE "(respondió|replied) [45][0-9][0-9]"; then
    bad "la comunidad no carga (error del servidor: ¿migraciones sin aplicar en Supabase?)"
else
    ok "la comunidad carga"
fi
adb shell am start -a android.intent.action.VIEW -d "gpmapper://perfil/00000000-0000-0000-0000-000000000000" "$pkg" >/dev/null
shot 04-perfil-inexistente 4
alive && ok "enlace a un perfil que no existe" || bad "enlace a un perfil que no existe"
adb shell am start -a android.intent.action.VIEW -d "gpmapper://subido/no-es-un-id" "$pkg" >/dev/null
sleep 2
alive && ok "enlace gpmapper://subido mal formado" || bad "enlace gpmapper://subido mal formado"

# 4. Boton de Ajustes rapidos (Android 13+: cmd statusbar)
if [ "$api" -ge 33 ]; then
    adb shell cmd statusbar add-tile "$pkg/.PauseTile" >/dev/null 2>&1 || true
    adb shell rm -f "$base/paused"
    # Abrir los Ajustes rapidos hace que Android enlace el boton recien anadido.
    adb shell cmd statusbar expand-settings >/dev/null 2>&1 || true
    sleep 3
    for _ in 1 2 3; do
        adb shell cmd statusbar click-tile "$pkg/.PauseTile" >/dev/null 2>&1 || true
        sleep 2
        adb shell ls "$base/paused" >/dev/null 2>&1 && break
    done
    if adb shell ls "$base/paused" >/dev/null 2>&1; then ok "Ajustes rápidos: pausa"; else bad "Ajustes rápidos: pausa"; fi
    adb shell cmd statusbar click-tile "$pkg/.PauseTile" >/dev/null 2>&1 || true
    sleep 2
    if adb shell ls "$base/paused" >/dev/null 2>&1; then bad "Ajustes rápidos: reanudar"; else ok "Ajustes rápidos: reanudar"; fi
    adb shell cmd statusbar collapse >/dev/null 2>&1 || true
fi

# 5. Girar la pantalla y volver
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
shot 05-horizontal 3
adb shell settings put system user_rotation 0
alive && ok "girar la pantalla" || bad "girar la pantalla"

# 6. Ningun cierre con error de la app en todo el recorrido
adb logcat -d > "$out/logcat.txt"
if grep -A20 "FATAL EXCEPTION" "$out/logcat.txt" | grep -q "$pkg"; then
    bad "la app se cerró con un error (ver $out/logcat.txt)"
    grep -A25 "FATAL EXCEPTION" "$out/logcat.txt" | head -40 >&2
else
    ok "sin errores fatales en el registro"
fi

adb shell rm -f "$base/profiles/com.ejemplo.juego.conf" 2>/dev/null || true
if [ "$fails" -eq 0 ]; then echo "EMULADOR (API $api): TODO CORRECTO"; else echo "EMULADOR (API $api): $fails fallo(s)" >&2; exit 1; fi
