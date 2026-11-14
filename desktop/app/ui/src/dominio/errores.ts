/**
 * Mensajes de error del nucleo en Rust (`#[error(...)]` de servicio.rs, dispositivos/mod.rs,
 * salida/mod.rs, mapeo/validar.rs, juegos.rs, opciones.rs). La interfaz los traduce con t(); el
 * backend simulado usa los mismos. Una prueba en Rust comprueba que estan todos.
 */
export const ERROR = {
  noConectado: 'El mando ya no está conectado.',
  sinVibracion: 'Este mando no tiene vibración.',
  sinAlmacen: 'No hay carpeta de configuración donde guardar.',
  sinAsistente: 'El asistente no está en marcha para este mando.',
  asistenteSinTerminar: 'El asistente aún no ha terminado.',
  sinGrabacion: 'No se está grabando ninguna macro en este mando.',
  // Mandos virtuales (nucleo/src/salida)
  sinUinput: 'Sin permiso para crear mandos virtuales: hace falta acceso a /dev/uinput (grupo «input»).',
  sinVigem: 'ViGEmBus no está instalado: hace falta para crear mandos virtuales en Windows.',
  sinClienteVigem: 'Falta ViGEmClient.dll (el cliente de ViGEmBus) junto a la app.',
  salidaNoDisponible: 'Este tipo de mando virtual no está disponible en este sistema.',
  // Validacion de configuraciones (nucleo/src/mapeo/validar.rs)
  validacionGuid: 'La configuración no es válida: GUID incorrecto.',
  validacionNombre: 'La configuración no es válida: un nombre es demasiado largo o tiene caracteres de control.',
  validacionIndice: 'La configuración no es válida: hay una entrada fuera de rango.',
  validacionDemasiadas: 'La configuración tiene demasiadas acciones, capas o macros.',
  validacionMacro: 'Una macro no es válida: como mucho 64 pasos y 10 s por paso.',
  validacionMacroInexistente: 'Una acción usa una macro que no existe.',
  validacionTecla: 'Una acción usa una tecla desconocida.',
  validacionCapa: 'Una capa no es válida: modificador repetido o usado dentro de la propia capa.',
  validacionVersion: 'La configuración es de una versión más nueva: actualiza la app.',
  validacionGrande: 'La configuración es demasiado grande (máximo 1 MB).',
  validacionJson: 'El texto no es una configuración de mando válida.',
  // Juegos (nucleo/src/juegos.rs) y opciones (nucleo/src/opciones.rs)
  juegoNoValido: 'El juego no es válido: identificador, nombre o ejecutable incorrectos.',
  juegosDemasiados: 'Hay demasiados juegos o mandos en un juego.',
  juegoNoExiste: 'Ese juego no existe.',
  atajoNoValido: 'El atajo de teclado no es válido (por ejemplo: Ctrl+Alt+P).',
  // Base de datos de mandos (src-tauri/src/comandos.rs)
  sinMandosValidos: 'No hay ningún mando válido de Windows o Linux en ese texto.',
  baseNoValida: 'La base descargada no parece válida; se mantiene la actual.',
  sinCarpeta: 'No se encuentra la carpeta de configuración.',
  archivoGrande: 'El archivo es demasiado grande (máximo 4 MB).',
  // Actualizaciones de la app (src-tauri/src/actualizar.rs)
  sinActualizador: 'Las actualizaciones automáticas no están disponibles en esta instalación.',
} as const;
