# Gamepad Mapper Plutón — contexto completo del proyecto

> Documento para retomar el proyecto (por una persona o por otro chat de IA) sin tener que
> redescubrir nada. Explica **qué es**, **cómo está hecho**, **por qué se decidió así**,
> **qué está probado**, **qué falta** y **qué no repetir**.
> Versión del proyecto: **1.1** (app `versionName 1.1` / `versionCode 2`, módulo root `v2`, `gpmapper 1.1`,
> `GPM_BUILD 2`; Touch Fix `v1`).
> Autor: **Hades0413** (aparece en Inicio, Ajustes › Acerca de, `module.prop` y README;
> constante `MainActivity.AUTHOR`).

---

## 1. Qué es

**Gamepad Mapper Plutón** convierte un mando (Bluetooth o USB) en **toques de pantalla** en
juegos de Android que solo se controlan tocando la pantalla. Cada juego tiene uno o varios
**perfiles** que dicen qué botón toca qué punto, qué stick hace de joystick o de cámara,
y qué macros (secuencias de toques con tiempos) se lanzan.

Tiene dos motores que leen **los mismos perfiles**:

| Motor | Para quién | Cómo funciona |
|---|---|---|
| **Accesibilidad** (`PadService`, dentro de la app) | Cualquier teléfono, **sin root ni PC** | Servicio de accesibilidad: lee el mando (`onKeyEvent`, y `onMotionEvent` en Android 14+) y toca con `dispatchGesture` |
| **Root** (`gpmapper`, módulo Magisk "Gamepad Mapper Plutón (root)") | Teléfonos con Magisk/KernelSU (mejora opcional) | Daemon nativo en C: lee `/dev/input/event*`, captura el mando (`EVIOCGRAB`) y crea una pantalla táctil virtual con `uinput` |

Si el daemon root está en marcha, el servicio de accesibilidad se queda en espera
(no hay conflicto). La app ofrece la mejora a root desde la tarjeta *Mejora con root*.

Origen: el autor (usuario hispanohablante) tenía un mando **Seisa SJA-1006 / GamepadPlus V3**
(ShanWan BM-763, fw 1.09) que en su ROM (crDroid, Android 16) salía como flecha de ratón.
Se arregló con un IDC por Magisk y luego se construyó un mapeador propio. El proyecto se
publicará en GitHub (el autor lo sube; **no hacer `git push` ni commits por él**).

---

## 2. Reglas y preferencias del autor (respetar)

- Idioma: **español** (código comentado en español, sin tildes en comentarios de código C/Java;
  los textos de la interfaz sí llevan tildes y ñ).
- **No subir a git**: todo se queda en la carpeta local del proyecto; el autor lo sube.
- Módulos nuevos con **id distinto** si no deben reemplazar a los existentes.
- "Corrígelo sin formatear": nunca proponer borrar datos ni reflashear sin necesidad.
- Los usuarios finales **no tendrán root ni PC**: el flujo normal no puede pedir ADB ni root.
  Opciones de desarrollador se aceptarían con una guía, pero hoy **no hacen falta**.
- Los perfiles se crean y gestionan desde la **burbuja flotante dentro del juego**, no desde
  la pantalla principal.
- Debe funcionar con **cualquier mando** en modo gamepad (no solo el GamepadPlus).
- Versionado: el proyecto arranca en **1.0 / v1** para GitHub.

---

## 3. Estructura del repositorio

```
CONTEXTO.md              Este documento
README.md                Guía de uso/compilación (más corta)
build.ps1                Empaqueta un directorio de módulo Magisk -> dist\<id>-<version>.zip
install.ps1              Copia un zip al teléfono por ADB e intenta instalarlo con su
app/                     App Android (sin Gradle)
  AndroidManifest.xml
  build.ps1              aapt2 -> javac -> d8 -> zipalign -> apksigner (incluye el módulo root en assets)
  res/drawable/          Iconos vectoriales Material (ic_*.xml)
  res/values/strings.xml Nombre y descripción del servicio de accesibilidad
  res/xml/pad_service.xml Configuración del servicio de accesibilidad
  src/com/gamepadmapper/app/
    MainActivity.java    Pantalla principal
    OverlayService.java  Burbuja flotante + editor visual de perfiles sobre el juego
    PadService.java      Motor sin root (accesibilidad)
    Profile.java         Modelo y lectura/escritura del formato .conf
    Library.java         Catálogo de perfiles, importar/exportar, perfil activo
    Games.java           Detección de juegos, app en primer plano, preferencias
    Mapper.java          Estado del daemon root (status.txt), rotación, mandos conectados
    RootMode.java        Detección de root, exportar el módulo, URL del repositorio
    ButtonFinder.java    Detección automática de los botones del juego en capturas
    PadTestView.java     Dibujo del mando para el probador en vivo (pestaña Mando)
    Ui.java              Paleta y componentes visuales
    BootReceiver.java    Arranca el servicio de la burbuja al encender
mapper/                  Motor root
  src/gpmapper.c         Daemon (C, estático, ARM64)
  build.ps1              Compila con Zig y empaqueta el módulo
  module/                Módulo Magisk "Gamepad Mapper Plutón (root)" (id gamepad_mapper)
    module.prop, service.sh, customize.sh, LEEME.txt
    gpmapper             (binario compilado; ignorado por git)
    profiles/            downhill.conf, plantilla.conf.txt (se copian si no existen)
    system/usr/idc/Vendor_1949_Product_7a01.idc   (orientationAware=0 para la pantalla virtual)
module/                  Módulo Magisk "GamepadPlus V3 Touch Fix" (id gamepadplus_touchfix)
  system/usr/idc/Vendor_1949_Product_0402.idc     (arreglo del modo Home+A; específico del mando)
presets/                 Catálogo de perfiles (index.json + .conf) para "Descargar perfiles"
docs/diagnostico.md      Investigación inicial (modos del mando, coordenadas, callejones sin salida)
experimental/gpbridge/   Primer puente uinput (histórico)
experimental/fakepad/    Mando virtual por uinput para pruebas sin mando real
experimental/finder-test/ Prueba en PC de ButtonFinder con capturas reales
keystore/                Clave de firma (SECRETA, ignorada por git)
backups/                 boot.img original y parcheado del teléfono del autor (ignorado)
tools/                   adb, zig, jdk, android-sdk locales (ignorado)
dist/                    Salidas de compilación (ignorado); dist/anteriores = builds viejos
```

---

