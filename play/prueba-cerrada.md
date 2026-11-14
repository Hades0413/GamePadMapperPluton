# Prueba cerrada y paso a producción (cuenta personal de desarrollador)

Las cuentas **personales** creadas después del 13/11/2023 no pueden publicar en producción hasta
hacer una **prueba cerrada con al menos 12 testers que tengan la prueba aceptada (opt-in) durante
14 días seguidos**. Solo entonces aparece *Solicitar acceso a producción*. Si un tester sale de la
prueba, deja de contar: conviene reclutar **15–20** para tener margen.

Fuentes: Ayuda de Play Console, «Requisitos de prueba para cuentas de desarrollador personales
nuevas» (revisa la cifra vigente antes de empezar: en 2023 eran 20 testers; desde diciembre de 2024
son 12).

## Calendario

| Día | Qué |
|---|---|
| D-3 | Ficha, cuestionarios y AAB listos (ver checklist). Lista de testers (correos de Google). |
| D0 | Publicar la versión en **Prueba cerrada** y enviar el mensaje de reclutamiento. |
| D0–D2 | Perseguir los opt-in hasta tener **≥ 12** (mejor 15+) en *Testers › Recuento*. |
| D0–D14 | Una actualización a mitad (D7 aprox.) con lo que digan los testers: Google valora que haya actividad. Recoger comentarios. |
| D14+ | Con ≥ 12 testers **14 días seguidos**: *Panel › Solicitar acceso a producción* (respuestas abajo). |
| D14 + ~7 | Respuesta de Google (suele tardar ≤ 7 días). Luego, versión en Producción (revisión normal). |

## Checklist en Play Console (paso a paso)

1. **Crear la app**: *Todas las apps › Crear app* · nombre `Gamepad Mapper Plutón` · idioma
   predeterminado Español (España) · App · Gratis · aceptar declaraciones.
2. **Configurar la app** (*Panel › Configurar la app*), con las respuestas de
   [`politicas.md`](politicas.md):
   - Acceso a la app (todo accesible sin cuenta; la copia en la nube es opcional).
   - Anuncios: **No**.
   - Clasificación del contenido (cuestionario IARC).
   - Público objetivo: 13+ (no dirigida a niños).
   - App de noticias: No · Apps gubernamentales: No · Funciones financieras: Ninguna · Salud: No.
   - Seguridad de los datos (formulario).
   - **Política de privacidad**: `https://hades0413.github.io/GamePadMapperPluton/privacidad`
     (actualízala antes con la copia en la nube y los mandos de la comunidad: ver `README.md`).
   - **Permisos y API sensibles** (*Contenido de la app*): declaración de la **API de
     Accesibilidad** (texto y vídeo) y **servicio en primer plano** `specialUse`.
3. **Ficha de la tienda** (*Crecer › Presencia en la tienda › Ficha principal*):
   textos de [`ficha-es.md`](ficha-es.md) y traducción inglesa de [`ficha-en.md`](ficha-en.md)
   (*Gestionar traducciones › Añadir › English (United States)*). Gráficos:
   - Icono 512×512 y gráfico de funciones 1024×500 (`../../play-store-recursos/`).
   - Capturas de teléfono: `play/capturas/es` y `play/capturas/en` (mín. 2, máx. 8). Ya vienen
     a 1080×2160 y 2160×1080: Play exige proporción ≤ 2:1 y una captura de 1080×2400 (2,22:1) se
     rechaza; `capturas.sh` recorta la barra de estado y el borde de gestos.
   - Categoría: **Herramientas** (o Personalización). Etiquetas: mando, gamepad, controles.
   - Correo de contacto (obligatorio) y web: `https://hades0413.github.io/GamePadMapperPluton`.
4. **Firma de apps de Play**: al subir el primer AAB, acepta *Firma de apps de Google Play* (la
   clave de `gamepad-mapper-CLAVE-FIRMA-PRIVADA` queda como **clave de subida**; guárdala).
5. **Versión de prueba cerrada**: *Probar y publicar › Pruebas › Prueba cerrada › Crear canal*
   (o usa «Alfa») → *Testers*: crea una **lista de correos** (los de la hoja de testers) o un
   **Grupo de Google** → guarda → copia el **enlace de participación** (opt-in).
6. *Crear versión* → sube `dist/GamepadMapper-<versión>.aab` (`make aab`; sube antes la versión
   con `make bump V=1.7` si este AAB lleva cambios respecto al ya subido: el versionCode debe
   crecer; el AAB ya incluye el mapping de R8, guarda también `dist/GamepadMapper-<versión>-mapping.txt`) → notas de [`ficha-*.md`](ficha-es.md) (*Novedades*) → *Revisar* → *Publicar en
   prueba cerrada*. La primera revisión puede tardar unos días.
7. **Países**: en el canal de prueba cerrada, *Países/regiones* → todos los de tus testers.
8. Envía el **mensaje de reclutamiento** (abajo) con el enlace de participación y apunta a cada
   tester en la hoja ([`testers.csv`](testers.csv)).
