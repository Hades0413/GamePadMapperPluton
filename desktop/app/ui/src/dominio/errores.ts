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
} as const;
