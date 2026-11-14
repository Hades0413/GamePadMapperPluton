/**
 * Mensajes de error del nucleo en Rust (`#[error(...)]` de servicio.rs, dispositivos/mod.rs).
 * La interfaz los traduce con t(); el backend simulado usa los mismos.
 */
export const ERROR = {
  noConectado: 'El mando ya no está conectado.',
  sinVibracion: 'Este mando no tiene vibración.',
  sinAlmacen: 'No hay carpeta de configuración donde guardar.',
  sinAsistente: 'El asistente no está en marcha para este mando.',
  asistenteSinTerminar: 'El asistente aún no ha terminado.',
  // Base de datos de mandos (src-tauri/src/comandos.rs)
  sinMandosValidos: 'No hay ningún mando válido de Windows o Linux en ese texto.',
  baseNoValida: 'La base descargada no parece válida; se mantiene la actual.',
  sinCarpeta: 'No se encuentra la carpeta de configuración.',
  archivoGrande: 'El archivo es demasiado grande (máximo 4 MB).',
} as const;
