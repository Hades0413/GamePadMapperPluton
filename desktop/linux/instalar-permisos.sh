#!/usr/bin/env bash
# Comprueba los permisos que necesita gpm-escritorio en Linux y muestra las ordenes para darlos.
# No ejecuta sudo: copia y ejecuta tu las ordenes que salgan (una sola vez).
#   - leer el mando: /dev/input/event* (grupo 'input')
#   - crear la pantalla tactil virtual: /dev/uinput (regla udev 99-gamepad-mapper.rules)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
usuario="${USER:-$(id -un)}"
falta=0

echo "Gamepad Mapper Pluton - permisos para gpm-escritorio"
echo

if id -nG "$usuario" | tr ' ' '\n' | grep -qx input; then
    echo "  OK  $usuario esta en el grupo 'input' (puede leer los mandos)"
else
    echo "  --  $usuario NO esta en el grupo 'input'"
    falta=1
fi

if [ -w /dev/uinput ]; then
    echo "  OK  /dev/uinput se puede escribir (pantalla tactil virtual)"
else
    echo "  --  /dev/uinput no se puede escribir"
    falta=1
fi

if [ -f /etc/udev/rules.d/99-gamepad-mapper.rules ]; then
    echo "  OK  regla udev instalada"
fi

if [ "$falta" = 0 ]; then
    echo
    echo "Todo listo. Prueba: gpm-escritorio --lista-mandos"
    exit 0
fi

cat <<EOF

Ejecuta estas ordenes (piden tu contrasena) y despues cierra la sesion y vuelve a entrar:

  sudo install -m 644 "$here/99-gamepad-mapper.rules" /etc/udev/rules.d/
  echo uinput | sudo tee /etc/modules-load.d/gamepad-mapper-uinput.conf
  sudo modprobe uinput
  sudo udevadm control --reload-rules
  sudo udevadm trigger --subsystem-match=misc
  sudo usermod -aG input $usuario

Despues vuelve a ejecutar este script para comprobarlo.
Mientras tanto puedes probar sin permisos de uinput con --probar (escribe los toques en la consola).
EOF
exit 1
