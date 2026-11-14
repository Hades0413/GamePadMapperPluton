# Gamepad Mapper Plutón para escritorio (app 0.2: mandos virtuales y toques)

App de escritorio para **Linux y Windows** con interfaz gráfica, al estilo de x360ce pero propia:
ves los mandos conectados y su entrada en vivo, decides qué botón o eje alimenta cada control de un
**mando estándar** y lo **conviertes en otro mando** (Xbox 360, DualShock 4 o Switch Pro virtual) con
turbo, alterno, macros, capas, botones extra, curvas por eje y vibración, o en **toques** para jugar a
juegos Android que se ven en el PC (Waydroid, emuladores, scrcpy) con los perfiles de la app y de la
comunidad. Es una sola app **Tauri v2** con la misma interfaz en los dos sistemas y un backend propio
de cada uno (`#[cfg(target_os = ...)]`).

> El programa de consola `gpm-escritorio` ([`desktop/README.md`](../README.md)) sigue disponible; la
> app hace lo mismo con interfaz y el mismo núcleo en C.

## Qué hace

### Pestaña «Mandos» (una sub-pestaña por apartado, como x360ce)

- **Lista de mandos** con nombre, fabricante:producto, conexión y origen (evdev o XInput), en caliente.
- **General:** diagrama propio del mando (sin logotipos ni ilustraciones de terceros), un selector
  por control estándar, **«Asignar todo»** (asistente paso a paso), **«Automático»** (SDL
  GameControllerDB por capas: incluida, actualizada, comunidad y la tuya), entrada en vivo de cada
  botón, eje y hat, y el **mando virtual en vivo** (lo que ve el juego).
- **Botones:** qué hace cada botón: **normal**, **turbo** (1–30 pulsaciones/s), **alterno**, otro
  control del mando virtual (incluidas las direcciones de los sticks), una **macro**, una **tecla** o
  **ignorar**. **Capas (shift):** mientras mantienes un modificador, las entradas hacen otra cosa.
- **Cruceta:** sus entradas y acciones, **cruceta → stick**, **stick → cruceta** e **intercambiar
  sticks**.
- **Gatillos:** zona muerta, anti zona muerta y recorrido, con gráfica de respuesta en vivo.
- **Stick izquierdo / derecho:** zona muerta radial y curva del stick, y para **cada eje** su gráfica
  de respuesta en vivo con anti zona muerta, zona muerta, sensibilidad, recorrido e inversión.
- **Botones extra:** todo lo que el mando tiene además del estándar (paletas, captura, clic del panel
  táctil, ejes y hats adicionales) se ve, se ilumina al pulsarlo y se asigna a un control, una macro,
  una tecla o «ignorar».
- **Macros:** editor de pasos (pulsar, soltar, toque, esperar), repetir mientras se mantiene y
  **grabación pulsando el mando**. Límites: 32 macros, 64 pasos, 10 s por paso.
- **Vibración:** reenviar la del juego al mando físico, intercambiar motores, intensidad general y de
  cada motor, y prueba de cada motor.
- **Salida:** el mando virtual (ninguno, Xbox 360, DualShock 4, Switch Pro) o **Toques**, su estado y
  por qué no se puede crear (permisos en Linux, ViGEmBus en Windows).
- **Presets:** copiar/pegar la configuración entera (JSON, 1 MB como mucho, validado en el núcleo),
  guardarla y cargarla de archivo; exportar/importar el mapeo como línea SDL.
- Todo se guarda **por modelo de mando** (GUID) en JSON versionado (v2; los de la v1 se leen y se
  migran solos):
  - Linux: `~/.config/gamepad-mapper-pluton/mandos/<guid>.json` (o `$XDG_CONFIG_HOME/...`)
  - Windows: `%APPDATA%\GamepadMapperPluton\mandos\<guid>.json`

### Mandos virtuales («convertir en distintos mandos»)

