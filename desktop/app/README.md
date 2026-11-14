# Gamepad Mapper Plutón para escritorio (app, fase 1)

App de escritorio para **Linux y Windows** con interfaz gráfica, al estilo de x360ce: ves los
mandos conectados, su entrada en vivo y decides qué botón o eje del mando alimenta cada control de un
**mando estándar compatible con XInput**. Es una sola app **Tauri v2** con la misma interfaz en los
dos sistemas y un backend propio de cada uno dentro (`#[cfg(target_os = ...)]`).

> El programa de consola `gpm-escritorio` (toques en juegos Android sobre scrcpy/Waydroid) sigue en
> [`desktop/README.md`](../README.md). Esta app lo irá absorbiendo en las fases siguientes.

## Qué hace ya (pestaña «Mandos»)

- **Lista de mandos** con nombre, fabricante:producto, conexión (USB/Bluetooth) y origen (evdev o
  XInput). Conexión y desconexión en caliente.
- **Entrada en vivo:** cada botón crudo (`b0`, `b1`...) se enciende, cada eje (`a0`...) es una barra
  de -1 a 1 y cada hat (`h0`) una cruceta.
- **Diagrama propio** de un mando genérico (sin logotipos ni ilustraciones de terceros): cada control
  se ilumina con el estado ya mapeado y, al pulsarlo, salta a su selector.
- **Un selector por control estándar** (A, B, X, Y, L1, R1, L2, R2, L3, R3, SELECT, START, HOME,
  DPAD_*, LS X/Y, RS X/Y) para elegir qué entrada cruda lo alimenta.
- **«Asignar todo»:** asistente paso a paso («pulsa A», «mueve el stick izquierdo a la derecha»...).
  Calibra el reposo de cada eje, ignora los ejes con ruido, distingue gatillos que reposan en -1 o
  en 0, se queda con la entrada que más se ha movido y no avanza hasta que sueltas (antirrebote).
  Permite **Atrás**, **Saltar** y **Cancelar**.
- **«Automático»:** busca el mando en **SDL GameControllerDB** (por su GUID, calculado como SDL) y,
  si no está, deduce el mapeo de los códigos del sistema. La **base completa viene incluida**
  (Windows y Linux, versión fijada). Por capas, cada una manda sobre la anterior:
  1. la incluida en la app (`make app-escritorio-base` la refresca para una versión nueva);
  2. **«Buscar actualizaciones»**: descarga la última base oficial (HTTPS, 20 s, 8 MB como mucho,
     se valida antes de usarla) y los mandos que la comunidad envía en la web y aprueba la moderación;
  3. **«Añadir mandos nuevos»**: archivos o líneas SDL **solo en tu equipo** (4 MB como mucho; se
     suman a los anteriores). Para compartir un mando con todos, se envía en la web.
- **Sticks:** zona muerta radial, curva de respuesta e inversión de cada eje, con vista previa.
- **Vibración de prueba**, **exportar/importar** el mapeo como línea SDL y **guardar** por mando
  (por GUID) en:
  - Linux: `~/.config/gamepad-mapper-pluton/mandos/<guid>.json` (o `$XDG_CONFIG_HOME/...`)
  - Windows: `%APPDATA%\GamepadMapperPluton\mandos\<guid>.json`
- Español e inglés.

## Arquitectura

```
desktop/app/
├── Cargo.toml              espacio de trabajo (nucleo + src-tauri)
├── nucleo/                 biblioteca Rust SIN Tauri (se prueba sola)
│   ├── src/dispositivos/   FuenteMandos: enumerar, leer, vibrar
│   │   ├── linux.rs        evdev (/dev/input/event*), conexión en caliente
│   │   ├── windows.rs      XInput (4 ranuras)
│   │   └── simulado.rs     fuente en memoria para pruebas
│   ├── src/mapeo/          modelo entrada cruda -> control estándar
│   │   ├── sdl.rs          líneas SDL GameControllerDB y GUID de SDL
│   │   ├── basedatos.rs    base de datos por capas (incluida, actualizada, del usuario)
│   │   ├── auto.rs         automático (base de datos o heurística)
│   │   ├── ajustes.rs      zona muerta, curva, inversión -> estado estándar
│   │   └── almacen.rs      JSON por GUID en la carpeta de configuración
│   ├── src/asistente.rs    máquina de estados de «Asignar todo»
│   ├── src/servicio.rs     une todo para la interfaz
│   ├── datos/              SDL_GameControllerDB (Windows y Linux) + su licencia (zlib)
│   ├── tests/uinput.rs     prueba con un mando virtual (Linux)
│   └── examples/mando_virtual.rs   mando virtual que se mueve solo, para probar la app
├── src-tauri/              la app: comandos, hilo de lectura (~60 Hz a la interfaz), bandeja
└── ui/                     React + TypeScript + Vite + Tailwind 4 (pnpm)
    └── src/
        ├── dominio/        tipos (los mismos que en Rust), fuentes SDL, controles
        ├── backend/        Backend: tauri.ts (real) y simulado/ (navegador)
        ├── componentes/    diagrama, panel en vivo, selectores, asistente, sticks...
        ├── pestanas/       pestaña «Mandos»
        └── i18n/           español (clave) -> inglés
```

