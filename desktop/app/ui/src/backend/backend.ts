import type { EstadoMapeo, IdMando, InfoApp, InfoMando, Instantanea, MapeoMando, VistaAsistente } from '../dominio/tipos';

/** Lo que la interfaz pide al backend: el real (Tauri + nucleo en Rust) o el simulado del navegador. */
export interface Backend {
  info(): Promise<InfoApp>;
  listarMandos(): Promise<InfoMando[]>;
  /** Avisa cuando se conecta o desconecta un mando. Devuelve la funcion para dejar de escuchar. */
  alCambiarMandos(cb: (mandos: InfoMando[]) => void): () => void;
  /** Estado en vivo de un mando (como mucho ~60 veces por segundo). */
  suscribirEntrada(id: IdMando, cb: (i: Instantanea) => void): () => void;

  obtenerMapeo(id: IdMando): Promise<EstadoMapeo>;
  editarMapeo(id: IdMando, mapeo: MapeoMando): Promise<EstadoMapeo>;
  guardarMapeo(id: IdMando): Promise<{ estado: EstadoMapeo; ruta: string }>;
  restablecerMapeo(id: IdMando): Promise<EstadoMapeo>;
  autoMapear(id: IdMando): Promise<EstadoMapeo>;
  exportarSdl(id: IdMando): Promise<string>;
  importarSdl(id: IdMando, linea: string): Promise<EstadoMapeo>;
  /** Anade el texto de un gamecontrollerdb.txt a la base de datos (y lo recuerda). Devuelve las entradas. */
  cargarBaseDatos(texto: string): Promise<number>;
  probarVibracion(id: IdMando): Promise<void>;

  asistenteIniciar(id: IdMando): Promise<VistaAsistente>;
  asistenteSaltar(id: IdMando): Promise<VistaAsistente>;
  asistenteAtras(id: IdMando): Promise<VistaAsistente>;
  asistenteCancelar(id: IdMando): Promise<void>;
  asistenteAplicar(id: IdMando): Promise<EstadoMapeo>;
}
