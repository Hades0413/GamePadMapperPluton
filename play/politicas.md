# Play Console: seguridad de los datos, permisos, accesibilidad y clasificación

Respuestas para *Panel › Configurar la app* y *Política › Contenido de la app*. Coinciden con la
política de privacidad de la web (`web/src/presentation/pages/PrivacyPage.tsx`) **más** lo que añade
esta versión (copia en la nube con GitHub y mandos de la comunidad): actualiza la página de
privacidad antes de enviar el formulario (ver «Cambios pendientes en la privacidad» al final).

Manifiesto revisado: `app/AndroidManifest.xml` (versión 1.6, versionCode 8).

---

## 1. Seguridad de los datos (Data safety)

### Preguntas generales

| Pregunta | Respuesta |
|---|---|
| ¿Tu app recoge o comparte alguno de los tipos de datos de usuario obligatorios? | **Sí** |
| ¿Todos los datos de usuario se cifran en tránsito? | **Sí** (todo va por HTTPS a Supabase y GitHub) |
| ¿Ofreces una forma de solicitar la eliminación de los datos? | **Sí**: en la web, *Mi cuenta › Borrar mi cuenta* (borra perfiles, comentarios, mandos enviados y la copia en la nube); en la app, *Ajustes › Copia en la nube › Borrar la copia*; para el resto (número de instalación, diagnósticos) por GitHub Issues. URL de borrado: `https://hades0413.github.io/GamePadMapperPluton/cuenta` |
| ¿Compartes datos con terceros? | **No**. Supabase y GitHub actúan como **proveedores de servicio** (alojan los datos por nosotros), que según Play no cuenta como «compartir». |

### Tipos de datos recogidos

Todos son **opcionales** (la app funciona sin ellos), **no se comparten**, se tratan **solo para
la funcionalidad de la app** (y gestión de la cuenta en su caso) y **no** para publicidad ni
analítica.

| Categoría Play › tipo | ¿Cuándo? | Recogido / efímero | Finalidad | Opcional |
|---|---|---|---|---|
| **Identificadores del dispositivo u otros › Device or other IDs** | Número de instalación **aleatorio** que crea la app (no es el ID de publicidad ni del teléfono). Se envía al instalar un perfil de la comunidad o responder «¿Te funcionó?», para contar una vez por instalación. | Recogido | Funcionalidad de la app | Sí |
| **Actividad en la app › Interacciones con la app** | Qué perfil de la comunidad se instaló y la respuesta «¿Te funcionó?» (sí/no), con el número de instalación. | Recogido | Funcionalidad de la app | Sí |
| **Información y rendimiento de la app › Diagnóstico** (y *Otros datos de rendimiento*) | Solo si el usuario pulsa **Enviar diagnóstico** y lo revisa: versión de la app y de Android, modelo, modo (root/Shizuku/accesibilidad), mandos conectados y últimas líneas del registro. Se borra a los 30 días. | Recogido | Funcionalidad de la app (soporte) | Sí |
| **Información personal › ID de usuario** | Solo con la **copia en la nube**: identificador de la cuenta (Supabase) y nombre de usuario e id de GitHub. | Recogido | Funcionalidad de la app, gestión de la cuenta | Sí |
| **Información personal › Dirección de correo electrónico** | Solo con la copia en la nube: el correo que GitHub comparte al iniciar sesión (no se muestra ni se usa para escribir). | Recogido | Gestión de la cuenta | Sí |
| **Actividad en la app › Otro contenido generado por el usuario** | Solo con la copia en la nube: los perfiles (`.conf`) que el usuario sube. Privados: solo los ve su dueño. | Recogido | Funcionalidad de la app | Sí |

**No se recoge**: ubicación, contactos, mensajes, fotos/vídeos, audio, archivos del usuario fuera
de la app, historial web, información financiera ni de salud, **ni nada del servicio de
accesibilidad** (pantalla, texto, apps abiertas). Los mandos de la comunidad y el catálogo se
**descargan** (no se envían datos del usuario en esas peticiones).

> El sensor de movimiento (giroscopio), el teclado y el ratón se leen solo en el teléfono para
> mover la cámara: no se recogen.

---

## 2. Declaración de la API de Accesibilidad

*Contenido de la app › API de Accesibilidad* (o el formulario de «Permisos y API sensibles»).