## 4. Datos en el teléfono (`/sdcard/Android/data/com.gamepadmapper.app/files/`)

Desde la **1.2** los datos están en la carpeta propia de la app (no necesita `MANAGE_EXTERNAL_STORAGE`,
que Google Play no aprueba para esta app). Las versiones 1.0/1.1 usaban `/sdcard/gamepad-mapper`:
- Sin root: Inicio ofrece "¿Usabas una versión anterior?" → selector de carpetas de Android
  (`Migrate.java`, ACTION_OPEN_DOCUMENT_TREE) → copia los `.conf` y `active.txt`.
- Con el módulo root (v4): `service.sh` y `gpmapper` usan solo la carpeta de la app (esperan a que la
  app la cree al abrirse). La carpeta antigua no se lee ni se copia sola: se importa desde la app.
  `chown` al dueño de la carpeta para que la app pueda editar lo que crea root.
- `hasFragileUserData="true"`: al desinstalar, Android pregunta si conservar los datos.

| Archivo | Quién escribe | Para qué |
|---|---|---|
| `profiles/*.conf` | App (editor) / usuario | Perfiles. Se recargan solos al cambiar |
| `active.txt` | App y gpmapper | `paquete = archivo.conf` por línea: perfil elegido por juego |
| `learn` | App (editor, "Detectar") | Mientras existe (y tiene < 30 s), el motor no toca y "aprende" |
| `learn_result` | Motor (root o accesibilidad) | Nombre del botón/eje detectado (`A`, `AXIS_9+`, `DPAD_UP`...) |
| `status.txt` | gpmapper (cada 2 s) | `time, uid, version, gamepad, touch, profile, package, enabled, rotate, rotation` |
| `rotation` | App (OverlayService) | Rotación de pantalla 0..3, para `gpmapper -R` (modo sin IDC) |
| `mapper.log` | gpmapper (root) | Registro (rota a `.1` al pasar 512 KB) |
| `debug` | Usuario | Activa registro detallado (gpmapper → `mapper.log`, PadService → `pad.log`) |
| `debug_pkg` | Solo pruebas | Fuerza la app objetivo de PadService (ver §10) |
| `presets/` | Pruebas | Copia local del catálogo |

---

## 5. Formato de perfil (`.conf`)

Texto plano, `clave = valor`, `#` comenta. Mismo formato para los dos motores.

```ini
package = app.downhillrevived      # obligatorio: paquete del juego
name = Carreras                    # opcional: nombre visible (varios perfiles por juego)
screen = 2340x1080                 # tamaño de referencia (pantalla tal como se ve)
deadzone = 0.18
ls_axes = 0,1                      # opcional: ejes del stick izq. (hex, códigos Linux)
rs_axes = 2,5                      # opcional: ejes del stick der.
look_y = 1.00                      # sensibilidad vertical de la cámara
look_invert = 0

ls_deadzone = 0.15                 # opcional: zona muerta propia de cada stick
ls_curve = 1.5                     # opcional: curva (1 lineal, >1 más fino cerca del centro)

A  = tap 1980 895                  # toque mientras se mantiene
B  = turbo 1700 900 12             # turbo: N toques por segundo mientras se mantiene (1-30)
X  = toggle 1500 700               # interruptor: una pulsación apoya, la siguiente suelta
Y  = swipe 1800 500 1800 200 150   # deslizar de (x1,y1) a (x2,y2) en N ms
L2+A = tap 1000 300                # capa: mientras se mantiene L2, A toca aquí (L2 deja de tocar solo)
LS = stick 405 735 150             # joystick: centro y radio
RS = look 1500 500 14              # cámara: arrastre continuo, velocidad px/fotograma
B  = macro 1980 895 0 40; 1705 398 1.5 40   # X Y RETRASO(ms) DURACIÓN(ms); ...
AXIS_9+ = tap 372 398              # eje usado como botón (gatillo)
BTN_13A = tap 550 85               # botón por código Linux (solo motor root)
KEY_188 = tap 100 100              # botón por keycode Android (solo motor accesibilidad)
```

- Nombres: `A B C X Y Z L1 R1 L2 R2 L3 R3 SELECT START HOME DPAD_UP/DOWN/LEFT/RIGHT LS RS`
  (alias de lectura: `LB RB LT RT BACK MODE`).
- Ejes `AXIS_<hex>±` usan **códigos Linux** (`0 X, 1 Y, 2 Z, 3 RX, 4 RY, 5 RZ, 9 GAS, A BRAKE,
  10 HAT0X, 11 HAT0Y`). PadService traduce a ejes Android con la tabla `AXMAP`.
- L2/R2 también se activan con los gatillos analógicos (`BRAKE`/`GAS`, o `LTRIGGER`/`RTRIGGER`).
- Stick derecho por defecto: `RX/RY` si existen; si no, `Z/RZ` (convención de Android).
- Macro: `RETRASO` cuenta desde el inicio del paso anterior (0 = a la vez); se ejecuta
  entera aunque se suelte el botón. Máx. 16 pasos (root).
- Coordenadas en píxeles de `screen`; los motores escalan a la pantalla real.
- **Capas** (`MOD+BOTÓN`): el modificador (`L1 R1 L2 R2 SELECT L3 R3`) pasa a ser solo
  modificador; la acción se elige al pulsar (capa si el modificador está pulsado, si no la
  normal). Si SELECT es modificador, SELECT+R1/L1 ya no cambia de perfil.
- **Curvas**: joystick conserva el desplazamiento mínimo de la zona muerta (para no caer en
  la zona muerta del juego) y aplica `m^curva`; la cámara parte de 0.
- Ambos motores implementan lo mismo (gpmapper en C, PadService en Java).

---

## 6. La app (Android, sin Gradle)

- Paquete `com.gamepadmapper.app`, minSdk 26, targetSdk 35, Java 11, sin librerías.
- Etiqueta: **Gamepad Mapper Plutón**. Tema oscuro propio (`Ui.java`).
- Permisos: `SYSTEM_ALERT_WINDOW` (burbuja/editor), `MANAGE_EXTERNAL_STORAGE` (perfiles en
  /sdcard), `PACKAGE_USAGE_STATS` (juego en primer plano), `FOREGROUND_SERVICE(_SPECIAL_USE)`,
  `POST_NOTIFICATIONS`, `INTERNET` (catálogo), `RECEIVE_BOOT_COMPLETED`, y el servicio de
  accesibilidad `PadService` (`BIND_ACCESSIBILITY_SERVICE`). `<queries>` incluye launchers y
  `com.topjohnwu.magisk`.