| Tipo | Linux (uinput) | Windows (ViGEmBus) |
|------|----------------|--------------------|
| Xbox 360 | `Microsoft X-Box 360 pad`, 045e:028e v0114, como xpad | XUSB (XInput) |
| DualShock 4 | `Sony Interactive Entertainment Wireless Controller`, 054c:09cc v8111, como hid-playstation | DS4 (con clic del panel táctil) |
| Switch Pro | `Nintendo Switch Pro Controller`, 057e:2009 v8111, como hid-nintendo | — (no existe en ViGEm) |

- **Linux:** el mando virtual copia nombre, bus USB, ids, versión, botones, ejes y rangos del driver
  del kernel, así SDL (GUID de GameControllerDB), Steam y los juegos lo reconocen como el de verdad.
  Mientras está activo, el mando físico se **captura** (EVIOCGRAB) para que los juegos no vean la
  entrada dos veces; se libera al quitarlo, al pausar, al desconectar o al cerrar la app (si la app
  se cierra de golpe, el kernel lo libera solo). La app **no lee sus propios mandos virtuales**
  (registro de sus dispositivos en sysfs). La **vibración** que el juego sube al mando virtual
  (FF_RUMBLE) se reenvía al físico con los ajustes de «Vibración».
- **Windows:** [ViGEmBus](https://github.com/nefarius/ViGEmBus/releases) de Nefarius si lo instalas
  tú (la app no incluye drivers). Además hace falta `ViGEmClient.dll` (x64) junto al ejecutable: se
  carga solo desde la carpeta de la app o System32 (nunca del directorio actual). ViGEmBus está
  retirado por su autor y sin soporte, aunque sigue funcionando en Windows 10 y 11. Para ocultar el
  mando físico a los juegos, HidHide. Las ranuras XInput de nuestros mandos virtuales no se leen.
- El motor (turbo, macros, capas, curvas...) corre en el hilo de lectura, en cuanto llega la entrada
  (espera de 2 ms como mucho): menos de 2 ms de proceso; medido en las pruebas con uinput, ~0,2 ms
  del mando físico al virtual.
- **Pausa global** (cabecera, bandeja o atajo de teclado): quita todos los mandos virtuales y libera
  los físicos.

### Toques (juegos Android en el PC)

La salida **«Toques»** de un mando convierte su mando virtual (con todo lo de su configuración: turbo,
capas, macros...) en **toques dentro de la ventana del juego**, con los perfiles `.conf` de la app de
Android y de la web. Es el **mismo núcleo en C** que el motor root de Android y `gpm-escritorio`
(`mapper/src/core/`, compilado dentro del crate `nucleo` con `build.rs` + `cc` y usado por FFI en
`nucleo/src/toques/`): el mismo perfil da los mismos toques (los guiones de `tests/engine` dan byte a
byte lo mismo que `gpmapper -r`).

- **Destino** (Mandos → Salida → Toques): una **ventana** de la lista de ventanas abiertas (título,
  clase y tamaño; Linux X11/XWayland con x11rb, Windows con `EnumWindows`), que se **sigue** si se mueve
  o cambia de tamaño; la **pantalla completa**; o un **rectángulo manual** (Wayland puro). Con «solo
  mientras la ventana tiene el foco», fuera del juego el mando funciona normal. Los toques del perfil
  se adaptan al rectángulo con la misma fórmula que el móvil.
- **Salida:** Linux, una pantalla táctil multitáctil virtual (uinput, `INPUT_PROP_DIRECT`) que cubre
  el escritorio; Windows, `InjectTouchInput` (Windows 8+, sin drivers). Mientras se toca, el mando
  físico se **captura** (EVIOCGRAB) y se suelta al pausar, perder el foco o quitar la salida. Un solo
  mando a la vez usa los toques (el núcleo es global).
- **Perfiles** (pestaña Juegos): en `~/.config/gamepad-mapper-pluton/perfiles/*.conf` (Windows
  `%APPDATA%\GamepadMapperPluton\perfiles`), validados con las mismas reglas que la web y la base de
  datos (16 KB, 400 líneas, 150 botones, `package` y `screen`...). Se **importan de archivo**, se
  **descargan de la comunidad** (perfiles publicados del juego, por «me gusta», con vista previa), se
  ven dibujados y se borran.
- **Qué perfil se usa:** el fijado a mano; si no, el del juego activo de la pestaña Juegos (por
  ventana, p. ej. la de Waydroid); si no, el del **juego Android en primer plano** detectado por **adb**
  (`dumpsys activity activities` / `dumpsys window`, cada 2 s, solo mientras un mando usa los toques o
  se mira la pestaña): el elegido para ese paquete o el primero que haya. Con el mando,
  **SELECT+START** (1 s) pausa o reanuda y **SELECT+R1/L1** cambia al siguiente perfil del mismo juego.
- **Waydroid:** `adb connect <IP>:5555` (la IP sale en `waydroid status`); los emuladores aparecen
  solos en `adb devices`. adb (Android platform-tools) se busca en el `PATH` y en las carpetas
  habituales del SDK, siempre por ruta absoluta.

### Pestaña «Juegos»

Una configuración por juego y modelo de mando que se usa sola cuando el juego **tiene el foco**: se
reconoce por su ejecutable o la clase de su ventana (Linux X11/XWayland: `_NET_ACTIVE_WINDOW`,
`WM_CLASS` y `/proc/<pid>/exe` con x11rb, y `xprop` de plan B; Windows: el proceso de la ventana en
primer plano). Botón «Detectar ventana activa» (3 s para cambiar al juego). Se guardan en
`juegos.json`. En Wayland puro (sin XWayland) los compositores no dicen qué ventana tiene el foco.
Cada juego puede llevar además un **perfil de toques** (juegos Android en una ventana sin adb).

### Pestaña «Opciones» y bandeja

- Al cerrar, seguir en la **bandeja** (los mandos virtuales siguen funcionando); arrancar con el
  sistema (Linux: `~/.config/autostart/gamepad-mapper-pluton.desktop`; Windows: `HKCU\...\Run`);
  arrancar minimizada; tema (oscuro, claro, del sistema); idioma; cambio automático por juego;
  **atajo global de pausa** (por defecto `Ctrl+Alt+P`); registro en archivo (`registro.log`, 1 MB con
  rotación) y las últimas líneas en pantalla; actualizaciones.
- **Bandeja:** mostrar, pausar/reanudar todo, cada mando con su mando virtual (✓ activo, ✗ error,
  ⏸ en pausa), el juego activo y salir. Una sola copia de la app a la vez.
- Español e inglés (las pruebas comprueban que no falta ni sobra ninguna traducción).

## Arquitectura

```
desktop/app/
├── Cargo.toml              espacio de trabajo (nucleo + src-tauri)
├── nucleo/                 biblioteca Rust SIN Tauri (se prueba sola)
│   ├── src/dispositivos/   FuenteMandos: enumerar, leer, vibrar, capturar (evdev, XInput, simulada)
│   ├── src/mapeo/          entrada cruda -> control estándar
│   │   ├── acciones.rs     acciones, macros, capas, teclas (Entrada, Accion, SalidaPad)
│   │   ├── ajustes.rs      zona muerta, curvas por eje, gatillos -> estado estándar
│   │   ├── validar.rs      validación de todo lo que llega de fuera (límites, referencias, 1 MB)
│   │   ├── sdl.rs, basedatos.rs, auto.rs, almacen.rs (JSON v2 con migración)
│   ├── src/motor.rs        estado estándar + configuración -> mando virtual y teclas (puro)
│   ├── src/salida/         mandos virtuales: linux.rs (uinput), windows.rs (ViGEm), simulada.rs;
│   │                       pantalla de toques: pantalla_linux.rs (uinput), pantalla_windows.rs
│   ├── src/toques/         toques: motor.rs (nucleo en C por FFI), perfiles.rs (validacion,
│   │                       carpeta, comunidad), android.rs (adb), ventanas.rs, config.rs
│   ├── c/ + build.rs       compila mapper/src/core (gpm_core.c, gpm_repeticion.c) y un puente
│   ├── src/juegos.rs       configuraciones por juego; foco.rs ventana activa
│   ├── src/opciones.rs     opciones; sistema.rs inicio con el sistema
│   ├── src/servicio.rs     une todo para la interfaz (servicio/toques.rs: la sesion de toques)
│   ├── tests/uinput.rs     mando de prueba -> fuente evdev, asistente, guardado
│   ├── tests/salida_uinput.rs  mandos virtuales reales: ids, capacidades, captura, turbo, macro,
│   │                           capa, latencia, exclusión y vibración de vuelta
│   ├── tests/toques_motor.rs   el núcleo por FFI da lo mismo que gpmapper -r (tests/engine)
│   └── tests/toques_uinput.rs  toques reales en una pantalla táctil virtual capturada por la prueba
│                               (nunca llegan al escritorio)
├── src-tauri/              la app: comandos, hilos (lectura y foco), bandeja, atajo, actualizador
│   ├── linux/              plantilla .desktop, regla udev de uinput, postinst del .deb
│   └── tauri.firmado.json  activa la firma del actualizador (lo usan make y CI con la clave)
├── scripts/                renombrar-paquetes.sh (sin espacios), latest-json.sh (actualizador)
└── ui/                     React + TypeScript + Vite + Tailwind 4 (pnpm)
    └── src/ dominio/ backend/ (tauri.ts y simulado/) componentes/ pestanas/ (mando/*) i18n/
```

- **Entradas crudas con numeración de SDL** (`b0`, `a2`, `h0.4`) y mapeos en formato SDL; los nombres
  de los controles son los de los perfiles (`A`, `L1`, `DPAD_UP`, `LS_X`...).
- **Seguridad:** todo lo que llega de la interfaz se valida en Rust (ids, tamaños, rangos, número de
  macros/pasos/capas, esperas, teclas conocidas, presets ≤ 1 MB con esquema tipado, perfiles de
  toques ≤ 16 KB con las reglas de la web, destino de los toques, series de adb y paquetes con forma
  estricta); no hay shell (`Command` con argumentos fijos para `xprop` y `adb`, con tiempo máximo y
  tope de salida); las URL que se abren o consultan son fijas en Rust (la de la comunidad solo lleva el
  paquete ya validado); la ventana solo tiene `core:default` (los plugins se usan desde Rust).

## Probar la interfaz en el navegador (sin mando ni Tauri)

```bash
make app-escritorio-dev        # o: cd desktop/app/ui && pnpm install && pnpm dev
# http://localhost:1420  («Modo demostración»: tres mandos, uno con paletas y DualShock 4 virtual)
# Enlaces directos: http://localhost:1420/#mandos/stick_izquierdo/1  ·  #mandos/extras/3  ·  #juegos
# Toques de ejemplo: #mandos/salida/2 (Waydroid «por adb» con Clash Royale) y #juegos
```

## Compilar la app

Linux (Debian/Ubuntu): paquetes del sistema de Tauri, una vez:

```bash
sudo apt install build-essential libwebkit2gtk-4.1-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev
```

Además: Rust estable (`rustup`), Node 22+ y pnpm. Luego:

```bash
make app-escritorio-check  # formato, clippy (Linux y Windows) y pruebas (+ uinput si hay permiso)
make app-escritorio        # interfaz + app -> desktop/app/target/release/bundle/
```

Paquetes, **sin espacios en el nombre** (el nombre visible sigue siendo «Gamepad Mapper Plutón»):

- Linux: `deb/gamepad-mapper-pluton_0.2.0_amd64.deb`, `appimage/gamepad-mapper-pluton_0.2.0_amd64.AppImage`
- Windows: `nsis/gamepad-mapper-pluton_0.2.0_x64-setup.exe`, `msi/gamepad-mapper-pluton_0.2.0_x64_es-ES.msi`
  y, en CI, `portable/gamepad-mapper-pluton_0.2.0_x64-portable.zip`. Los instaladores llevan el
  instalador de WebView2 dentro (`embedBootstrapper`); Windows 10/11 ya traen WebView2 casi siempre.

El `.deb` instala la regla udev `70-gamepad-mapper-pluton.rules` (`/dev/uinput` para el grupo
`input` y el usuario con sesión, `uaccess`) y la aplica al instalar. Con la AppImage:
[`src-tauri/linux/70-gamepad-mapper-pluton.rules`](src-tauri/linux/70-gamepad-mapper-pluton.rules) o
[`desktop/linux/instalar-permisos.sh`](../linux/instalar-permisos.sh).

### Sin mando a mano

```bash
cd desktop/app
cargo run -p gpm-nucleo --example mando_virtual -- 60    # mando virtual (uinput) durante 60 s
target/release/gamepad-mapper-pluton --listar-mandos      # lo que ve el backend, en JSON
cargo test -p gpm-nucleo --test salida_uinput --test toques_uinput -- --ignored --nocapture --test-threads=1
```

`GPM_LOG=debug` muestra más registro.

## Actualizaciones automáticas y publicación

La app usa el **plugin oficial de actualizaciones de Tauri v2** con paquetes **firmados** (minisign).
Consulta `https://github.com/Hades0413/GamePadMapperPluton/releases/download/escritorio-latest/latest.json`
y solo instala lo que esté firmado con la clave privada que corresponde a la clave pública de
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). Se actualizan solas la instalación de
Windows (NSIS/MSI) y la AppImage; el `.deb` se actualiza descargándolo de nuevo.

