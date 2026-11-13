# gpbridge (experimental)

Puente en espacio de usuario que se escribió **antes del root**, como alternativa
al módulo. Ahora no se usa, pero sirve como base para un mapeador propio.

Qué hace:

1. Busca `/dev/input/eventN` llamado `GamepadPlus V3 Touchscreen` y lo captura en
   exclusiva (`EVIOCGRAB`), así Android deja de ver el "ratón".
2. Crea una pantalla táctil virtual con `/dev/uinput` (`INPUT_PROP_DIRECT`,
   multitáctil, 1080×2340).
3. Reenvía cada toque del mando (rango 0..3500 × 0..4095) a esa pantalla virtual.
   Con `-r 0..3` se rota.
4. Si el mando se desconecta, espera y lo vuelve a capturar al reconectarse.

Funciona sin root porque `shell` puede usar `/dev/uinput` (grupo `net_bt_admin`),
aunque SELinux no le deja escribir en `/dev/input/event*`. Ojo: no tiene en cuenta
la orientación de la pantalla, cosa que el módulo IDC sí resuelve.

## Compilar

Necesita [Zig](https://ziglang.org/download/) 0.13 o superior (compilador C portátil):

```powershell
.\build.ps1 -Zig C:\ruta\a\zig.exe
```

## Ejecutar

```powershell
adb push gpbridge /data/local/tmp/
adb shell chmod 755 /data/local/tmp/gpbridge
adb shell "setsid nohup /data/local/tmp/gpbridge -v > /data/local/tmp/gpbridge.log 2>&1 < /dev/null &"
```

Opciones: `-v` (registro detallado), `-r ROT` (0-3), `-W`/`-H` (resolución),
`-n NOMBRE` (nombre del dispositivo de origen).

## Idea para el "nivel 2" (mapeador propio)

Cambiar la entrada por el mando en **modo HID (Home + X)**, es decir, botones y
ejes de gamepad estándar, y traducir cada botón a un toque según un perfil por
juego, por ejemplo `profiles/downhill.json`:

```json
{
  "A":  { "tap":  [1984, 905] },
  "L3": { "tap":  [707, 917] },
  "LS": { "stick": { "center": [405, 735], "radius": 180 } }
}
```

Con root se puede arrancar como servicio desde el propio módulo Magisk (`service.sh`).