**¿Es una herramienta de accesibilidad (`isAccessibilityTool`)?** — **No** (y el manifiesto no lo
declara). Ayuda a personas que no pueden usar bien los controles táctiles, pero su propósito
principal es jugar con mando, y Play reserva `isAccessibilityTool` a apps diseñadas
**principalmente** para personas con discapacidad. Declararlo sin serlo es motivo de rechazo.
Se usa la API de Accesibilidad con la **declaración y la divulgación destacada** (prominent
disclosure) dentro de la app.

### Descripción de uso (pegar en el formulario)

**ES**

> Gamepad Mapper Plutón usa el servicio de accesibilidad (AccessibilityService) para su función
> principal: convertir un mando físico (Bluetooth o USB) en toques en la pantalla, para que se
> pueda jugar con mando a juegos que solo tienen controles táctiles, incluidas personas que no
> pueden usar bien la pantalla táctil.
> - `canRequestFilterKeyEvents` / `flagRequestFilterKeyEvents`: leer los botones del mando.
> - `canPerformGestures` (dispatchGesture): tocar la pantalla en los puntos que el usuario configura
>   en su perfil de cada juego.
> - `typeWindowStateChanged`: saber qué juego está abierto para usar su perfil (solo el nombre del
>   paquete; `canRetrieveWindowContent` es false: no lee el contenido de las ventanas).
> - `canTakeScreenshot`: solo cuando el usuario pulsa «Detectar botones del juego» en el editor;
>   la captura se analiza en el teléfono para proponer dónde colocar cada botón y se descarta. No
>   se guarda ni se envía.
>
> No se recoge, guarda ni comparte ningún dato a través de la API de Accesibilidad. No lee lo que
> el usuario escribe ni el contenido de otras apps, y en las apps sin perfil el mando funciona como
> siempre. Antes de activarlo, la app explica qué hace y el usuario lo activa a mano en Ajustes.

**EN**

> Gamepad Mapper Plutón uses the accessibility service (AccessibilityService) for its core
> feature: turning a physical gamepad (Bluetooth or USB) into screen touches so people can play
> touch-only games with a gamepad, including people who can't use touch controls comfortably.
> - `canRequestFilterKeyEvents` / `flagRequestFilterKeyEvents`: read the gamepad buttons.
> - `canPerformGestures` (dispatchGesture): touch the screen at the points the user sets up in each
>   game's profile.
> - `typeWindowStateChanged`: know which game is open to use its profile (package name only;
>   `canRetrieveWindowContent` is false: window content is never read).
> - `canTakeScreenshot`: only when the user taps «Detect the game's buttons» in the editor; the
>   screenshot is analysed on the device to suggest where to place each button and then discarded.
>   It is never stored or sent.
>
> No data is collected, stored or shared through the Accessibility API. The app does not read what
> the user types or the content of other apps, and in apps without a profile the gamepad works as
> usual. Before enabling it, the app explains what it does and the user turns it on manually in
> Settings.

**Vídeo** (lo pide el formulario): graba el emulador o un teléfono de pruebas con
`adb shell screenrecord /sdcard/a11y.mp4` mostrando: la explicación de la app (*Inicio › Activar ›
¿Cómo?*), el aviso de Android al activar el servicio, y el mando moviendo/tocando en un juego.
Súbelo a YouTube como «no listado» y pega el enlace.

**Divulgación destacada en la app**: ya existe (tarjeta *Activar el mapeador › ¿Cómo?* con «La app
solo lee el mando y toca la pantalla donde tú configures. No lee lo que escribes ni el contenido de
otras apps» y la descripción del servicio `pad_service_desc`). Debe verse **antes** de abrir los
Ajustes de Accesibilidad: no la quites.

---

## 3. Permisos: justificación

