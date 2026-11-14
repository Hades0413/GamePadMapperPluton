#!/bin/sh
# Tras instalar el .deb: aplica la regla de /dev/uinput sin reiniciar (si udev esta disponible).
set -e
if command -v udevadm >/dev/null 2>&1; then
  modprobe uinput 2>/dev/null || true
  udevadm control --reload-rules 2>/dev/null || true
  udevadm trigger --subsystem-match=misc --sysname-match=uinput 2>/dev/null || true
fi
exit 0