### Pantalla principal (`MainActivity`): 5 pestañas con barra inferior
Orden: Inicio · Juegos · **Mando** (botón central redondo y elevado) · Perfiles · Ajustes.
La pestaña elegida se recuerda (`tab` en preferencias); *Atrás* vuelve a Inicio antes de
salir; `render()` redibuja la pestaña actual. Punto naranja en *Ajustes* si falta algún
permiso. Sin acceso a archivos solo se muestran cabecera + configuración. Pie "creado por
Hades0413" en Inicio y Ajustes.

**Mando** (`renderPad`, `PadTestView`):
- Selector si hay varios mandos; el probador cambia solo al mando que envía eventos
  (`switchPad`). Se redibuja al conectar o desconectar un mando.
- Ficha: nombre, modo (gamepad ✓ o táctil/ratón con instrucciones), estilo y chips de
  capacidades: nº de botones, sticks, gatillos analógicos/digitales, cruceta, extras y, en
  Android 12+, batería (`getBatteryState`), vibración (botón *Probar vibración*,
  `VibratorManager`), sensores de movimiento y luces.
- **Probador adaptable** (`PadTestView.Layout.from(InputDevice)`): estilo por fabricante o
  nombre (Xbox 0x045e: LB/RB/LT/RT, View/Menu, A/B/X/Y de colores, stick arriba; PlayStation
  0x054c: ✕ ○ □ △, Share/Options; Nintendo 0x057e: B/A/Y/X por posición, ZL/ZR, −/+; genérico).
  Solo dibuja lo que el mando tiene (`hasKeys`, `getMotionRange`): stick derecho (RX/RY o
  Z/RZ), gatillos analógicos con % de presión, L3/R3, cruceta (teclas o hat). Fila de chips
  para extras (C, Z, BUTTON_1..16) y cualquier botón desconocido que se pulse.
- Eventos: `dispatchKeyEvent` / `dispatchGenericMotionEvent` solo con esta pestaña abierta y
  fuentes gamepad/joystick. Muestra "Último: A · BUTTON_A" (nombre de "Detectar botón").
- Verificado con el GamepadPlus real (18 botones, 2 sticks, gatillos analógicos, extras C, Z,
  B1) y con fakepad simulando un mando Xbox (`FAKEPAD_VENDOR=045e
  FAKEPAD_NAME="Xbox Wireless Controller"`). Estilo PlayStation sin captura de prueba.

**Detección de mandos** (`Mapper.pads`): no se filtra por `isExternal()`. El IDC del Touch Fix
(`Vendor_1949_Product_0402.idc`, `device.internal=1`) también se aplica al GamepadPlus en modo
gamepad (mismo vendor/product), que Android marcaba como interno y la app decía "Ningún mando
conectado". Los nombres se limpian ("… Consumer Control", "… Keyboard" → nombre del mando).

Batería: `OverlayService` y `PadService` comprueban cada 5 s (en vez de 1 s) con la pantalla
apagada.
1. **Inicio** (`renderHome`) — el mando se resume en una línea que lleva a la pestaña Mando;
   cabecera (nombre con "Plutón" en color primario y estado),
   *Termina de configurar* si faltan permisos, **tarjeta del mapeador** (`fillServiceCard`,
   se refresca cada 2 s):
   - root activo → "Mapeador activo · Con root"; accesibilidad activa → "Mapeador activo"
     (en Android < 14 avisa que no hay sticks);
   - si no → botones **Activar** (abre Accesibilidad) y **¿Cómo?** (despliega los pasos,
     la nota de privacidad y el acceso a "Permitir ajustes restringidos");
   - mandos conectados (`Mapper.pads()`): modo gamepad ✓ o "modo táctil/ratón" con
     instrucciones (GamepadPlus: Home + X).
   Debajo: *Jugar* (hasta 4 juegos con perfil, botón Jugar directo) o *Primeros pasos* si
   aún no hay perfiles.
2. **Juegos** (`renderGames`): cuadrícula con iconos y "Añadir juego"; hoja por juego:
   Jugar, Editar controles, perfiles (usar/compartir/exportar/borrar).
3. **Perfiles** (`renderProfiles`): Descargar (catálogo `index.json`, fuente configurable,
   vacía por defecto), Importar `.conf`/`.zip`, Exportar todos (`.zip` por SAF), Fuente del
   catálogo, y la lista de todos los perfiles (chip "En uso"). Recibe perfiles compartidos
   como texto (intent `SEND text/plain`).
4. **Ajustes** (`renderSettings`): Burbuja (interruptor), Permisos (cada uno con ✓ o
   "Pendiente", tocar abre el ajuste), Rendimiento (**Mejora con root**: verde si detecta
   root; diálogo con ventajas, pasos, *Guardar módulo* → `GamepadMapperPluton-root.zip` en
   Descargas, y *Repositorio* si `RootMode.REPO_URL` no contiene `TU_USUARIO`),
   Diagnóstico (registro del mapeador) y Acerca de (versión).

### Burbuja y editor (`OverlayService`)
- Servicio en primer plano siempre activo; cada 1 s mira la app en primer plano
  (`UsageStatsManager`) y muestra la burbuja solo en juegos (no ocultos).
- Menú de la burbuja: **Mostrar/Ocultar controles**, Editar controles, Cambiar perfil, Nuevo
  perfil (en blanco / copia), Renombrar, Borrar, Ocultar burbuja.
- **Mostrar controles** (`HintsView`, preferencia global `show_controls`): ventana
  `FLAG_NOT_TOUCHABLE` sobre el juego con una insignia por control del perfil activo (botón:
  círculo con el nombre; LS: aro discontinuo verde con el radio del joystick; RS/cámara: aro
  naranja + "cámara"; macro: A1, A2… en cada paso). Se recarga si cambia el perfil o
  `active.txt` (SELECT+R1/L1), se redibuja al girar, y se quita al salir del juego, al abrir el
  editor o si la burbuja está oculta. `alpha = 0.8` en Android 12+: es la opacidad máxima con
  la que Android deja pasar los toques a través de una ventana de otra app
  (*untrusted touch occlusion*); más opaca bloquearía el juego. Sin probar en pantalla todavía.
- Editor: círculos arrastrables sobre los controles del juego, panel por botón (tipo
  tap/stick/cámara/macro, radio, velocidad, invertir Y, pasos de macro con retraso y
  duración), **Detectar botón / Detectar stick** (protocolo `learn`), deshacer (50),
  tamaño de círculos (Grande/Mediano/Pequeño), paneles que se colocan solos y se arrastran.