**Clave de firma** (ya generada con `tauri signer generate`): está en
`~/.config/gamepad-mapper-pluton-signing/` (`updater.key`, `password.txt`, `updater.key.pub`) en el
equipo del propietario y **nunca se sube al repositorio**. Para que CI firme, añade en GitHub
(Settings → Secrets and variables → Actions):

- `TAURI_SIGNING_PRIVATE_KEY`: el contenido de `updater.key`;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: el contenido de `password.txt`.

Si se pierde la clave, hay que generar otra y publicar una versión con la clave pública nueva (las
instalaciones antiguas no podrán actualizarse solas a esa versión).

**Flujo de publicación** (`.github/workflows/escritorio-app.yml`):

1. Sube la versión en `desktop/app/Cargo.toml` (`workspace.package.version`),
   `src-tauri/tauri.conf.json` y `ui/package.json` (el actualizador solo instala versiones mayores).
2. PR a `develop` → `main`. En cada push a `main` (o a mano con «Run workflow» → publicar), CI
   compila Linux y Windows; con el secreto firma los paquetes (`--config src-tauri/tauri.firmado.json`)
   y genera `latest.json` (`scripts/latest-json.sh`). Sin el secreto los paquetes se generan igual,
   sin firma ni `latest.json` (aviso en la ejecución).
