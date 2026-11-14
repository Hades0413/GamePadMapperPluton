# Ejecutado por Magisk durante la instalacion.
ui_print "- Gamepad Mapper"
ui_print "  Perfiles y registro en la carpeta de la app:"
ui_print "  /sdcard/Android/data/com.gamepadmapper.app/files"
ui_print "  (abre la app una vez para crearla)"
ui_print "  Conecta el mando en modo gamepad (Home + X)"
set_perm "$MODPATH/gpmapper" 0 0 0755
set_perm "$MODPATH/service.sh" 0 0 0755
