# Gamepad Mapper Plutón

Convierte cualquier mando en toques de pantalla en juegos de Android, **sin root ni PC**
(servicio de accesibilidad), con un modo root opcional más rápido (módulo Magisk).
Versión **1.6** · Creado por **Hades0413**.

**Descargar:** el APK y los módulos de Magisk están en
[Releases](https://github.com/Hades0413/GamePadMapperPluton/releases/latest).
Hasta que se publique en Google Play, **se instala por cable USB** (ver [Cómo instalar](#cómo-instalar-por-cable-usb)).

**Funciones:** turbo, interruptor, deslizar, capas con modificador (p. ej. L2 + A), macros,
joystick y cámara con zona muerta y curva por stick, "Mostrar controles" sobre el juego,
probador de mando adaptable, compartir perfiles por QR, catálogo de perfiles incluido,
español e inglés, y modo rápido sin root con Shizuku (o con root mediante Magisk).

**Detectar botones del juego:** en un perfil nuevo, la app captura la pantalla mientras juegas,
encuentra los controles táctiles (descartando menús y el personaje) y los asigna al mando, uno a
uno pulsando el botón que quieras o automáticamente (Android 11+).

**En el PC (Linux y Windows):** `gpm-escritorio` usa los mismos perfiles para jugar con mando a
juegos Android que se ven en el ordenador (scrcpy, Waydroid, un emulador). Ver
[Versión de escritorio](#versión-de-escritorio-linux-y-windows-desktop).

## Cómo instalar (por cable USB)

> **Mientras la app no esté en Google Play, hay que instalarla por USB desde un PC.**
> Si abres el APK desde el navegador o el gestor de archivos, Google Play Protect lo bloquea
> ("App bloqueada para protegerte", sin opción de instalar): pasa con cualquier app que use el
> servicio de Accesibilidad y no venga de Play Store. No es un virus; por USB no se bloquea.

1. **En el teléfono:** *Ajustes › Información del teléfono* → toca 7 veces *Número de compilación*
   (o *Versión de MIUI/HyperOS*). Luego, en *Opciones de desarrollador*, activa **Depuración USB**
   (en Xiaomi, también **Instalar vía USB**).
2. **En el PC:** descarga [Platform Tools de Google](https://developer.android.com/tools/releases/platform-tools)
   (adb) y el APK de [Releases](https://github.com/Hades0413/GamePadMapperPluton/releases/latest).
3. Conecta el teléfono por cable, acepta *¿Permitir depuración USB?* y ejecuta en la carpeta de adb:
   ```
   adb install --no-incremental -r GamepadMapperPluton-1.6.apk
   ```
   Si el teléfono pregunta si quieres instalar, toca **Instalar** enseguida (el aviso se cierra solo).
   En Xiaomi, si rechazas o dejas cerrar ese aviso varias veces, se bloquea la instalación por
   USB ("Instalación bloqueada"): reinicia el teléfono y vuelve a intentarlo una vez.
4. Abre la app y sigue *Termina de configurar*. Si al activar la Accesibilidad sale
   **"Ajuste restringido"**: *Ajustes › Apps › Gamepad Mapper Plutón › ⋮ › Permitir ajustes
   restringidos* y vuelve a intentarlo.
5. Conecta el mando en **modo gamepad** (GamepadPlus: Home + X), abre un juego y usa la burbuja **GM**.

Después de instalarla, Play Protect puede avisar de la app: elige *Mantener* / *Ignorar*.

> **Dónde están tus perfiles (1.2+):** en la carpeta de la app, `/sdcard/Android/data/com.gamepadmapper.app/files`.
> No hace falta ningún permiso de archivos. Si venías de la 1.0/1.1 (`/sdcard/gamepad-mapper`), Inicio
> te ofrece importarlos. Para copiarlos o editarlos fuera de la app,
> usa *Perfiles › Exportar todos*. Al desinstalar, Android pregunta si conservar los datos.

Empezó como arreglos y herramientas para usar el mando **Seisa SJA-1006 / GamepadPlus V3**
(ShootingPlus V3) en Android 16, y creció hasta funcionar con cualquier mando y teléfono.

## El problema

En modo **Home + A**, el mando se conecta como un digitalizador HID llamado
`GamepadPlus V3 Touchscreen` (vendor `0x1949`, product `0x0402`) y él mismo envía
toques a la pantalla según el mapeo guardado.

El dispositivo no declara `INPUT_PROP_DIRECT`, y en esta ROM Android lo clasifica
como `MOUSE | STYLUS`. El resultado es que aparece una **flecha de ratón** en lugar
de toques. En otros teléfonos se clasifica como pantalla táctil y funciona.

El "modo de activación" de ShootingPlus tampoco sirve en Android 16: su servicio
(`QXToolMain`) inyecta eventos que el `InputDispatcher` rechaza (`Inconsistent event`).
Más detalles en [docs/diagnostico.md](docs/diagnostico.md).

## La solución: módulo Magisk

`module/` es un módulo de Magisk que añade
`/system/usr/idc/Vendor_1949_Product_0402.idc`:

```
device.internal = 1          # asociarlo a la pantalla del teléfono
touch.deviceType = touchScreen
touch.orientationAware = 0   # el mando envía coordenadas en la orientación visible
```

Con esto Android lo trata como `TOUCHSCREEN | STYLUS`: la flecha desaparece y los
toques caen en su sitio en cualquier orientación.

## Uso

Requisitos: Windows con PowerShell, el celular con Magisk y la depuración USB activada.
ADB y fastboot ya están en `tools\platform-tools\` (`install.ps1` los encuentra solo).

```powershell
# 1. Generar el zip del módulo en dist\
.\build.ps1

# 2. Copiarlo al celular e instalarlo (si Magisk da root a "Shell")
.\install.ps1 -Reboot
```

Si Windows bloquea los scripts, ejecútalos así:
`powershell -ExecutionPolicy Bypass -File .\build.ps1`

Si `install.ps1` no consigue root, instálalo desde el celular:
**Magisk → Módulos → "+" → Descargas → el zip → Reiniciar**.

Después de reiniciar, conecta el mando con **Home + A**.

### Personalizar

| Quiero... | Edita |
|---|---|
| Cambiar cómo se interpretan los toques | `module/system/usr/idc/Vendor_1949_Product_0402.idc` |
| Soportar otro mando | Añade `module/system/usr/idc/Vendor_XXXX_Product_YYYY.idc` (los IDs salen de `adb shell getevent -i`) |
| Publicar una versión nueva | Sube `version` y `versionCode` en `module/module.prop` y vuelve a ejecutar `build.ps1` |

Para comprobar cómo ve Android el mando:

```powershell
adb shell dumpsys input | Select-String "GamepadPlus" -Context 0,16
```

Hay que fijarse en `Sources: TOUCHSCREEN`, `ConfigurationFile: ...Vendor_1949_Product_0402.idc`
y, en la sección del mapeador, `OrientationAware: false`.

## Mapeador propio: `mapper/` (módulo "Gamepad Mapper")

Es un módulo aparte (`id=gamepad_mapper`) que convive con el arreglo anterior.
Con el mando en **modo gamepad (Home + X)**, el servicio `gpmapper`:

- Detecta la app en primer plano y, si tiene un perfil, **captura el mando** y
  convierte botones y sticks en toques sobre una pantalla táctil virtual (uinput).
  En las apps sin perfil, el mando funciona como gamepad normal.
- Lee los perfiles de `/sdcard/Android/data/com.gamepadmapper.app/files/profiles/*.conf` y los recarga solo
  cuando los guardas. Escribe su registro en `/sdcard/Android/data/com.gamepadmapper.app/files/mapper.log`.
- Pausa o reanuda el mapeo si mantienes **SELECT + START** 1 segundo o con el botón **Mando** de
  Ajustes rápidos (sirve igual sin root).
- Escribe las coordenadas tal como se ve la pantalla. El IDC
  `Vendor_1949_Product_7a01.idc` (`orientationAware = 0`) hace que funcionen en
  cualquier rotación.

Formato de un perfil (más en `mapper/module/profiles/plantilla.conf.txt`):

```
package = app.downhillrevived
screen  = 2340x1080
A  = tap 1980 895             # toque mientras está pulsado
LS = stick 405 735 150        # joystick en pantalla: centro y radio
RS = look 1500 500 14         # cámara: arrastre continuo (velocidad)
```

Botones: `A B X Y L1 R1 L2 R2 L3 R3 SELECT START HOME DPAD_UP/DOWN/LEFT/RIGHT LS RS`,
o `BTN_xxx` (hexadecimal) para códigos raros. Para ver qué nombre envía cada botón,
crea un archivo vacío `/sdcard/Android/data/com.gamepadmapper.app/files/debug` y mira `mapper.log`.

Compilar e instalar:

```powershell
.\mapper\build.ps1                                   # compila y genera dist\gamepad_mapper-<version>.zip
.\install.ps1 -Zip .\dist\gamepad_mapper-v2.zip     # copia e instala (o con el "+" de Magisk)
```

El compilador Zig ya está en `tools\zig\`.

## App "Gamepad Mapper" (editor visual): `app/`

Es una app Android que gestiona los perfiles sin tocar archivos de texto.

- **Pantalla principal:** muestra el estado del módulo, la lista de perfiles con el
  icono de cada juego (Editar / Borrar), el botón **+ Nuevo perfil** (eliges el juego
  de una lista) y el registro del mapeador.
- **Editor flotante:** al pulsar *Editar* se abre el juego con una burbuja **GM**
  encima. Al tocarla aparecen los círculos de los botones:
  - Arrástralos encima de cada botón del juego.
  - Toca uno para cambiarlo:
    - **Detectar botón:** pulsas el botón físico del mando y queda asignado.
      Sirve para cualquier mando, gatillos analógicos y botones raros incluidos.
    - En LS/RS, **Detectar stick** (derecha y luego abajo) aprende qué ejes usa tu mando.
    - En LS/RS eliges *Joystick* (radio) o *Cámara*, que arrastra la pantalla para
      mover la vista. Cámara tiene velocidad, sensibilidad vertical e invertir Y.
    - *Quitar* borra el círculo.
  - **+ Botón → Detectar en el mando...** añade cualquier botón pulsándolo.
    **RS** se añade directamente como Cámara.
  - **Guardar** escribe el perfil, que el mapeador aplica al instante.

- **Macros:** en cualquier botón eliges *Macro (varios toques)*. Cada paso es un
  círculo numerado (A1, A2…) con dos tiempos: **Retraso** (espera desde el paso
  anterior; 0 = a la vez; admite 0.5 ms) y **Pulsar** (cuánto dura el toque).
  En el perfil queda como `A = macro 1980 895 0 40; 1705 398 1.5 40`.
- **Barra:** ↶ deshace movimientos (hasta 50) y ○ cambia el tamaño de los
  círculos (Grande/Mediano/Pequeño, se recuerda) para colocar con precisión
  botones que están muy juntos.
- Los paneles se colocan solos donde menos tapan y se pueden arrastrar por su asa (⠿).

**Novedades de la 1.6** (en el editor, botón **⚙ Ajustes del perfil**):
- **Asistente del primer perfil:** al crear uno en blanco ofrece el perfil recomendado de la
  comunidad, el asistente automático (detectar botones → asignar con el mando → guardar y
  probar) o colocar a mano. La burbuja también propone instalar el recomendado.
- **Apuntar y aceleración:** un botón (p. ej. L2) baja la velocidad de la cámara mientras se
  mantiene; la cámara puede acelerar con el stick al tope.
- **Perfil según el mando:** al conectar ese mando se activa su perfil.
- **Vibración** corta del mando al pulsar (si el mando la admite; también con root).
- Solo sin root: **giroscopio** como cámara (siempre o mientras mantienes un botón),
  **teclado y ratón** (teclas `KB_*`, botones `MOUSE_*`, ratón como cámara) y
  **dos jugadores** con dos mandos (`players = 2`, botones `P2_*`).
- **Probar perfil** (menú de la burbuja): círculos donde tocaría, sin tocar el juego.
- Aviso cuando **el juego se actualiza** (por si movió sus controles) y **Enviar diagnóstico**
  (en Ajustes › Diagnóstico) si algo falla.

**Varios perfiles por juego** (para distintos modos de juego): en la pantalla principal
los perfiles se agrupan por juego.
- **+ Perfil** duplica el activo para crear una variante.
- **Usar** elige el activo y **Renombrar** le pone nombre (`name = ...` en el archivo).
- En partida, **SELECT + R1 / L1** pasa al perfil siguiente o anterior, con una
  notificación. Ese R1/L1 no se envía al juego.
- El activo de cada juego se guarda en `/sdcard/Android/data/com.gamepadmapper.app/files/active.txt`
  (`paquete = archivo.conf`), que leen tanto la app como `gpmapper`.

**Biblioteca de perfiles** (pantalla principal): *Descargar perfiles* lee un catálogo
`index.json` (ver [presets/README.md](presets/README.md)); *Importar .conf* carga un
archivo; *Compartir* envía el perfil como texto, y quien lo recibe puede elegir
*Compartir → Gamepad Mapper* para instalarlo.

Cómo funciona "Detectar": la app crea `/sdcard/Android/data/com.gamepadmapper.app/files/learn`. Mientras ese
archivo existe, `gpmapper` no genera toques y escribe en `learn_result` el nombre de lo
que pulses (`A`, `BTN_13A`, `AXIS_9+`, `DPAD_UP`...). Si el archivo tiene más de 30 s,
se ignora.
  - Para mover la burbuja, arrástrala. Para cerrar el editor, mantenla pulsada.

Compilar e instalar (sin Gradle ni Android Studio, con `tools\jdk` y `tools\android-sdk`):

```powershell
.\app\build.ps1                                        # genera dist\GamepadMapper-<version>.apk
.\tools\platform-tools\adb.exe install -r .\dist\GamepadMapper-1.1.apk
.\tools\platform-tools\adb.exe shell appops set com.gamepadmapper.app SYSTEM_ALERT_WINDOW allow
.\tools\platform-tools\adb.exe shell appops set com.gamepadmapper.app MANAGE_EXTERNAL_STORAGE allow
```

La primera compilación crea la clave de firma en `keystore\`. **No la pierdas:** para
actualizar la app instalada hay que firmar con la misma clave. Además es secreta, así
que `.gitignore` la excluye.

Para publicar una versión nueva, sube `android:versionCode` y `android:versionName` en
`app/AndroidManifest.xml`.

## Sin root (otros teléfonos): servicio de accesibilidad

Sin root ni PC, la app hace el mapeo con un **servicio de accesibilidad** (`PadService`):

- **Botones:** `onKeyEvent` (cualquier Android 8+).
- **Sticks, gatillos analógicos y cruceta analógica:** `setMotionEventSources(SOURCE_JOYSTICK)`
  + `onMotionEvent`, que Android solo ofrece desde **Android 14**. En versiones anteriores
  funcionan botones y macros, pero no los sticks.
- **Toques:** `dispatchGesture`. Cada dedo es un trazo que se mantiene con
  `continueStroke(..., willContinue=true)`, así se pueden mantener varios a la vez.
- Lee los mismos perfiles (`/sdcard/Android/data/com.gamepadmapper.app/files/profiles`) y usa el mismo protocolo
  de "Detectar" (`learn` / `learn_result`) que `gpmapper`. Si `gpmapper` (root) está en
  marcha, el servicio no hace nada.
- Solo captura el mando en apps con perfil; en el resto el mando funciona normal.
- Depuración: crear `/sdcard/Android/data/com.gamepadmapper.app/files/debug` → registro en `pad.log`.

El usuario solo tiene que activarlo en *Ajustes › Accesibilidad › Gamepad Mapper* (la app
le guía). En Android 13+ con APK descargado puede pedir antes *Permitir ajustes
restringidos* (Información de la app › ⋮).

Pruebas sin mando: `experimental/fakepad` crea un mando virtual por uinput desde `adb shell`
(`fakepad w500 pA w300 rA l1,0 w200 l0,0`).
## Mejora con root desde la app

La app (**Gamepad Mapper Plutón**) muestra la tarjeta *Mejora con root*. Si detecta Magisk,
KernelSU o un `su`, la resalta como "Mejora disponible". Explica las ventajas del módulo
(menos retraso, sticks en cualquier Android, macros precisas, sin Accesibilidad) y con
**Guardar módulo** copia a Descargas el zip que va dentro del APK
(`GamepadMapperPluton-root.zip`). `app\build.ps1` incluye automáticamente el
`dist\gamepad_mapper-vN.zip` más reciente, así que primero hay que compilar `mapper\build.ps1`.

Cuando el módulo está funcionando (`status.txt` con `uid=0`), la tarjeta desaparece y el
servicio de accesibilidad se queda en espera.

**Repositorio:** https://github.com/Hades0413/GamePadMapperPluton (`RootMode.REPO_URL` en
`app/src/com/gamepadmapper/app/RootMode.java`). El catálogo online sale de `presets/` de la rama `main`.

## Compilar con `make` (Linux, macOS y Windows)

Todo se hace con el `Makefile` (en Windows, desde **Git Bash** o MSYS2 con `make` instalado).
`make` o `make help` lista los comandos.

```bash
make setup     # descarga Zig, JDK 21, Android SDK 36 y bundletool en tools/ (según tu sistema)
make doctor    # comprueba herramientas, clave de firma y teléfono
make build     # pruebas + módulos + APK + AAB (Google Play) en dist/
make run       # instala por USB y abre la app
make logs      # registro de depuración en vivo (make logs-off para apagarlo)
make escritorio  # gpm-escritorio para Linux y Windows en dist/
```

`make test` comprueba que la app y `gpmapper` entienden igual los perfiles y que el motor
genera exactamente los mismos toques que antes con los guiones de `tests/engine/`
(`gpmapper -r perfil.conf guion.txt`, con reloj virtual). Si un cambio del motor es a propósito:
`ACTUALIZAR=1 make test` y revisa el diff de los `.esperado`.

**Publicar una versión** (`main` está protegida): sube la versión en una rama (`make bump V=x.y`),
fusiónala en `develop` por pull request, abre el pull request `develop` → `main` y, ya fusionado,
`git checkout main && git pull && make release` crea el tag y GitHub publica el Release.

**Google Play:** sube `dist/GamepadMapper-<versión>.aab` (lo genera `make aab` o `make build`). Ya
cumple: `targetSdk 36` (obligatorio desde el 31/08/2026), AAB firmado con tu clave de subida, y el
binario `gpmapper` alineado a páginas de 16 KB. La app no tiene librerías nativas (`.so`), así que
funciona en cualquier procesador; el modo root/Shizuku es solo ARM64.

Saltos de línea: `.gitattributes` y `.editorconfig` los fijan (LF en todo; CRLF solo en `.ps1`/`.bat`),
así que da igual el sistema o el editor con que trabajes.

## Compilar en Linux

Hay scripts `.sh` equivalentes a los `.ps1`. Herramientas en `tools/`: `zig/` (Zig 0.13),
`jdk/` (Temurin 21) y `android-sdk` (o `ANDROID_SDK=<ruta>`); adb, el del sistema.

```bash
./mapper/build.sh   # gpmapper + dist/gamepad_mapper-v2.zip (antes que la app)
./build.sh          # touchfix -> dist/gamepadplus_touchfix-v1.zip
./app/build.sh      # dist/GamepadMapper-1.1.apk
```

Pruebas (sin teléfono): `./tests/run.sh` comprueba que un perfil con todos los tipos se lee y
guarda sin perder nada, y que la app y `gpmapper` lo entienden igual (`gpmapper -c perfil.conf`
muestra cómo se entiende cada línea).

**Compilación automática (GitHub Actions, `.github/workflows/build.yml`):** cada push ejecuta las
pruebas y compila. Al subir un tag `v*` firma el APK y lo publica en el Release; para eso hay que
crear en *Settings › Secrets and variables › Actions* los secretos `KEYSTORE_BASE64`
(`base64 -w0 keystore/gamepad-mapper.jks`) y `KEYSTORE_PASSWORD` (contenido de `password.txt`).

`app/build.sh` busca la clave en `KEYSTORE_DIR`, `keystore/` o
`../../gamepad-mapper-CLAVE-FIRMA-PRIVADA/keystore`; si no la encuentra se detiene
(solo crea una nueva con `NEW_KEY=1`).

## Estructura

```
module/                  Módulo Magisk "Touch Fix" (Home + A)
mapper/                  Mapeador propio: src/gpmapper.c (Android), src/core/ (núcleo común), module/
desktop/                 gpm-escritorio: el mismo núcleo para Linux y Windows
desktop/app/             App de escritorio (Tauri): mandos, entrada en vivo y mapeo (ver su README)
tests/                   Pruebas de perfiles y del motor (tests/engine/)
app/                     App Android (editor visual): src/, res/, AndroidManifest.xml, build.ps1
keystore/                Clave de firma de la app (SECRETA, NO subir a GitHub)
build.ps1                Empaqueta un módulo en dist\<id>-<version>.zip
install.ps1              Copia e instala el módulo por ADB
docs/diagnostico.md      Qué se investigó y por qué funciona así
experimental/gpbridge/   Puente uinput sin root (base para un mapeador propio)
backups/                 boot.img original y parcheado (NO subir a GitHub)
dist/                    Zips generados (NO subir a GitHub)
tools/platform-tools/    adb y fastboot de Google (NO subir a GitHub)
```

`.gitignore` ya excluye `backups/`, `dist/`, `tools/` y los binarios compilados.

## Root y recuperación

El root es **opcional** (la app funciona sin él). Si usas el módulo con Magisk o KernelSU:

- Guarda siempre una copia del `boot.img` original de tu ROM antes de parchearlo, fuera del
  repositorio (la carpeta `backups/` está excluida de git).
- **Si el teléfono no arranca** tras parchear, entra en fastboot y vuelve a flashear tu `boot.img`
  original (`fastboot flash boot <tu-boot-original>.img` y `fastboot reboot`).
- **Si actualizas la ROM** se pierde el root: parchea con Magisk el `boot.img` de la nueva versión.
  El módulo sigue instalado y vuelve a funcionar en cuanto el root está activo.

## Versión de escritorio (Linux y Windows): `desktop/`

`gpm-escritorio` convierte el mando en toques dentro de la ventana donde se ve un juego Android en
el PC (scrcpy, Waydroid, un emulador), con el mismo núcleo que el motor root de la app y los mismos
perfiles, adaptados al tamaño de la ventana. En Linux crea una pantalla táctil virtual (uinput) y
en Windows inyecta toques reales (Windows 8+, mandos XInput). Se descarga en Releases junto al APK.

```bash
./gpm-escritorio-linux-x86_64 --perfil mi-juego.conf --ventana "Juego"
gpm-escritorio-windows-x86_64.exe --comunidad <id-del-perfil> --ventana "BlueStacks"
```

Permisos, opciones y limitaciones (Wayland, mandos no XInput...) en [`desktop/README.md`](desktop/README.md).

## Web y perfiles de la comunidad

En **https://hades0413.github.io/GamePadMapperPluton/** puedes buscar tu juego y descargar perfiles que
ha subido la comunidad («Enviar a la app» en Android), o subir el tuyo iniciando sesión con GitHub.
Puedes filtrar por marca, modelo y pantalla, y ver cuántos lo han instalado y a cuántos les funciona.
La app avisa cuando un perfil instalado tiene una versión nueva, pregunta «¿Te funcionó?» después de
jugar (de forma anónima) y te deja actualizar tus perfiles publicados con un toque.
El código está en `web/` (ver `web/README.md`) y la base de datos en `supabase/`.

## Contribuir

Las contribuciones se hacen por pull request contra la rama `develop`; `main` es la versión estable
y está protegida. Ver [CONTRIBUTING.md](CONTRIBUTING.md). Para problemas de seguridad:
[SECURITY.md](SECURITY.md).

## Licencia

**[PolyForm Noncommercial 1.0.0](LICENSE)** · Copyright (c) 2026 Hades0413.

- ✅ **Gratis** para usar, estudiar, modificar y compartir con fines **no comerciales** (uso personal,
  aprendizaje, investigación, organizaciones sin fines de lucro).
- ❌ **No se puede vender** ni usar con fines comerciales (por ejemplo, cobrar por la app o por una
  versión modificada, o incluirla en un producto de pago).
- El código es público: cualquiera puede leerlo y proponer mejoras.
- El nombre **"Gamepad Mapper Plutón"** y el logo no se licencian: una versión modificada debe usar
  otro nombre y otro logo ([TRADEMARKS.md](TRADEMARKS.md)).

Nota: al prohibir la venta, no es una licencia "open source" en el sentido de la OSI, así que tiendas
como F-Droid o IzzyOnDroid no la aceptan. Para cualquier otro uso, pregunta al autor.