3. El job `publicar` sube todo a la versión `escritorio-latest` (la crea si no existe, sin marcarla
   como «latest» del repositorio) y borra los paquetes de versiones anteriores.

En local: `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.config/gamepad-mapper-pluton-signing/updater.key)"
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat .../password.txt)" make app-escritorio` deja también los `.sig`.

## Hoja de ruta

- **Fase 2B — toques:** hecha en la 0.2 (ver «Toques»). Pendiente: probar con Waydroid, scrcpy y
  un mando real; en Wayland puro solo hay rectángulo manual; la pantalla táctil de Linux cubre todo
  el escritorio (con varios monitores el compositor puede asociarla a uno solo).
- **Fase 3 — editor sobre la ventana del juego** (macros y capas dibujadas encima).
- **Fase 4 — nube:** presets de mandos y perfiles compartidos con la web.
- Windows: leer también mandos no XInput (Raw Input / HID) con la misma numeración de SDL.

## Licencias

- Código: PolyForm Noncommercial 1.0.0 (como el resto del proyecto).
- `nucleo/datos/gamecontrollerdb.txt`: líneas de Windows y Linux, sin cambios, de
  [SDL_GameControllerDB](https://github.com/mdqinc/SDL_GameControllerDB), licencia zlib
  ([`LICENCIA-SDL_GameControllerDB.txt`](nucleo/datos/LICENCIA-SDL_GameControllerDB.txt)).
- ViGEmBus/ViGEmClient (Nefarius) no se incluyen: los instala el usuario.
- El diagrama del mando es un dibujo propio. Xbox, DualShock, PlayStation y Nintendo Switch son
  marcas de sus dueños; aquí solo describen con qué mando es compatible la salida.