- **Entradas crudas con numeración de SDL** (`b0`, `a2`, `h0.4`): en Linux los botones y ejes se
  numeran como SDL, así las líneas `platform:Linux` de GameControllerDB sirven sin cambios. Los ejes
  van de -1 a 1 (un gatillo suelto vale -1, como en SDL).
- **Mapeos en formato SDL:** cada control guarda su fuente como en GameControllerDB (`b0`, `a2`,
  `+a2`, `-a2`, `a3~`, `h0.4`) y los nombres de los controles son los de los perfiles (`A`, `L1`,
  `DPAD_UP`, `LS_X`...), para que las fases siguientes los usen sin traducir.
- **Linux:** crate [`evdev`](https://crates.io/crates/evdev) (ioctl seguros sobre `/dev/input`,
  vibración por force feedback y creador de dispositivos uinput, que también servirá para el mando
  virtual de la fase 2). Solo se abren los dispositivos que parecen mandos (misma regla que el motor
  en C: al menos 4 botones de mando, `ABS_X` y `ABS_Y`, sin `BTN_TOUCH`). La lista de
  `/dev/input` se revisa cada segundo (más sencillo y robusto que inotify: udev da permisos al nodo
  un poco después de crearlo) y las desconexiones se detectan al instante al leer.
- **Windows:** XInput con `windows-sys`, disposición fija igual que SDL.
- **Interfaz:** sin Tauri (`pnpm dev`) usa un backend simulado con dos mandos que se mueven solos y un
  asistente que «pulsa» por ti; dentro de Tauri, el backend real. Los colores y la tipografía son los
  de la web (copiados, sin depender de `web/`).

## Probar la interfaz en el navegador (sin mando ni Tauri)

```bash
make app-escritorio-dev        # o: cd desktop/app/ui && pnpm install && pnpm dev
# http://localhost:1420  (aparece «Modo demostración»)
```

## Compilar la app

Linux (Debian/Ubuntu): paquetes del sistema de Tauri, una vez:

```bash
sudo apt install build-essential libwebkit2gtk-4.1-dev libssl-dev \
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev
```

Además: Rust estable (`rustup`), Node 22+ y pnpm. Luego:

```bash
make app-escritorio-test   # pruebas del núcleo (+ mando virtual si /dev/uinput es escribible)
make app-escritorio        # interfaz + app -> desktop/app/target/release/bundle/
                           #   Linux: deb/*.deb y appimage/*.AppImage   Windows: nsis/*-setup.exe
```

Para desarrollar con recarga en caliente: `cd desktop/app && ui/node_modules/.bin/tauri dev` (con
`pnpm dev` de `ui/` en marcha en otra terminal).

Permisos en Linux: leer `/dev/input/event*` (grupo `input`) y, para el mando virtual de las pruebas,
`/dev/uinput`: [`desktop/linux/instalar-permisos.sh`](../linux/instalar-permisos.sh). El `.deb`
instala la regla udev `99-gamepad-mapper.rules`.

### Sin mando a mano

```bash
cd desktop/app
cargo run -p gpm-nucleo --example mando_virtual -- 60    # mando virtual (uinput) durante 60 s
target/release/gamepad-mapper-pluton --listar-mandos      # lo que ve el backend, en JSON
```

`GPM_LOG=debug` muestra más registro.

## Hoja de ruta

- **Fase 2 — salida por mando:** elegir para cada mando qué produce:
  - **toques** para juegos Android (Waydroid, emuladores, Google Play Games, scrcpy) con el núcleo en
    C de `mapper/src/core/` (el mismo de la app Android y de `gpm-escritorio`), enlazado por FFI;
  - y/o un **mando virtual compatible con XInput**: uinput en Linux (el crate `evdev` ya lo
    incluye) y ViGEmBus en Windows si está instalado.
  El mapeo de esta fase es la entrada de ambas salidas (nombres de control de los perfiles).
- **Fase 3 — «Juegos»:** perfil por juego que cambia solo al cambiar el foco de ventana.
- **Fase 4 — editor sobre la ventana del juego:** macros y capas dibujadas encima del juego.
- **Fase 5 — nube:** presets de mandos y perfiles compartidos con la web.
- Windows: leer también mandos no XInput (Raw Input / HID) con la misma numeración de SDL.

## Licencias

- Código: PolyForm Noncommercial 1.0.0 (como el resto del proyecto).
- `nucleo/datos/gamecontrollerdb.txt`: líneas de Windows y Linux, sin cambios, de
  [SDL_GameControllerDB](https://github.com/mdqinc/SDL_GameControllerDB), licencia zlib
  ([`LICENCIA-SDL_GameControllerDB.txt`](nucleo/datos/LICENCIA-SDL_GameControllerDB.txt)).
- El diagrama del mando es un dibujo propio; «compatible con XInput» describe el protocolo. No se
  usan ilustraciones, logotipos ni marcas de Microsoft/Xbox.