| Permiso (manifiesto) | ¿Declaración en Play? | Para qué |
|---|---|---|
| `BIND_ACCESSIBILITY_SERVICE` (servicio `PadService`) | **Sí**: API de Accesibilidad (arriba) | Mapear mando → toques sin root. |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE` (`OverlayService`, `specialUse`) | **Sí**: *Contenido de la app › Permisos de servicio en primer plano* | La burbuja flotante sobre el juego para editar y cambiar perfiles mientras se juega, y avisar a gpmapper (modo Shizuku) de la rotación. Ningún tipo estándar encaja (no es multimedia, ubicación, llamadas, etc.). Texto: «Burbuja flotante sobre juegos para editar y cambiar perfiles del mando; el usuario la inicia y la puede cerrar desde la notificación». Vídeo: burbuja en un juego y la notificación. |
| `SYSTEM_ALERT_WINDOW` | No (acceso especial que concede el usuario) | Dibujar la burbuja y el editor de controles encima del juego. Sin él, la burbuja la muestra el servicio de accesibilidad. |
| `POST_NOTIFICATIONS` | No (permiso en tiempo de ejecución) | Notificación obligatoria del servicio en primer plano (con «Cerrar burbuja») y avisos de cambio de perfil. |
| `PACKAGE_USAGE_STATS` | No (acceso especial que concede el usuario) | Saber qué juego está en primer plano cuando no se usa la Accesibilidad (modo root/Shizuku). Solo el paquete en primer plano. |
| `RECEIVE_BOOT_COMPLETED` | No | Volver a mostrar la burbuja tras reiniciar si el usuario la tenía activa. |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | No hay formulario, pero **Play lo vigila**: solo si es imprescindible | Que el ahorro de batería de algunas marcas no detenga el mapeador en mitad de una partida. La app lo pide solo cuando el usuario toca «Batería sin restricciones». Si Play lo rechaza, quitar el permiso y abrir `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` (la app ya lo hace como alternativa). |
| `INTERNET` | No | Catálogo y perfiles de la comunidad, mandos de la comunidad, copia en la nube, comprobar versiones nuevas. |
| `moe.shizuku.manager.permission.API_V23` | No | Modo rápido opcional con Shizuku (la app aparece en la lista de Shizuku). |
| `QUERY_ALL_PACKAGES` | **No se declara** | La app usa `<queries>` (apps con icono en el lanzador, Magisk y Shizuku) para listar los juegos instalados: no hace falta la declaración de visibilidad de paquetes. |

> El `ContentProvider` de Shizuku (`ShizukuClient$Provider`) está exportado pero protegido con
> `INTERACT_ACROSS_USERS_FULL` (solo el sistema / Shizuku). El enlace `gpmapper://auth` lo puede
> abrir cualquiera, pero la app solo lo acepta si coincide con un inicio de sesión que ella misma
> empezó (state + PKCE).

---

## 4. Clasificación del contenido (cuestionario IARC)

- **Categoría**: *Todos los demás tipos de apps* (utilidad; no es un juego).
- Violencia, miedo, sexualidad, lenguaje soez, sustancias controladas, juegos de azar, humor
  grosero: **No** a todo.
- ¿Los usuarios pueden interactuar o intercambiar contenido? **No dentro de la app** (los perfiles
  de la comunidad son configuraciones de botones moderadas; los comentarios y la publicación están
  en la web). Si el formulario pregunta por contenido generado por usuarios que se descarga:
  «Sí, perfiles de configuración de botones, moderados (reportes y revisión)».
- ¿Comparte la ubicación? **No** · ¿Compras digitales? **No** · ¿Navegador web sin restricciones?
  **No** (solo abre enlaces del proyecto y el inicio de sesión de GitHub en el navegador del sistema).
- Resultado esperado: **PEGI 3 / ESRB Everyone / USK 0**.

## 5. Público objetivo y contenido

- **Edad objetivo**: 13–15, 16–17 y 18+ (no 12 o menos: el inicio de sesión con GitHub exige 13 años).
- ¿Atrae a niños? **No** (sin personajes infantiles; es una utilidad para jugadores).
- **Anuncios**: No contiene anuncios.
- **Acceso a la app**: «Todas las funciones están disponibles sin restricciones de acceso», salvo
  la copia en la nube (opcional), que pide una cuenta de GitHub. Si Play lo pide, crea una cuenta de
  GitHub **de pruebas** (sin datos personales) y da usuario y contraseña en *Acceso a la app*
  (instrucciones: *Ajustes › Copia en la nube › Iniciar sesión con GitHub*). No des tu cuenta real.
- **Funciones financieras**: ninguna · **Salud**: no · **Gobierno**: no · **Noticias**: no.

---

## Cambios pendientes en la privacidad (web)

La política de la web dice hoy «No tiene cuentas» en la sección de la app. Antes de enviar el
formulario de seguridad de los datos, añade (en `PrivacyPage.tsx`, sección «La app de Android»):

- **Copia en la nube (opcional)**: si inicias sesión con GitHub en la app, se guardan tus perfiles
  (privados, solo para ti) junto a tu cuenta; se borran con *Borrar la copia* o con tu cuenta. La
  sesión se guarda cifrada en el teléfono y se borra al cerrar sesión.
- **Mandos de la comunidad** (modo root/Shizuku): la app descarga la lista pública de mandos
  aprobados; no envía nada del tuyo (el identificador del mando se calcula y se busca en el
  teléfono).
