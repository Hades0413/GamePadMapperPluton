# Diagnóstico (noviembre 2026)

Notas de la investigación que llevó al módulo. Sirven para retomar el trabajo o
adaptarlo a otro teléfono o mando.

## Equipo

- Teléfono MediaTek con pantalla de 1080×2340 y ROM personalizada con Android 16.
- Mando Seisa SJA-1006, reportado por ShootingPlus como `GamepadPlus V3`
  (fabricante ShanWan BM-763, firmware 1.09).
- Pantalla táctil real: `fts_ts` (`/dev/input/event4`).

## Modos del mando

| Combinación | Modo |
|---|---|
| Home + A | Digitalizador táctil (`GamepadPlus V3 Touchscreen`): el mando envía toques |
| Home + B | Android (app ShootingPlus, "modo directo" / "modo de activación") |
| Home + X | HID (gamepad estándar) |
| Home + Y | iOS |

## Por qué salía la flecha (Home + A)

`getevent -i` muestra:

```
name: "GamepadPlus V3 Touchscreen"   bus 0005 (BT)  vendor 1949  product 0402
KEY: BTN_TOOL_PEN (0x140), BTN_TOUCH (0x14a)
ABS: X 0..3500, Y 0..4095, MISC 0..15
input props: <none>          <- sin INPUT_PROP_DIRECT
```

Sin archivo IDC, Android lo clasificaba como `Sources: MOUSE | STYLUS`.

## Coordenadas

El mando envía las coordenadas en el sistema **de la pantalla tal como se ve**
(horizontal en los juegos). Por ejemplo, el botón A en Downhill Revived:

```
raw (2967, 3431)  ->  u = 2967/3500 = 0.848, v = 3431/4095 = 0.838
                  ->  (0.848 * 2340, 0.838 * 1080) = (1984, 905)  = botón ✕ del juego
```

- Con `touch.orientationAware = 1` (v1 del módulo), Android tomaba el raw como el
  panel en vertical (`RawToDisplay ROT_0`, cocinado `(915, 1960)`) y luego lo
  giraba, así que **A caía arriba a la derecha**.
- Con `touch.orientationAware = 0` (v2), Android aplica la rotación inversa de la
  pantalla (`InputDeviceOrientation: Rotation270`, `RawToDisplay ROT_90`) y el raw
  queda en el sistema visible. Verificado: raw `(0, 4095)` cae abajo a la izquierda.

## Callejones sin salida (no repetir)

- **ShootingPlus de Google Play (v3.0.1.684):** bloquea "Modo de activación" si
  `SDK >= 30 && isGooglePlayVersion`.
- **ShootingPlus oficial antiguo (v3.0.1.412):** su `QXToolMain` usa
  `InputManager.getInstance()`, que se eliminó en Android 14, así que el servicio
  termina al arrancar.
- **ShootingPlus v3.0.1.682** (`http://file.qixiongfiles.cn/shootingplus-v3.0.1.682.apk`):
  la activación funciona y el servicio arranca (usa `InputManagerGlobal`), pero
  Android 16 rechaza sus inyecciones (`InputDispatcher: Inconsistent event`, todas
  en `x=0, y=1080`).
- **Herramienta de Windows oficial** (`installer-tool-V3.0.0.7`): el enlace devuelve
  "Document not found".
- **Sin root:** SELinux impide que `shell` escriba en `/dev/input/event*`. Sí puede
  usar `/dev/uinput`, que es en lo que se basa `experimental/gpbridge`.

## Comandos útiles

```powershell
adb shell getevent -i                                  # dispositivos de entrada
adb shell getevent -lt /dev/input/event7               # eventos crudos del mando
adb shell dumpsys input | Select-String GamepadPlus -Context 0,140   # clasificación y mapeo
adb shell settings put system show_touches 1           # ver toques en pantalla (0 para quitar)
```