- Escribe `rotation` al girar la pantalla (DisplayListener + comprobación en cada tick).

### Detectar botones del juego (automático)
Archivos: `ButtonFinder.java` (análisis), `OverlayService.java` (sección "detectar botones
del juego"), `PadService.captureFrames` (capturas).
- Se ofrece al abrir el editor con un **perfil nuevo** (banner "¿Busco los botones del juego
  automáticamente?") y en *+ Botón › Buscar los botones del juego (automático)*.
- Requiere **Android 11+** y el servicio de accesibilidad activo
  (`AccessibilityService.takeScreenshot`, `android:canTakeScreenshot="true"`). Los juegos con
  `FLAG_SECURE` no permiten capturas.
- Flujo: el editor se oculta y deja pasar los toques (`FLAG_NOT_TOUCHABLE`), el usuario juega
  ~3 s, se toman **6 capturas cada 450 ms** reducidas a 400 px de ancho, se analizan en otro
  hilo (~2 s en el Redmi Note 9) y se muestran círculos discontinuos: naranja = se usará,
  verde = joystick, gris = descartado (menú, centro, borde). Tocar un círculo lo incluye o
  descarta. Después:
  - **Asignar con el mando:** uno a uno, "pulsa el botón para este…" (protocolo `learn`;
    ejes 0/1 → LS joystick, ejes 2/5/3/4 → RS). Saltar / Terminar. Si no se pulsa nada en 30 s
    vuelve a preguntar.
  - **Automático:** joystick → LS (stick, radio 0,8 × el aro), principal → A, resto en orden
    `A B X Y R1 R2 L1 L2 R3 L3 DPAD_*`.
  - En un perfil nuevo, la distribución de ejemplo se sustituye (`onlyDefaults`).
- `ButtonFinder` (sin dependencias de Android en `findPixels`):
  1. Bordes **estables**: mínimo entre capturas del gradiente Sobel (el borde debe existir en
     todas) + color estable; umbral = 10 % más fuerte (mín. 45).
  2. **Círculos**: Hough con dirección del gradiente (radios 4–20 % del lado corto), votos
     sumados en 3×3 y radios vecinos, picos ≥ 0,6 × perímetro, verificación de cobertura del
     contorno ≥ 50 %, supresión de duplicados de tamaño parecido y de círculos interiores
     (icono dentro del aro).
  3. **Barras segmentadas** (L2 | L1+L2 | L1): componentes alargadas se parten por columnas
     divisorias; los círculos dentro de una barra (letras) se eliminan.
  4. **Manchas** para botones no redondos.
  5. Clasificación: menú (franja superior 18 %), "¿personaje?" (centro 35–65 % × 25–92 %),
     borde lateral pequeño (descartado), joystick (≥ 16 % del lado corto, abajo-izquierda),
     principal (el mayor de la derecha), secundarios, otros. Máx. 20 de juego + 8 descartados.
- No sabe qué hace cada botón (saltar, atacar…): haría falta reconocer iconos (IA de visión).
  Un joystick "flotante" (aparece donde tocas) no se puede detectar porque no está fijo.
- Prueba en PC con capturas reales: `experimental/finder-test` (`FinderTest` dibuja lo
  detectado; `EdgeDump` guarda el mapa de bordes y, con `-Dat=x,y`, los picos cercanos).
  Validado con dos capturas de Downhill: detecta △ □ ○ ✕, R1/R1+R2/R2, R3, L3, L1, L2 y "+",
  descarta marcador, SELECT/START, personaje e icono flotante; quedan 3–4 falsos en el fondo
  (con solo 2 capturas; en el teléfono se usan 6).
- Prueba en el teléfono sin interfaz: con `debug` y el servicio activo, crear
  `/sdcard/Android/data/com.gamepadmapper.app/files/debug_capture` → captura + análisis escritos en `pad.log`.

---

## 7. Motor sin root: `PadService` (accesibilidad)

Archivo: `app/src/com/gamepadmapper/app/PadService.java`. Config: `res/xml/pad_service.xml`
(`typeWindowStateChanged`, `flagRequestFilterKeyEvents`, `canPerformGestures`,
`canRequestFilterKeyEvents`, sin leer contenido de ventanas).

- **Juego en primer plano:** `TYPE_WINDOW_STATE_CHANGED` (ignora la propia app y teclados);
  respaldo cada 1 s con `UsageStats` si no hubo eventos en 3 s.
- **Perfil:** `Library.targetFile(pkg)` (activo de `active.txt` o el primero); recarga si
  cambia la firma del directorio.
- **Botones:** `onKeyEvent` (solo fuentes gamepad/joystick). Se consume (no llega al juego)
  solo si el botón está asignado, o SELECT cuando hay perfil (atajos). `KEYCODE_BACK` de un
  mando se trata como SELECT.
- **Sticks/ejes:** `AccessibilityServiceInfo.setMotionEventSources(SOURCE_JOYSTICK)` +
  `onMotionEvent` (**API 34+**). Se activa dinámicamente solo con perfil o detectando, para
  no robar los sticks en otras apps.
- **Lógica** (copiada de gpmapper): tap, stick (centro + vector·radio), look (cámara con
  re-centrado al alejarse 28 % del lado menor), macros (`Handler.postDelayed`), histéresis
  0.5/0.35 en ejes-botón, SELECT+R1/L1 cambia perfil (Toast), SELECT+START 1 s pausa.
- **Inyector `Inj`** (lo más delicado):
  - Cada dedo es un trazo. Cada envío (`dispatchGesture`) incluye a **todos** los dedos:
    los ya apoyados se continúan con `continueStroke(path, 0, 8 ms, willContinue)` desde su
    último punto exacto; los nuevos son `StrokeDescription` nuevos; los soltados terminan
    con `willContinue=false`.
  - Un envío no sale hasta que el anterior termina (`onCompleted`); los cambios se acumulan.
  - **Regla crítica de Android** (`MotionEventInjector.prepareToContinueOldGesture`):
    en un gesto que continúa otro, el **primer instante** solo puede contener
    continuaciones; si hay un trazo nuevo en ese instante, Android cancela todo. Por eso los
    trazos nuevos empiezan en **t = 1 ms** cuando hay continuaciones (`newStart`).
    Verificado con fakepad: mantener A + pulsar X, stick + A, A + stick, A y X a la vez →
    sin cancelaciones.
  - `onCancelled` (p. ej. el usuario toca la pantalla con el dedo): todos los dedos del
    mando se vuelven a apoyar como nuevos en el siguiente envío.
  - Coordenadas: escala del perfil a `WindowManager.getMaximumWindowMetrics()` (orientación
    visible; `dispatchGesture` ya usa la orientación actual) y recorte a la pantalla.
- **Detectar:** mismo protocolo de archivos (`learn` → `learn_result`). Ejes: informa
  `AXIS_<hex Linux>±`, hat → `DPAD_*`, `LTRIGGER/RTRIGGER` → `L2/R2`.
- **Coexistencia:** si `status.txt` indica gpmapper en marcha, PadService no hace nada.
- Registro: `debug` → `pad.log` (app, perfil, teclas, ejes, cada gesto con `nuevo/sigue/fin`,
  `gesto CANCELADO`).

- **Cancelaciones por el stick (Android 14+)**: en `AccessibilityInputFilter` el `MotionEventInjector`
  va ANTES del paso que entrega los eventos genericos (joystick) al servicio, y
  `MotionEventInjector.onMotionEvent` cancela cualquier gesto inyectado (en curso o esperando
  continuacion) al llegar cualquier MotionEvent. Como PadService pide `SOURCE_JOYSTICK`, cada evento
  del stick cancela los dedos virtuales (decenas por segundo al girar). No se puede evitar leyendo el
  stick por accesibilidad; `Inj` lo trata como flujo normal: reapoya los dedos pulsados al instante,
  el joystick desde su centro hasta la posicion actual en 1 ms (`PRESS_MS`), no repite los que se
  soltaban, agrupa los cambios de un evento en un envio (`changed()` → `handler.post`) y calcula el
  fin exacto de cada trazo con `PathMeasure` (Android exige igualdad exacta al continuar). Con
  `debug`, `pad.log` resume "N reapoyos/s". Alternativas descartadas por ahora: leer el stick con una
  ventana enfocable (algunos juegos se pausan al perder el foco) o Shizuku/root (sin el problema).
- **Stick por ventana con foco (`PadWindow`)**: ventana `TYPE_ACCESSIBILITY_OVERLAY` de 1x1 px,
  `FLAG_NOT_TOUCHABLE | FLAG_ALT_FOCUSABLE_IM`, que toma el foco y recibe el stick
  (`dispatchGenericMotionEvent`) sin pasar por el filtro de accesibilidad: sin cancelaciones, se puede
  mantener un boton mientras te mueves, y funciona en cualquier Android (no solo 14+). Respaldo:
  `setMotionEventSources` si no consigue el foco. Atras del telefono: cede el foco y repite
  `GLOBAL_ACTION_BACK`. En pausa (SELECT+START) se quita. Probado en Brawl Stars (no se pausa).
- **Varios mandos**: ejes por dispositivo (`devAxes`); manda el mas inclinado. **Desconexion**
  (`InputDeviceListener`): suelta todos los dedos y olvida sus ejes.
- **Permisos opcionales con Accesibilidad**: sin "Mostrar sobre otras apps", `OverlayService` dibuja
  burbuja/editor/controles con `TYPE_ACCESSIBILITY_OVERLAY` usando el WindowManager de PadService
  (`syncWindowMode`); sin "Acceso de uso", el juego delante lo da `PadService.topApp()`. Si el permiso
  esta concedido se usa como antes. Solo hacen falta en modo root/Shizuku sin Accesibilidad.
- **Ventanas que no son Activity** (notificaciones emergentes, avisos, barra del sistema) se ignoran
  al detectar la app en primer plano (`isActivity`): antes una notificacion descargaba el perfil.

Limitaciones conocidas: sticks solo en Android 14+; retraso extra ~10–20 ms; macros con
resolución de ms (toque mínimo ~8 ms); un toque real del dedo interrumpe un instante los
dedos del mando; en algunas marcas (Xiaomi/Oppo...) el ahorro de batería puede matar el
servicio; en Android 13+ con APK instalado fuera de Play hay que "Permitir ajustes
restringidos" antes de activar la accesibilidad.

---

## 8. Motor root: `gpmapper` (C)

Archivo: `mapper/src/gpmapper.c`. Compilado con `zig cc -target aarch64-linux-musl -static -O2`.
Lo arranca `service.sh` del módulo como root en bucle (reinicia si muere).

- Pantalla virtual `uinput` "Gamepad Mapper Touch" (vendor `0x1949`, product `0x7a01`,
  `BUS_VIRTUAL`, MT 10 slots, 0..32767, `INPUT_PROP_DIRECT`). El módulo instala
  `Vendor_1949_Product_7a01.idc` con `touch.orientationAware = 0` → las coordenadas son las
  de la pantalla tal como se ve.
- Busca el primer gamepad (botones ≥ 4 + ABS_X/Y, sin BTN_TOUCH). Lo **captura**
  (`EVIOCGRAB`) solo si la app en primer plano tiene perfil (proceso con
  `oom_score_adj == 0` cuyo nombre es un paquete con perfil) o en modo aprender.
- Macros con precisión de µs (`ppoll`, cola de 64 pasos), cámara a ~60 Hz.
- Opciones: `-d DIR` perfiles, `-v` verboso, `-R` girar según `<base>/rotation`,
  `-t` reenviar mandos en modo táctil (BT/USB con BTN_TOUCH+ABS_X/Y sin INPUT_PROP_DIRECT),
  `-p HEX` producto de la pantalla virtual (p. ej. `7a02` para no usar el IDC),
  `-T u,v` toque de prueba de 2,5 s en el punto normalizado y salir.
  `-R/-t/-p` se crearon para un modo "sin root por ADB" que se **descartó** (el usuario no
  quiere PC); siguen disponibles y probados.
- Escribe `status.txt` cada 2 s y `mapper.log`.

Verificado: rotación con `-R` (cocinado en `dumpsys input` coincide con la convención
AOSP: ROT_90 → `a = 1 − v, b = u`; ROT_270 → `a = v, b = 1 − u`), arranque como usuario
`shell` sin root, supervivencia a desconexión de ADB.

---

## 9. Compilar

Todo con herramientas locales en `tools\` (no van a git, ~1 GB). En un PC nuevo hay que
descargarlas y dejarlas así:

| Carpeta | Qué | De dónde |
|---|---|---|
| `tools\platform-tools\adb.exe` | adb / fastboot | https://developer.android.com/tools/releases/platform-tools |
| `tools\zig\zig.exe` | Zig **0.13** (compilador C para ARM64) | https://ziglang.org/download/ (zig-windows-x86_64-0.13.0.zip, descomprimir el contenido en `tools\zig`) |
| `tools\jdk\bin\javac.exe` | JDK 21 | https://adoptium.net (Temurin 21, zip, contenido en `tools\jdk`) |
| `tools\android-sdk\platforms\android-35\android.jar` y `tools\android-sdk\build-tools\35.0.0\` | SDK Android | "Command line tools only" de https://developer.android.com/studio#command-tools y luego `sdkmanager --sdk_root=tools\android-sdk "platforms;android-35" "build-tools;35.0.0"` |

La clave de firma (`keystore\`) se copia aparte, nunca por git (ver §2 y §9).

```powershell
.\mapper\build.ps1     # gpmapper + dist\gamepad_mapper-v1.zip  (antes que la app)
.\app\build.ps1        # dist\GamepadMapper-1.0.apk (incluye el zip del módulo más reciente)
.\build.ps1 -ModuleDir .\module -OutDir .\dist   # touchfix -> dist\gamepadplus_touchfix-v1.zip
```

- Firma: `keystore\gamepad-mapper.jks` + `keystore\password.txt` (se crea la primera vez).
  **Secreta y necesaria para actualizar la app**: hacer copia de seguridad fuera del repo.
- Subir versión: `android:versionCode`/`versionName` en `app/AndroidManifest.xml`;
  `version`/`versionCode` en `module.prop`; cadena `gpmapper 1.x` en `gpmapper.c`. Si cambia el formato de
  perfil, subir `GPM_BUILD` (gpmapper.c) y `RootMode.MODULE_BUILD` a la vez: la app avisa de modulo
  desactualizado comparandolos (`build=` en status.txt). Aviso de version nueva: `Updates.java` (GitHub, 1/dia).
- `build.ps1` raíz normaliza a LF `.prop/.idc/.sh/.kl/.kcm/.conf/.txt` y scripts META-INF;
  los binarios van tal cual; rutas con `/`.

Instalar en el teléfono de pruebas:
```powershell
.\tools\platform-tools\adb.exe install -r .\dist\GamepadMapper-1.0.apk
adb shell appops set com.gamepadmapper.app SYSTEM_ALERT_WINDOW allow
adb shell appops set com.gamepadmapper.app MANAGE_EXTERNAL_STORAGE allow
adb shell appops set com.gamepadmapper.app GET_USAGE_STATS allow
```

---

## 10. Probar sin mando: `fakepad`

`experimental/fakepad/fakepad.c` crea un mando por `uinput` desde `adb shell` (shell puede
escribir `/dev/uinput`). Botones A B X Y L1 R1 SELECT START L3 R3; ejes X/Y, Z/RZ, GAS/BRAKE,
HAT. Comandos: `wMS` esperar, `pA`/`rA` pulsar/soltar, `lX,Y` stick izq., `gX,Y` stick der.,
`hX,Y` cruceta.

Receta usada para validar PadService (sin tocar las apps del usuario):
1. Perfil de prueba con `package = com.android.systemui` (pantalla de bloqueo), `screen = 1080x2340`.
2. `echo com.android.systemui > /sdcard/Android/data/com.gamepadmapper.app/files/debug_pkg`, `touch .../debug`.
3. `settings put secure enabled_accessibility_services com.gamepadmapper.app/com.gamepadmapper.app.PadService`
   y `settings put secure accessibility_enabled 1`; `input keyevent WAKEUP`.
4. `fakepad w300 pA w300 pX w300 rX w300 rA ...` y leer `pad.log` (`gesto [...] nuevo/sigue/fin`,
   `CANCELADO`). `dumpsys input` muestra "Last Cooked Touch" y la RecentQueue.
5. Limpiar: borrar el perfil, `debug`, `debug_pkg`, `settings delete secure enabled_accessibility_services`,
   `accessibility_enabled 0`, `input keyevent SLEEP`.

**No inyectar toques si el teléfono está desbloqueado y en uso** (comprobar
`dumpsys window | grep isKeyguardShowing` y `mWakefulness`).

---

## 11. Teléfono del autor (entorno de pruebas)

- Redmi Note 9 `merlinx` (MT6768), 1080×2340, crDroid v12.12 no oficial, **Android 16 (API 36)**.
- Root: **Magisk v31.1** parcheando `boot.img` de
  `crDroidAndroid-16.0-20260925-merlinx-v12.12.zip`. Copias: `backups\boot_original_crDroid-v12.12-20260925.img`
  y `boot_magisk-...img`. Recuperar: `fastboot flash boot backups\boot_original...img`.
  Al actualizar crDroid hay que volver a parchear el boot.
- Magisk **no da root al shell de ADB** (`su` → Permission denied); módulos se instalan desde
  la app Magisk (Módulos → + → zip → reiniciar).
- Módulos instalados: Touch Fix (v2 antiguo) y Gamepad Mapper (v4 antiguo). En `Download/`
  está `gamepad_mapper-v1.zip` (nuevo) para instalar. El v4 no escribe `status.txt`, así que la
  app no lo ve como activo hasta instalar el v1.
- Mando: Home+X = HID gamepad (ejes 0,1 LS; 2,5 RS (Z/RZ); 9/A gatillos; hat 10/11).
  Home+A = digitalizador `GamepadPlus V3 Touchscreen` (1949:0402, ABS 0..3500 × 0..4095,
  coordenadas en orientación visible) — por eso el IDC del Touch Fix lleva `orientationAware = 0`.
- Perfil real del autor: `profiles/downhill.conf` (md5 `bfa189b72cb4d8a6b49e31757cb364f3`);
  `active.txt`: `app.downhillrevived = downhill.conf`. **No modificarlo en pruebas.**
- Puede tener PIN; con la pantalla bloqueada las capturas salen negras. No desbloquearlo.

---

## 12. Trampas conocidas (Windows / herramientas)

- PowerShell 5.1: `&&` no existe; `$PSScriptRoot` vacío en bloques `param`; stderr de
  ejecutables nativos con `$ErrorActionPreference='Stop'` lanza excepción; scripts sin BOM
  se leen como ANSI (produjo "AÃ±adir"; los `.ps1` deben ser ASCII o UTF-8 con BOM).
  La consola muestra "PlutÃ³n" aunque el archivo esté bien en UTF-8.
- `adb shell '...'` desde PowerShell: se pierden las comillas dobles internas y `$(...)`
  se expande en Windows. **Escribir un `.sh` (LF), `adb push` y `adb shell sh archivo.sh`.**
- `pkill -f patrón` puede matar al propio shell si el patrón aparece en su línea de
  comandos; usar `'gpmappe[r]'`.
- `adb push` no conserva permisos de ejecución: `chmod 755` después.
- Android no deja instalar un `versionCode` menor: hay que desinstalar (se pierden las
  preferencias de la app, no los perfiles de /sdcard) y volver a dar permisos con `appops`.

---

## 13. Investigación que no hay que repetir

Ver `docs/diagnostico.md`. Resumen:
- ShootingPlus de Play bloquea "Modo de activación" en SDK ≥ 30; la v3.0.1.412 usa
  `InputManager.getInstance()` (eliminado en Android 14); la v3.0.1.682 funciona pero
  Android 16 rechaza sus inyecciones ("InputDispatcher: Inconsistent event").
- Sin root, el usuario `shell` (ADB) **sí** puede leer `/dev/input` y escribir `/dev/uinput`
  (SELinux lo permite); una app normal **no**. Por eso sin root ni PC la única vía es
  Accesibilidad.
- Accesibilidad recibe ejes de joystick solo desde Android 14 (`setMotionEventSources`).
- Activación sin PC por depuración inalámbrica: se hace **a través de Shizuku** (ver §15),
  no implementando el emparejamiento (SPAKE2 + TLS) en la app.
- En pruebas sobre la pantalla de bloqueo, muchos toques seguidos activan el "doble toque
  para apagar" de SystemUI (crDroid) y la pantalla se apaga/enciende: se pierden teclas. Es un
  artefacto de la prueba (en un juego no pasa). Probar turbo con la pantalla apagada (gpmapper)
  o con un juego abierto.

---

## 15. Funciones añadidas en la ronda 1.0 (resumen técnico)

- **Turbo / interruptor / deslizar / capas / curvas**: formato en §5; editor (panel del
  botón): fila de tipo (Toque, Turbo, Interruptor, Deslizar, Macro), fila de capa (Ninguna,
  L1…R3, "+ Duplicar en capa"), velocidad del turbo, duración del deslizamiento (segundo
  círculo "→" = punto final), zona muerta y curva por stick. "Mostrar controles" dibuja la
  flecha del deslizamiento y etiqueta turbo/interruptor. Colores por tipo: `typeColor()`.
  Verificado con fakepad: gpmapper (turbo 10/s exacto, interruptor, deslizar, capa L2+A) y
  PadService (deslizar 120 ms en tramos de ~8 ms, capa, turbo ~10/s).
- **Batería**: fila en Ajustes › Permisos ("Batería sin restricciones",
  `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) + aviso extra en Xiaomi/Oppo/Samsung…
- **Catálogo**: `presets/` va dentro del APK (`assets/presets`); fuente por defecto
  `asset:presets/index.json`, o `https://raw.githubusercontent.com/<usuario>/<repo>/main/presets/index.json`
  cuando `RootMode.REPO_URL` esté configurada (`Library.defaultCatalog`). Así la comunidad
  aporta perfiles con un pull request a `presets/`.
- **QR**: `QrCode.java` (generador propio, modo byte, v1–40, máscara por penalización).
  Verificado con ZXing en PC (15/15 decodificados, incluido UTF-8). Botón QR en cada perfil
  (hoja del juego); el QR contiene el perfil sin comentarios; el otro móvil lo escanea con la
  cámara/Lens y comparte el texto con la app (intent SEND text/plain ya existente).
- **Icono**: adaptable (`mipmap-anydpi-v26/ic_launcher.xml`): fondo `drawable/ic_launcher_bg.xml`
  (morado `#3B2148`) + planeta-mando blanco `drawable-nodpi/ic_launcher_fg.png` (432 px, 224 px de
  ancho centrado; también es la capa monocroma). Sale de "Ícono de app · oscuro" del diseño del
  logo. También en la cabecera y el tutorial.
- **Tutorial**: 3 pantallas la primera vez (`welcome_done`), "Ver tutorial" en Ajustes.
- **Idioma**: `L.t("texto en español")` + `L_en.java` (diccionario). Preferencia "lang":
  auto/es/en (Ajustes › Idioma). `values-en/strings.xml` para el servicio de accesibilidad.
  Para traducir textos nuevos: envolverlos en `L.t(...)` y añadir la entrada en `L_en`
  (las claves deben coincidir exactamente, incluidos espacios y `\n`).
- **Modo rápido con Shizuku** (`ShizukuClient.java`, `moe/shizuku/api/BinderContainer.java`):
  cliente mínimo sin librería. Proveedor `com.gamepadmapper.app.shizuku`
  (`ShizukuClient$Provider`) recibe el binder ("sendBinder"); `attachApplication` (tx 18),
  `requestPermission` (15), `checkSelfPermission` (16), `newProcess` (8); códigos = número
  del AIDL + 1. Lanza `gpmapper -R -t -p 7a02` como shell desde `/data/local/tmp/gpmapper-pluton`
  (copiado de `assets/gpmapper` → `/sdcard/Android/data/com.gamepadmapper.app/files/bin`). Se reactiva solo
  (`fast_mode`) al conectar Shizuku. PadService se queda en espera al ver `status.txt`.
  **Sin probar con Shizuku real** (no está instalado en el teléfono del autor).
- **Ahorro**: OverlayService y PadService comprueban cada 5 s con la pantalla apagada.

---

## 14. Estado y pendientes

Hecho y probado:
- Touch Fix (Home+A) en el teléfono del autor.
- gpmapper root: perfiles, macros, cámara, aprender, SELECT+R1/L1, pausa (probado con el
  mando real en versiones anteriores).
- PadService: botones, sticks (Android 16), macros, multitáctil sin cancelaciones (fakepad).
- App 1.0 instalada en el teléfono del autor.

- Detección automática de botones: captura y análisis verificados en el teléfono
  (6 capturas en 2,9 s, análisis 2 s); algoritmo validado en PC con capturas de Downhill.

Pruebas automaticas: `tests/run.sh` (ProfileTest en Java + `gpmapper -c` en C sobre
`tests/fixture.conf`); CI en `.github/workflows/build.yml` (tag `v*` = APK firmado en el Release,
con los secretos `KEYSTORE_BASE64` y `KEYSTORE_PASSWORD`).

Pendiente / por verificar:
- Probar el flujo completo de "Detectar botones" en un juego real (interfaz del editor,
  asignación con el mando y automática).
- Probar PadService con el **mando real** en un juego (Downhill) — desactivar antes el
  módulo root en Magisk, porque con él activo PadService se queda en espera.
- El autor debe instalar `gamepad_mapper-v1.zip` en Magisk y reiniciar.
- Ver la nueva tarjeta *Mejora con root* y la guía de accesibilidad en pantalla (no se
  capturó porque el teléfono estaba en uso).

- Probar con el mando real en un juego: turbo, interruptor, deslizar, capas, curvas.
- Probar el modo rápido con Shizuku instalado (ninguna prueba real todavía).
- Ver en pantalla el editor con los tipos nuevos (necesita un juego abierto).

Ideas para mejorar (no empezadas):
- **Reconocer qué hace cada botón** (saltar, atacar…) en la detección automática, gratis y sin
  clave de API: ver §16.
- Script para re-parchear el boot tras actualizar crDroid.
- Copia de seguridad del keystore.

---

## 16. IA para reconocer iconos, gratis y sin clave de API (propuesta)

No usar APIs en la nube (exigen clave, coste y enviar capturas a terceros). Opciones locales:
1. **Modelo propio pequeño con TensorFlow Lite / LiteRT** (Apache 2.0, gratis, sin internet):
   entrenar un clasificador de iconos (≈30 clases: saltar, atacar, disparar, apuntar,
   recargar, agacharse, correr, habilidad, mapa, pausa…) con MobileNetV3-Small o
   EfficientNet-Lite0 (1–4 MB). Datos: recortes de botones de capturas de juegos (los que ya
   saca `ButtonFinder`) etiquetados a mano + aumentos. Entrenar gratis en Google Colab.
   En la app: recortar cada candidato, redimensionar a 96×96 y clasificar; mostrar la etiqueta
   sugerida ("¿saltar?") y proponer el botón del mando típico (A = saltar, R2 = disparar…).
   Sin Gradle hay que añadir el AAR de LiteRT a mano (extraer `classes.jar` + `.so` arm64 al
   APK) o usar el intérprete en C (`libtensorflowlite_c.so`) vía JNI.
2. **ML Kit Image Labeling on-device** (gratis, sin clave): etiquetas genéricas, poco útiles
   para iconos de juegos; descartado como solución principal.
3. **Plantillas** (sin modelo): comparar cada recorte con una biblioteca de iconos típicos
   (flecha arriba = saltar, mira = apuntar, bala = disparar) por correlación de bordes. Más
   simple y ligero, menos preciso; buen primer paso.
4. **Aprender del usuario**: guardar (recorte del icono → botón elegido) en un catálogo
   compartido en el repo; con el tiempo, perfiles e iconos de la comunidad sirven de
   plantillas para todos.

---

## 17. Web y comunidad de perfiles (`web/` + `supabase/`)

- **Web:** https://hades0413.github.io/GamePadMapperPluton/ (GitHub Pages, se publica sola con
  `.github/workflows/web.yml` en cada push a `main` que toque `web/`). React 19 + TypeScript + Vite/SWC +
  Tailwind 4 + TanStack Query, arquitectura por capas (ver `web/README.md`). Política de privacidad para
  Play en `/privacidad`.
