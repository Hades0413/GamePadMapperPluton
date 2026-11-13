#!/system/bin/sh
# Arranca gpmapper al iniciar el telefono y lo reinicia si se cierra.
# Solo usa la carpeta propia de la app: los perfiles de la carpeta antigua (/sdcard/gamepad-mapper)
# se importan desde la app, con confirmacion del usuario.
MODDIR=${0%/*}
PKG=com.gamepadmapper.app
DATA=/sdcard/Android/data/$PKG/files

# Esperar a que Android termine de arrancar y el almacenamiento este desbloqueado.
until [ "$(getprop sys.boot_completed)" = "1" ]; do sleep 2; done
until [ -d /sdcard/Android ]; do sleep 3; done

# La carpeta la crea la app al abrirse (asi pertenece a la app). Hasta entonces, esperar.
until [ -d "$DATA" ]; do sleep 10; done
mkdir -p "$DATA/profiles"

# Copiar perfiles de ejemplo solo si no existen (no pisar los del usuario).
for f in "$MODDIR"/profiles/*; do
    [ -f "$f" ] || continue
    [ -f "$DATA/profiles/${f##*/}" ] || cp "$f" "$DATA/profiles/"
done
cp -f "$MODDIR/LEEME.txt" "$DATA/LEEME.txt"
chmod 0755 "$MODDIR/gpmapper"

# Lo creado como root pasa a ser de la app (para que lo pueda editar).
fix_owner() {
    owner=$(stat -c %u:%g "$DATA" 2>/dev/null) && chown -R "$owner" "$DATA" 2>/dev/null
}
fix_owner

LOG=$DATA/mapper.log
(
    while true; do
        # Rotar el log si pasa de 512 KB.
        if [ -f "$LOG" ] && [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 524288 ]; then
            mv -f "$LOG" "$LOG.1"
        fi
        "$MODDIR/gpmapper" -d "$DATA/profiles" >> "$LOG" 2>&1
        echo "$(date -u '+%Y-%m-%d %H:%M:%SZ') gpmapper termino (codigo $?), reiniciando en 3 s" >> "$LOG"
        fix_owner
        sleep 3
    done
) &
