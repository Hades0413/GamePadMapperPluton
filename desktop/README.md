# gpm-escritorio: Gamepad Mapper Plutón en el PC (Linux y Windows)

Juega con mando a juegos **Android que se ven en el PC** (scrcpy, Waydroid, un emulador...) que
solo tienen controles táctiles. `gpm-escritorio` convierte los botones y sticks del mando en
toques dentro de la **ventana del juego**, con **los mismos perfiles** que la app de Android
(los tuyos o los de la [comunidad](https://hades0413.github.io/GamePadMapperPluton/)).

Es la **versión de referencia** del motor: usa exactamente el mismo núcleo
(`mapper/src/core/`) que el motor root de la app (`gpmapper`), así que un perfil hace lo mismo en
el móvil y en el PC: toque, toque rápido, ráfaga, turbo, interruptor, deslizar, macros, capas
(`L2+A`), joystick con cruceta, cámara con `aim_button` y `look_accel`, ejes como botones y
vibración. El perfil se **adapta al tamaño de la ventana** con la misma fórmula que en un móvil
con otra pantalla (cada botón conserva su distancia al borde más cercano).

## Descargar

En [Releases](https://github.com/Hades0413/GamePadMapperPluton/releases/latest), junto al APK:

- `gpm-escritorio-linux-x86_64` — Linux de 64 bits (binario estático, funciona en cualquier distribución)
- `gpm-escritorio-windows-x86_64.exe` — Windows 8 o posterior (64 bits)

O compílalo (desde Linux, macOS o Windows con Git Bash; solo hace falta Zig, `make setup` lo descarga):

```bash
make escritorio-linux     # -> dist/gpm-escritorio-linux-x86_64
make escritorio-windows   # -> dist/gpm-escritorio-windows-x86_64.exe
```

## Linux

### Permisos (una vez)

Hace falta **leer el mando** (`/dev/input/event*`, grupo `input`) y **crear una pantalla táctil
virtual** (`/dev/uinput`). El script comprueba lo que falta y muestra las órdenes (no ejecuta `sudo`
por ti):

```bash
desktop/linux/instalar-permisos.sh
```

Instala la regla `desktop/linux/99-gamepad-mapper.rules` (acceso a `/dev/uinput` para el grupo
`input` y el usuario con sesión abierta) y te añade al grupo `input`. Después, cierra la sesión y
vuelve a entrar.

### Ejemplos

```bash
chmod +x gpm-escritorio-linux-x86_64
./gpm-escritorio-linux-x86_64 --lista-mandos

# scrcpy (el título de la ventana es el modelo del móvil, o el que pongas con --window-title)
scrcpy --window-title "Juego" &
./gpm-escritorio-linux-x86_64 --perfil mi-juego.conf --ventana "Juego"

# Un perfil de la comunidad (su id o la dirección de su página en la web)
./gpm-escritorio-linux-x86_64 --comunidad 0ab1221a-6392-4ef9-af66-db69ee6a871f --ventana "Juego"

# Waydroid u otra ventana en un sitio fijo del escritorio: x, y, ancho, alto
./gpm-escritorio-linux-x86_64 --perfil mi-juego.conf --rect 0,0,1920,1080
```

- Con `--ventana`, solo se mapea **mientras esa ventana tiene el foco**; el resto del tiempo el
  mando funciona como un mando normal. Mientras se mapea, el mando se usa en exclusiva (el
  escritorio y otros programas no lo ven), igual que en el móvil.
- Sin `--ventana` ni `--rect`, los toques van a toda la pantalla (`--pantalla 1920x1080` si no se
  puede detectar su tamaño con `xrandr`/`xdpyinfo`).
- **SELECT+START** (1 s) pausa o reanuda el mapeo.

## Windows

```bat
gpm-escritorio-windows-x86_64.exe --lista-mandos
gpm-escritorio-windows-x86_64.exe --perfil mi-juego.conf --ventana "BlueStacks"
gpm-escritorio-windows-x86_64.exe --comunidad 0ab1221a-6392-4ef9-af66-db69ee6a871f --ventana "Juego"
gpm-escritorio-windows-x86_64.exe --perfil mi-juego.conf --rect 0,0,1920,1080 --mando 1
```

Lee los mandos **XInput** (hasta 4; `--mando N` elige uno) y genera **toques reales de Windows**
(`InjectTouchInput`, multitáctil). Los botones se llaman igual que en los perfiles: A, B, X, Y,
L1, R1, L2, R2 (gatillos), L3, R3, SELECT (Back/View), START (Menu), DPAD_*; los sticks son `LS` y
`RS`, y los gatillos también valen como `AXIS_2+` / `AXIS_5+` (como un mando Xbox en Linux/Android).

## Opciones

| Opción | Qué hace |
|---|---|
| `--perfil ARCHIVO.conf` | Perfil, en el mismo formato que la app |
| `--comunidad ID` | Descarga un perfil publicado (necesita `curl`; se guarda en `~/.cache/gamepad-mapper` o `%LOCALAPPDATA%\GamepadMapper`) |
| `--ventana "TÍTULO"` | Toca dentro de la ventana cuyo título contiene ese texto (sin distinguir mayúsculas) |
| `--rect X,Y,ANCHO,ALTO` | Toca dentro de ese rectángulo del escritorio |
| `--pantalla ANCHOxALTO` | Tamaño del escritorio, si no se detecta |
| `--mando TEXTO` | Linux: el mando cuyo nombre contiene TEXTO. Windows: número 0-3 |
| `--lista-mandos` | Muestra los mandos y sale |
| `--probar` | No toca: escribe los toques en la consola (sirve sin permisos de uinput) |
| `--repetir GUION` | Con `--probar`: repite un guion de eventos de `tests/engine/` sin mando |
| `-v` | Registro detallado |

## Probar sin mando

```bash
./gpm-escritorio-linux-x86_64 --probar --perfil tests/engine/perfil.conf \
    --rect 100,50,1920,1080 --repetir tests/engine/macro.txt
```

escribe cada toque (en píxeles del escritorio) que el perfil generaría con ese guion. Es el mismo
motor que comprueba `make test` (ver `tests/engine/`).

## Limitaciones

- **Wayland (Linux):** `--ventana` necesita X11 o XWayland (y `xwininfo`/`xprop` de `x11-utils`, o
  `xdotool`). En una sesión Wayland nativa no se pueden buscar ventanas ni saber cuál tiene el foco:
  usa `--rect`. Algunos escritorios Wayland asocian la pantalla táctil virtual a un solo monitor.
- **El programa que muestra el juego debe aceptar toques:** scrcpy reenvía los toques al móvil
  (multitáctil); en un emulador, depende del emulador (los que solo entienden ratón verán un solo
  dedo).
- **Windows:** solo mandos **XInput** (Xbox y compatibles; para otros, Steam Input, DS4Windows o
  x360ce). El botón central (HOME) no se puede leer, y Windows no permite usar el mando en
  exclusiva: si el emulador también lee el mando, desactívalo allí. Los toques necesitan Windows 8+.
- `--ventana` ignora la consola donde se lanzó `gpm-escritorio` (su título suele llevar la orden).
- **Un perfil a la vez:** SELECT+R1/L1 (cambiar de perfil del juego) no hace nada en el escritorio.
- Las líneas solo para el modo sin root de la app (`gyro`, `mouse`, `KB_*`, `MOUSE_*`, `P2_*`) se ignoran.

## Cómo está hecho

```
mapper/src/core/        núcleo portable (C estándar): perfiles, adaptar a otra pantalla, lógica
                        mando -> toques, macros; habla con el sistema por gpm_plataforma.h
mapper/src/linux/       mando (evdev) y pantalla táctil virtual (uinput): Android y Linux
mapper/src/gpmapper.c   motor root de la app (plataforma Android)
desktop/comun/          opciones, perfiles de la comunidad y bucle principal del escritorio
desktop/linux/          plataforma Linux (evdev + uinput + ventanas X11)
desktop/windows/        plataforma Windows (XInput + InjectTouchInput + EnumWindows)
```