- **Datos:** Supabase, proyecto `gshyhrthaksriamjqdtf` (São Paulo). Esquema en
  `supabase/migrations/` (pasos de configuración en `supabase/README.md`). Toda escritura por RPC; RLS
  y permisos por columna; límites de uso; 3 reportes ocultan un perfil.
- **Inicio de sesión:** solo GitHub (OAuth App "Gamepad Mapper Plutón", correo desactivado). Solo hace
  falta para subir, dar «me gusta» o reportar. Hades0413 es administrador (`authors.is_admin`).
- **Variables de GitHub Actions** (públicas): `SUPABASE_URL`, `SUPABASE_ANON_KEY`. La clave
  `service_role` y el Client secret de GitHub no salen de Supabase.
- **Regla:** el validador del `.conf` existe dos veces (`web/src/domain/profile/conf/validateConf.ts` y
  `private.validate_conf` en SQL); si cambia el formato del perfil en la app, actualizar los dos.
- **Pendiente (app 1.3):** biblioteca leyendo perfiles de Supabase y botón «Subir a la comunidad» que abre
  `/subir#conf=<base64url>`.

### Seguridad de la comunidad y de la importación de perfiles

- **Supabase:** nombre y avatar desde `auth.identities` (no editables por el usuario); bloqueos por id
  de GitHub; un juego oculto oculta sus perfiles; solo los reportes de cuentas con 3+ días ocultan un
  perfil automáticamente; máx. 3 juegos nuevos al día por cuenta; paquetes sensibles rechazados.