9. Comprueba cada día *Prueba cerrada › Testers*: «X testers aceptaron». No quites testers
   durante los 14 días; si alguno sale, recluta otro enseguida (el contador de 14 días exige
   ≥ 12 **seguidos**).
10. A mitad de prueba, publica una actualización con lo aprendido (sube el versionCode).
11. Día 14+: *Panel › Solicitar acceso a producción* → respuestas de abajo.
12. Aprobado: *Producción › Crear versión* (puedes promocionar la de la prueba cerrada) →
    lanzamiento por fases (20 % → 100 %).

## Mensaje para reclutar testers

### Español

> **¿Me ayudas a publicar Gamepad Mapper Plutón en Google Play? 🎮**
>
> Es una app gratuita que convierte los botones de un mando (Bluetooth o USB) en toques de pantalla
> para jugar con mando a juegos que solo tienen controles táctiles. Sin anuncios ni datos personales.
>
> Google me pide que **12 personas la prueben durante 14 días** antes de publicarla. Solo tienes que:
> 1. Abrir este enlace **con la cuenta de Google de tu Play Store** y tocar *Convertirse en tester*:
>    **{ENLACE_DE_PARTICIPACION}**
> 2. Instalar la app desde el enlace de Google Play que aparece después.
> 3. **No desinstalarla durante 14 días** (no hace falta usarla a diario; si la abres de vez en
>    cuando y me cuentas qué tal, mejor).
>
> No hace falta tener mando. Si algo falla: *Ajustes › Enviar diagnóstico* en la app, o
> escríbeme. ¡Gracias!

### English

> **Can you help me publish Gamepad Mapper Plutón on Google Play? 🎮**
>
> It's a free app that turns the buttons of a gamepad (Bluetooth or USB) into screen touches, so you
> can play touch-only games with a gamepad. No ads and no personal data.
>
> Google requires **12 people to test it for 14 days** before it can be published. All you need to do:
> 1. Open this link **with the Google account you use on the Play Store** and tap *Become a tester*:
>    **{OPT_IN_LINK}**
> 2. Install the app from the Google Play link shown afterwards.
> 3. **Keep it installed for 14 days** (no need to use it daily; opening it now and then and telling
>    me how it went is even better).
>
> You don't need a gamepad. If something fails: *Settings › Send diagnostics* in the app, or message
> me. Thanks!

## Hoja de seguimiento

[`testers.csv`](testers.csv) (ábrela con una hoja de cálculo). Una fila por tester; marca el día
del opt-in y revisa cada pocos días que siga dentro. No subas la hoja con correos reales al
repositorio (es pública): guarda tu copia fuera, por ejemplo junto a la clave de firma.

## Respuestas para «Solicitar acceso a producción»

El formulario cambia con el tiempo; estas son las preguntas habituales y qué contestar (adáptalo a
lo que haya pasado de verdad en tu prueba).

**Sobre la prueba cerrada**

- *¿Fue fácil reclutar testers?* — «Bastante fácil: amigos, familia y jugadores de la comunidad del
  proyecto (web y GitHub). Recluté N y se mantuvieron ≥ 12 durante los 14 días.»
- *¿Cómo describirías la participación de los testers?* — «Usaron la app con mandos Bluetooth y
  USB de varias marcas, instalaron perfiles de la comunidad y crearon los suyos. Recibí N comentarios
  y N diagnósticos enviados desde la app.»
- *Resume los comentarios recibidos* — ejemplos reales: mandos genéricos que mandaban botones con
  nombres raros, dudas al activar la Accesibilidad («Ajuste restringido»), petición de copia en la
  nube, ajustes de sensibilidad de la cámara.

**Sobre la app**

- *Público objetivo* — «Jugadores de Android que quieren usar un mando físico en juegos que solo
  tienen controles táctiles, incluidas personas a las que les cuesta usar la pantalla táctil.»
- *¿Qué la hace distinta / qué valor aporta?* — «Funciona sin root ni PC con cualquier mando,
  perfiles por juego con burbuja dentro del juego, detección de los botones del juego y perfiles
  de la comunidad. Gratuita, sin anuncios ni analíticas, con el código a la vista.»
- *Instalaciones esperadas el primer año* — una estimación honesta (p. ej. 1.000–10.000).

**Preparación para producción**

- *¿Qué cambiaste a partir de la prueba?* — lista de cambios de la versión de mitad de prueba
  (p. ej. mandos genéricos reconocidos, textos de la guía de Accesibilidad, correcciones).
- *¿Cómo decidiste que está lista?* — «Pruebas automáticas (formato de perfil, motor con guiones
  de eventos, base de datos y recorrido en emulador en cada cambio), 14 días de prueba cerrada sin
  cierres inesperados en Android vitals y los comentarios de los testers resueltos.»
