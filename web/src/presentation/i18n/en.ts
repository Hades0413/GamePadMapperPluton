/**
 * Diccionario espanol -> ingles. El texto en espanol es la clave (igual que L_en.java en la app);
 * lo que falte aqui se muestra en espanol. {nombre} se sustituye al mostrar el texto.
 * El panel de moderacion no se traduce.
 */
export const EN: Readonly<Record<string, string>> = {
  // Layout
  'Saltar al contenido': 'Skip to content',
  'Principal': 'Main',
  'Juegos': 'Games',
  'Subir perfil': 'Upload profile',
  'Subir': 'Upload',
  'Idioma': 'Language',
  'Entrar': 'Sign in',
  'Cuenta de {name}': '{name}\'s account',
  'Mis perfiles y cuenta': 'My profiles and account',
  'Mi página pública': 'My public page',
  'Moderación': 'Moderation',
  'Cerrar sesión': 'Sign out',
  'Pie de página': 'Footer',
  'Normas': 'Rules',
  'Privacidad': 'Privacy',
  'Código en GitHub': 'Code on GitHub',
  'Contacto': 'Contact',
  'Hecho por Hades0413. Uso gratuito y no comercial (PolyForm Noncommercial 1.0.0).':
    'Made by Hades0413. Free, non-commercial use (PolyForm Noncommercial 1.0.0).',
  'Los nombres e iconos de los juegos pertenecen a sus respectivos dueños y se muestran solo para identificarlos.':
    'Game names and icons belong to their respective owners and are shown for identification only.',

  // UI y auth
  'Reintentar': 'Retry',
  'Cargar más': 'Load more',
  'Cargando': 'Loading',
  'Iniciar sesión con GitHub': 'Sign in with GitHub',
  'Inicia sesión para continuar': 'Sign in to continue',
  'Solo usamos tu nombre de usuario y tu avatar públicos de GitHub.': 'We only use your public GitHub username and avatar.',
  'Solo para administradores': 'Admins only',
  'Algo salió mal. Inténtalo de nuevo.': 'Something went wrong. Please try again.',
  'Abre esta web directamente': 'Open this site directly',
  'Por seguridad no se puede usar dentro de otra página.': 'For security, this site can\'t be used inside another page.',
  'La web no está configurada': 'The site is not configured',

  // Titulos y descripciones
  'Juega con mando en juegos táctiles': 'Play with a controller in touch games',
  'Convierte los botones de tu mando en toques de pantalla en juegos de Android. Descarga perfiles de la comunidad para tu juego.':
    'Turn your controller buttons into screen taps in Android games. Download community profiles for your game.',
  'Perfiles de mando para juegos de Android subidos por la comunidad.': 'Controller profiles for Android games, uploaded by the community.',
  'Perfiles de mando para {name}.': 'Controller profiles for {name}.',
  'Perfiles de {name}': '{name}\'s profiles',
  'Editar perfil': 'Edit profile',
  'Mi cuenta': 'My account',
  'No encontrado': 'Not found',
  'Normas de la comunidad': 'Community rules',
  'Política de privacidad': 'Privacy policy',

  // Etiquetas (labels.ts)
  'Toque': 'Tap',
  'Toque rápido': 'Quick tap',
  'Ráfaga': 'Burst',
  'Turbo': 'Turbo',
  'Interruptor': 'Toggle',
  'Deslizar': 'Swipe',
  'Macro': 'Macro',
  'Joystick': 'Joystick',
  'Cámara': 'Camera',
  'Cruceta ↑': 'D-pad ↑',
  'Cruceta ↓': 'D-pad ↓',
  'Cruceta ←': 'D-pad ←',
  'Cruceta →': 'D-pad →',
  'Stick izq.': 'Left stick',
  'Stick der.': 'Right stick',
  'Eje {n}': 'Axis {n}',
  'Botón {n}': 'Button {n}',
  'Spam o publicidad': 'Spam or ads',
  'No funciona / está mal hecho': 'Doesn\'t work / badly made',
  'Contenido ofensivo': 'Offensive content',
  'Copiado sin permiso': 'Copied without permission',
  'Otro motivo': 'Other reason',

  // Fechas
  'ahora': 'now',

  // Tabla de botones
  'Botón': 'Button',
  'Acción': 'Action',
  'Detalle': 'Details',
  '{count} toques cada {gap} ms': '{count} taps every {gap} ms',
  '{rate} toques/s': '{rate} taps/s',
  '{n} pasos': '{n} steps',
  'también con la cruceta': 'also with the D-pad',
  'sensibilidad {n}': 'sensitivity {n}',

  // Tarjetas
  '1 perfil': '1 profile',
  '{n} perfiles': '{n} profiles',
  '{n} me gusta': '{n} likes',
  '{n} instalaciones desde la app': '{n} installs from the app',
  '{yes} sí · {no} no': '{yes} yes · {no} no',
  '{n} % dice que funciona': '{n}% say it works',
  '{n} botones': '{n} buttons',
  'Encaja con tu pantalla': 'Fits your screen',
  'Oculto': 'Hidden',

  // Me gusta
  'Inicia sesión con GitHub para dar «me gusta».': 'Sign in with GitHub to like profiles.',

  // Vista previa
  'Vista previa': 'Preview',
  'Pantalla': 'Screen',
  'En tu pantalla': 'On your screen',
  'Original': 'Original',
  'Fondo': 'Background',
  'Sobre el juego': 'Over the game',
  'Esquema': 'Outline',
  'Morado: botones · Amarillo: capas (mantener otro botón) · Turquesa: joystick, cámara y deslizar.':
    'Purple: buttons · Yellow: layers (hold another button) · Teal: joystick, camera and swipe.',
  'Adaptado a tu pantalla ({ratio}): los botones se mueven con los bordes, como en el juego.':
    'Adapted to your screen ({ratio}): buttons move with the edges, just like in the game.',
  'Hecho en una pantalla {ratio}.': 'Made on a {ratio} screen.',
  'La captura del juego es orientativa.': 'The game screenshot is for reference only.',
  'Distribución de {n} botones en una pantalla de {w}×{h}': 'Layout of {n} buttons on a {w}×{h} screen',

  // Acciones del perfil
  'Abrir en la app': 'Open in the app',
  'Enviar a la app': 'Send to the app',
  'Descargar .conf': 'Download .conf',
  'Copiar': 'Copy',
  '¡Copiado!': 'Copied!',

  // Filtros
  'Más gustados': 'Most liked',
  'Más instalados': 'Most installed',
  'Mejor valorados': 'Top rated',
  'Más recientes': 'Newest',
  'Buscar en títulos y descripciones…': 'Search titles and descriptions…',
  'Buscar perfil': 'Search profiles',
  'Ordenar': 'Sort by',
  'Marca': 'Brand',
  'Todas las marcas': 'All brands',
  'Sin marcas aún': 'No brands yet',
  'Modelo': 'Model',
  'Todos los modelos': 'All models',
  'Sin modelos aún': 'No models yet',
  'Encajan con mi pantalla ({ratio})': 'Fit my screen ({ratio})',
  'Quitar filtros': 'Clear filters',

  // Reportes
  'Reportar': 'Report',
  'Reportar este perfil': 'Report this profile',
  'Para evitar reportes falsos, hace falta iniciar sesión con GitHub.': 'To prevent false reports, you need to sign in with GitHub.',
  'Gracias. Lo revisaremos; con varios reportes el perfil se oculta automáticamente.':
    'Thanks, we\'ll review it. After several reports a profile is hidden automatically.',
  'Cerrar': 'Close',
  'Motivo': 'Reason',
  'Detalles (opcional)': 'Details (optional)',
  'Cancelar': 'Cancel',
  'Enviar reporte': 'Send report',

  // Formulario
  'Pega el perfil o carga el archivo .conf.': 'Paste the profile or load the .conf file.',
  'Perfil (.conf)': 'Profile (.conf)',
  'En la app: Biblioteca › tu perfil › Compartir, y pégalo aquí. O carga el archivo.':
    'In the app: Library › your profile › Share, then paste it here. Or load the file.',
  'Cargar archivo .conf': 'Load .conf file',
  'Paquete del juego': 'Game package',
  'No se puede cambiar.': 'It can\'t be changed.',
  'Se rellena solo con la línea «package» del perfil.': 'Filled in automatically from the profile\'s "package" line.',
  'Con icono y captura del juego': 'Has the game icon and screenshot',
  'Le falta el icono y la captura': 'Missing the icon and screenshot',
  'Le falta el icono': 'Missing the icon',
  'Le falta la captura': 'Missing the screenshot',
  'Traer imágenes de Google Play': 'Fetch images from Google Play',
  'Nombre del juego': 'Game name',
  'Es el primer perfil de este juego: escribe su nombre tal como aparece en Google Play. Al publicarlo traeremos su icono y una captura de Google Play.':
    'This is the first profile for this game: type its name as it appears on Google Play. When you publish, we\'ll fetch its icon and a screenshot from Google Play.',
  'Título': 'Title',
  'Ej.: Competitivo con cruceta': 'E.g. Competitive with D-pad',
  'Descripción (opcional)': 'Description (optional)',
  'Qué mando usas, qué hace cada botón, para qué modo de juego…': 'Which controller you use, what each button does, which game mode it\'s for…',
  'Modelo del teléfono (opcional)': 'Phone model (optional)',
  'Ayuda a quien tenga el mismo móvil a encontrar tu perfil. Pantalla del perfil: {w}×{h} ({ratio}).':
    'Helps people with the same phone find your profile. Profile screen: {w}×{h} ({ratio}).',
  'Ayuda a quien tenga el mismo móvil a encontrar tu perfil.': 'Helps people with the same phone find your profile.',
  'Ej.: Redmi Note 9': 'E.g. Redmi Note 9',
  'Publicar perfil': 'Publish profile',
  'Guardar cambios': 'Save changes',
  'Al publicar aceptas las normas de la comunidad. El perfil será público con tu usuario de GitHub.':
    'By publishing you accept the community rules. The profile will be public under your GitHub username.',
  'pantalla {w}×{h}': 'screen {w}×{h}',
  'Aquí verás dónde toca cada botón cuando el perfil sea válido.': 'Once the profile is valid, you\'ll see here where each button taps.',

  // Portada
  'Gratis · Sin anuncios · Código abierto': 'Free · No ads · Open source',
  'Juega con': 'Play with a',
  'mando': 'controller',
  'en juegos que solo tienen controles táctiles': 'in games that only have touch controls',
  'Gamepad Mapper Plutón convierte los botones y sticks de tu mando en toques de pantalla en Android.':
    'Gamepad Mapper Plutón turns your controller buttons and sticks into screen taps on Android.',
  'Descargar en Google Play': 'Get it on Google Play',
  'Ver perfiles de juegos': 'Browse game profiles',
  'Todo lo que necesitas': 'Everything you need',
  'Sin root ni PC': 'No root, no PC',
  'Funciona con el servicio de accesibilidad de Android. Root y Shizuku son mejoras opcionales.':
    'Works through Android\'s accessibility service. Root and Shizuku are optional upgrades.',
  'Cualquier mando': 'Any controller',
  'Bluetooth o USB: Xbox, PlayStation, genéricos… Varios mandos a la vez.': 'Bluetooth or USB: Xbox, PlayStation, generic… Several controllers at once.',
  'Editor en el juego': 'In-game editor',
  'Una burbuja flotante para colocar cada botón encima del juego, sin salir de él.':
    'A floating bubble to place each button on top of the game, without leaving it.',
  'Joystick y cámara': 'Joystick and camera',
  'Stick izquierdo como joystick (con cruceta) y stick derecho como cámara con curva y zona muerta.':
    'Left stick as a joystick (with D-pad) and right stick as a camera with curve and dead zone.',
  'Macros y turbo': 'Macros and turbo',
  'Toque rápido, ráfagas, turbo, interruptor, deslizar y macros con tiempos.': 'Quick tap, bursts, turbo, toggle, swipe and timed macros.',
  'Perfiles de la comunidad': 'Community profiles',
  'Descarga la configuración que otros jugadores ya ajustaron para tu juego.': 'Download the setup other players have already tuned for your game.',
  'Cómo funciona': 'How it works',
  'Instala la app': 'Install the app',
  'Desde Google Play y activa el servicio de accesibilidad (la app te guía).': 'From Google Play, then turn on the accessibility service (the app guides you).',
  'Elige un perfil': 'Pick a profile',
  'Busca tu juego aquí y pulsa «Enviar a la app», o crea el tuyo con la burbuja.':
    'Find your game here and tap "Send to the app", or create your own with the bubble.',
  'Juega con mando': 'Play with a controller',
  'Abre el juego: los botones del mando tocan la pantalla por ti.': 'Open the game: your controller buttons tap the screen for you.',
  'Juegos con más perfiles': 'Games with the most profiles',
  'Ver todos →': 'See all →',
  'Todavía no hay perfiles. ¡Sé el primero en subir uno!': 'No profiles yet. Be the first to upload one!',

  // Juegos
  'Elige tu juego para ver los perfiles que ha subido la comunidad.': 'Pick your game to see the profiles the community has uploaded.',
  'Subir un perfil': 'Upload a profile',
  'Buscar juego…': 'Search games…',
  'Buscar juego': 'Search games',
  'No hay juegos con ese nombre': 'No games with that name',
  'Todavía no hay perfiles': 'No profiles yet',
  '¿No está tu juego? Crea el perfil con la burbuja de la app y súbelo.': 'Don\'t see your game? Create the profile with the app\'s bubble and upload it.',
  'Subir mi perfil': 'Upload my profile',
  'Ningún perfil coincide con esos filtros': 'No profiles match those filters',
  'Aún no hay perfiles para este juego': 'No profiles for this game yet',
  'Subir el primero': 'Upload the first one',

  // Perfil
  'Borrar': 'Delete',
  '¿Borrar este perfil?': 'Delete this profile?',
  'Se borra para siempre, con sus «me gusta». No se puede deshacer.': 'It\'s deleted forever, along with its likes. This can\'t be undone.',
  'Ruta': 'Breadcrumb',
  'Volver a la app': 'Back to the app',
  '¡Perfil publicado!': 'Profile published!',
  'Cambios publicados.': 'Changes published.',
  'Vuelve a la app para que recuerde este perfil y puedas actualizarlo desde allí.':
    'Go back to the app so it remembers this profile and you can update it from there.',
  'Este perfil está oculto: solo lo ves tú. Puede deberse a reportes de otros usuarios.':
    'This profile is hidden: only you can see it. It may be due to reports from other users.',
  'Publicado el {date}': 'Published on {date}',
  'actualizado el {date}': 'updated on {date}',
  '«Abrir en la app» muestra el perfil en Gamepad Mapper Plutón para instalarlo; «Enviar a la app» lo comparte por el menú de Android.':
    '"Open in the app" shows the profile in Gamepad Mapper Plutón so you can install it; "Send to the app" shares it through the Android share menu.',
  'Abre esta página en tu teléfono Android para enviarlo directamente a la app.': 'Open this page on your Android phone to send it straight to the app.',
  'Las posiciones se adaptan solas a la resolución de tu pantalla.': 'Positions adapt automatically to your screen resolution.',
  'Botones ({n})': 'Buttons ({n})',
  'No se pudo dibujar la vista previa de este perfil.': 'Couldn\'t draw the preview for this profile.',
  'Ver el archivo .conf': 'View the .conf file',
  'Editar': 'Edit',
  '1 instalación desde la app': '1 install from the app',
  '<b>{share} %</b> dice que le funciona ({votes} votos)': '<b>{share}%</b> say it works for them ({votes} votes)',
  '1 voto sobre si funciona (pocos aún)': '1 vote on whether it works (too few so far)',
  '{n} votos sobre si funciona (pocos aún)': '{n} votes on whether it works (too few so far)',

  // Autor
  '{n} perfiles publicados': '{n} profiles published',
  'Ver en GitHub': 'View on GitHub',
  'Todavía no ha publicado perfiles': 'Hasn\'t published any profiles yet',

  // Subir / editar
  'Comparte la configuración de tu juego para que otros la usen.': 'Share your game setup so others can use it.',
  'Este formulario se rellenó con un perfil que venía en el enlace. Publícalo solo si lo has creado tú (por ejemplo, desde «Subir a la comunidad» de la app) y revisa la vista previa.':
    'This form was filled in with a profile that came in the link. Only publish it if you made it yourself (for example, with "Upload to community" in the app) and check the preview.',
  'Para subir un perfil y que aparezca tu nombre, inicia sesión con GitHub.': 'To upload a profile under your name, sign in with GitHub.',
  'Inicia sesión para editar tus perfiles.': 'Sign in to edit your profiles.',
  'Solo el autor puede editar este perfil': 'Only the author can edit this profile',
  'Se ha cargado la versión de tu teléfono. Revisa la vista previa y guarda para publicar los cambios.':
    'The version from your phone has been loaded. Check the preview and save to publish the changes.',
  'El perfil que envió la app es de otro juego: se muestra la versión publicada.':
    'The profile the app sent is for a different game: the published version is shown.',

  // Cuenta
  'Borrar mi cuenta': 'Delete my account',
  'Borra tu cuenta, todos tus perfiles, tus «me gusta» y tus reportes. No se puede deshacer.':
    'Deletes your account, all your profiles, your likes and your reports. This can\'t be undone.',
  '¿Borrar tu cuenta para siempre?': 'Delete your account forever?',
  'Escribe <b>{name}</b> para confirmar.': 'Type <b>{name}</b> to confirm.',
  'Nombre de usuario': 'Username',
  'Borrar todo': 'Delete everything',
  'Aún no has subido perfiles': 'You haven\'t uploaded any profiles yet',
  'Subir mi primer perfil': 'Upload my first profile',
  'Inicia sesión para ver tus perfiles.': 'Sign in to see your profiles.',
  'Sesión iniciada con GitHub': 'Signed in with GitHub',
  'Mis perfiles': 'My profiles',
  'Subir otro': 'Upload another',

  // No encontrado y errores
  'No encontramos esta página': 'We couldn\'t find this page',
  'Ver juegos': 'Browse games',
  'Puede que el enlace esté mal o que se haya borrado.': 'The link may be wrong, or the page may have been deleted.',
  'Hay una versión nueva de la web': 'There\'s a new version of the site',
  'Algo salió mal': 'Something went wrong',
  'Recargar': 'Reload',
  'Recarga la página para usarla.': 'Reload the page to keep using it.',
  'Recarga la página. Si sigue pasando, avísanos en GitHub.': 'Reload the page. If it keeps happening, let us know on GitHub.',

  // Normas
  'Para que el catálogo sea útil para todos, al publicar un perfil te comprometes a:':
    'To keep the catalog useful for everyone, by publishing a profile you agree to:',
  'Subir perfiles que <b>funcionen</b> y que hayas probado en el juego.': 'Upload profiles that <b>work</b> and that you\'ve tested in the game.',
  'Usar títulos y descripciones <b>claros y respetuosos</b>: nada ofensivo, sexual, violento ni discriminatorio.':
    'Use <b>clear, respectful</b> titles and descriptions: nothing offensive, sexual, violent or discriminatory.',
  'No hacer <b>spam</b>: ni publicidad, ni enlaces, ni el mismo perfil muchas veces.': 'No <b>spam</b>: no ads, no links, and no posting the same profile many times.',
  'No subir como tuyo el trabajo de otra persona sin su permiso.': 'Don\'t upload someone else\'s work as your own without their permission.',
  'No usar los perfiles para hacer trampas que el juego prohíba.': 'Don\'t use profiles to cheat in ways the game forbids.',
  'Cualquier usuario con sesión puede <b>reportar</b> un perfil.': 'Any signed-in user can <b>report</b> a profile.',
  'Un perfil con <b>3 reportes se oculta automáticamente</b> hasta que lo revisa la moderación.':
    'A profile with <b>3 reports is hidden automatically</b> until moderators review it.',
  'La moderación puede ocultar o borrar perfiles y <b>bloquear</b> cuentas que incumplan estas normas.':
    'Moderators can hide or delete profiles and <b>block</b> accounts that break these rules.',
  'Para evitar abusos hay límites: 10 perfiles nuevos al día y 100 en total por cuenta.': 'To prevent abuse there are limits: 10 new profiles per day and 100 in total per account.',
  'Licencia de los perfiles': 'Profile license',
  'Al publicar un perfil permites que cualquiera lo descargue, lo use y lo modifique gratis dentro de la app. La app es de uso gratuito y no comercial (PolyForm Noncommercial 1.0.0).':
    'By publishing a profile you allow anyone to download, use and modify it for free inside the app. The app is free for non-commercial use (PolyForm Noncommercial 1.0.0).',

  // Privacidad
  'Última actualización: 13 de noviembre de 2026.': 'Last updated: November 13, 2026.',
  'Esta política cubre la app <b>Gamepad Mapper Plutón</b> para Android (<c>com.gamepadmapper.app</c>) y esta web. Las dos son un proyecto personal de Hades0413, gratuito y sin anuncios.':
    'This policy covers the <b>Gamepad Mapper Plutón</b> Android app (<c>com.gamepadmapper.app</c>) and this website. Both are a personal project by Hades0413, free and ad-free.',
  'La app de Android': 'The Android app',
  '<b>No recoge ni envía datos personales.</b> No tiene cuentas, anuncios ni analíticas.': '<b>It doesn\'t collect or send personal data.</b> No accounts, ads or analytics.',
  'El <b>servicio de accesibilidad</b> se usa solo para leer los botones del mando y tocar la pantalla donde tú configuras. Lo que ocurre en la pantalla y lo que pulsas no se guarda ni se envía a ningún sitio.':
    'The <b>accessibility service</b> is used only to read your controller buttons and tap the screen where you set it up. What happens on screen and what you press is never stored or sent anywhere.',
  'Tus perfiles se guardan solo en tu teléfono, en la carpeta de la app.': 'Your profiles are stored only on your phone, in the app\'s folder.',
  'La app se conecta a internet solo para <b>descargar el catálogo de perfiles</b> (con los iconos y capturas de los juegos) y para <b>comprobar si hay versiones nuevas</b> en GitHub (esto último se puede desactivar en Ajustes). Esas peticiones no llevan datos tuyos.':
    'The app connects to the internet only to <b>download the profile catalog</b> (with game icons and screenshots) and to <b>check for new versions</b> on GitHub (you can turn the latter off in Settings). Those requests carry none of your data.',
  'Esta web': 'This website',
  'Para <b>ver y descargar perfiles</b> no hace falta cuenta y no guardamos nada sobre ti.': 'To <b>browse and download profiles</b> you don\'t need an account, and we store nothing about you.',
  'Solo si <b>inicias sesión con GitHub</b> (para subir perfiles, dar «me gusta» o reportar), guardamos tu <b>identificador, nombre de usuario y avatar públicos de GitHub</b>, y el correo que GitHub comparte al iniciar sesión. El correo no se muestra a nadie ni se usa para escribirte.':
    'Only if you <b>sign in with GitHub</b> (to upload profiles, like or report), we store your <b>public GitHub ID, username and avatar</b>, and the email GitHub shares when you sign in. The email is never shown to anyone or used to contact you.',
  'Lo que publicas (perfiles, título, descripción y, si lo indicas, el modelo de tu teléfono) es <b>público</b> junto con tu nombre de usuario. El modelo es opcional y no te identifica.':
    'What you publish (profiles, title, description and, if you add it, your phone model) is <b>public</b> along with your username. The model is optional and doesn\'t identify you.',
  'Los iconos y capturas de los juegos se toman de la ficha pública de cada juego en Google Play (o los sube la moderación) y se guardan en nuestros servidores: la web y la app no cargan imágenes de otros sitios. Los usuarios no suben imágenes.':
    'Game icons and screenshots are taken from each game\'s public Google Play page (or uploaded by moderators) and stored on our servers: the website and the app don\'t load images from other sites. Users don\'t upload images.',
  'Guardamos qué perfiles te gustan y los reportes que haces (estos solo los ve la moderación).': 'We store which profiles you like and the reports you make (only moderators can see these).',
  'La sesión se guarda en el almacenamiento local de tu navegador. No usamos cookies de seguimiento, publicidad ni analíticas.':
    'Your session is kept in your browser\'s local storage. We use no tracking cookies, advertising or analytics.',
  'El idioma que eliges (ES/EN) se guarda en el almacenamiento local de tu navegador.': 'The language you choose (ES/EN) is kept in your browser\'s local storage.',
  'Servicios que usamos': 'Services we use',
  '<b>Supabase</b>: base de datos, inicio de sesión e imágenes de los juegos.': '<b>Supabase</b>: database, sign-in and game images.',
  '<b>GitHub</b>: inicio de sesión y alojamiento de esta web (GitHub Pages) y del código.': '<b>GitHub</b>: sign-in, and hosting for this website (GitHub Pages) and the code.',
  '<b>Google Play</b>: distribución de la app.': '<b>Google Play</b>: app distribution.',
  'Cada uno trata los datos técnicos de conexión (como la dirección IP) según su propia política.': 'Each one handles technical connection data (such as your IP address) under its own policy.',
  'Tus derechos y cómo borrar tus datos': 'Your rights and how to delete your data',
  'Puedes borrar tu cuenta y <b>todos</b> tus datos en cualquier momento desde {account}. Se borra al instante. También puedes borrar perfiles sueltos. Para cualquier otra petición, escríbenos en {github}.':
    'You can delete your account and <b>all</b> your data at any time from {account}. It\'s deleted instantly. You can also delete individual profiles. For any other request, write to us on {github}.',
  'Mi cuenta › Borrar mi cuenta': 'My account › Delete my account',
  'Menores': 'Minors',
  'La web no está dirigida a menores de 13 años. Para iniciar sesión hace falta una cuenta de GitHub, que exige esa edad mínima.':
    'This website is not aimed at children under 13. Signing in requires a GitHub account, which has that minimum age.',
  'Cambios': 'Changes',
  'Si cambia esta política, actualizaremos la fecha de arriba.': 'If this policy changes, we\'ll update the date above.',
  'Editar etiquetas': 'Edit tags',
  'Añadir etiquetas': 'Add tags',
  'Etiquetas del perfil': 'Profile tags',
  'Ayudan a otros a encontrarlo. Elige hasta {n}.': 'They help others find it. Pick up to {n}.',
  'Guardar': 'Save',
  'Quitar de destacados': 'Remove from featured',
  'Destacar': 'Feature',
  'Historial de versiones': 'Version history',
  'Cargando…': 'Loading…',
  'Sin versiones guardadas.': 'No saved versions.',
  'actual': 'current',
  'Descargar esta versión': 'Download this version',
  'Comentarios': 'Comments',
  '¿Te funcionó? ¿Algún consejo para este perfil?': 'Did it work for you? Any tips for this profile?',
  'Comentario': 'Comment',
  'Comentar': 'Comment',
  'Inicia sesión para comentar.': 'Sign in to comment.',
  'Aún no hay comentarios.': 'No comments yet.',
  'Usuario': 'User',
  'Destacado': 'Featured',
  'Últimamente no funciona': 'Lately not working',
  'Etiqueta': 'Tag',
  'Todas las etiquetas': 'All tags',
  'Tecla {n}': 'Key {n}',
  'Ratón {n}': 'Mouse {n}',
  'Perfiles destacados': 'Featured profiles',
  'Al <b>instalar un perfil de la comunidad</b> o responder <b>«¿Te funcionó?»</b>, la app envía el perfil, tu respuesta y un <b>número de instalación aleatorio</b> que crea la propia app (no identifica tu teléfono ni a ti). Sirve solo para contar instalaciones y votos, una vez por instalación.': 'When you <b>install a community profile</b> or answer <b>“Did it work?”</b>, the app sends the profile, your answer and a <b>random install number</b> created by the app itself (it doesn\'t identify your phone or you). It\'s only used to count installs and votes, once per install.',
  'El <b>giroscopio, el teclado y el ratón</b> se leen solo para mover la cámara o tocar donde configuras; no se guardan ni se envían.': 'The <b>gyroscope, keyboard and mouse</b> are only read to move the camera or touch where you set; nothing is stored or sent.',
  '<b>«Enviar diagnóstico»</b> (opcional): la app te enseña el informe completo antes de enviarlo (versión, Android, modelo, mandos conectados y las últimas líneas del registro, sin datos personales). Solo lo lee el autor y se borra a los 30 días.': '<b>“Send diagnostics”</b> (optional): the app shows you the full report before sending it (version, Android, model, connected gamepads and the last lines of the log, no personal data). Only the author reads it and it\'s deleted after 30 days.',
  'Los <b>comentarios</b> que escribes son públicos, con tu nombre de GitHub. Puedes borrarlos cuando quieras (y también el autor del perfil y la moderación). Se borran con tu cuenta.': 'The <b>comments</b> you write are public, with your GitHub name. You can delete them anytime (so can the profile\'s author and the moderators). They\'re deleted with your account.',
  'Últimamente varios jugadores dicen que este perfil no les funciona (quizá el juego cambió sus controles).': 'Lately several players say this profile doesn\'t work for them (maybe the game changed its controls).',
  'Revisa las posiciones y actualízalo.': 'Check the positions and update it.',
  'Mira otros perfiles del juego o los comentarios.': 'Check other profiles for this game or the comments.',
  'En los <b>comentarios</b>: ayuda o da tu opinión sobre el perfil; nada de insultos, spam ni datos personales.': 'In <b>comments</b>: help out or share your opinion about the profile; no insults, spam or personal data.',
  'Para evitar abusos hay límites: 10 perfiles nuevos al día y 100 en total por cuenta, y 30 comentarios al día.': 'To prevent abuse there are limits: 10 new profiles per day and 100 in total per account, and 30 comments per day.',
  'El autor de un perfil puede borrar los comentarios de su perfil; la moderación, cualquiera.': 'A profile\'s author can delete comments on their profile; moderators can delete any.',
  'Competitivo': 'Competitive',
  'Casual': 'Casual',
  'Para zurdos': 'Left-handed',
  'Una mano': 'One hand',
  'Sin gatillos': 'No triggers',
  'Tablet': 'Tablet',
  'Giroscopio': 'Gyroscope',
  'Teclado y ratón': 'Keyboard & mouse',
  'Mando Xbox': 'Xbox controller',
  'Mando PlayStation': 'PlayStation controller',
  'Clic izquierdo': 'Left click',
  'Clic derecho': 'Right click',
  'Clic de la rueda': 'Middle click',
  'Rueda ↑': 'Wheel ↑',
  'Rueda ↓': 'Wheel ↓',
};