- **Paquetes sensibles** (sistema, tiendas, ajustes, permisos, root, la propia app): misma lista en
  `private.is_sensitive_package`, `web/src/domain/game/Game.ts` y `Library.isSensitivePackage`.
- **Web:** no se muestra dentro de iframes; aviso cuando `/subir#conf=` precarga un perfil.
- **App:** toda importación pide confirmación mostrando qué app controlará el perfil; catálogo solo
  https y del mismo dominio, y el perfil debe ser del juego anunciado; límites en copias .zip;
  nombres de archivo sin rutas; ganchos `debug_*` solo en compilaciones depurables; el modo Shizuku
  comprueba el SHA-256 (o MD5) del binario copiado antes de ejecutarlo.
- **CI:** acciones fijadas por SHA; solo el job `release` puede escribir; la clave de firma se borra
  del runner tras usarla.
- **Módulo root v4:** solo la carpeta de la app (`Android/data/...`); la carpeta antigua
  `/sdcard/gamepad-mapper` solo se usa al importarla a mano desde la app.

### Ramas y permisos de GitHub

- `main`: estable y protegida (solo pull request, aprobación del dueño de código, CI `build` en verde,
  sin force-push ni borrado). Los tags `v*` publican Releases firmados y solo los crea el autor.
- `develop`: integración; los colaboradores abren sus pull requests contra ella.
- `.github/CODEOWNERS` (todo requiere a Hades0413), plantillas de issues y PR, Dependabot hacia
  `develop`, `CONTRIBUTING.md` y `SECURITY.md` (avisos privados de vulnerabilidades).
- Flujo del autor: rama desde `develop` → PR a `develop` → cuando toca versión, PR `develop` → `main`,
  `make bump V=x.y` y `make release`.
