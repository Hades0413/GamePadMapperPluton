import type {
  Actualizacion, ConfigToques, Disponibilidad, DispositivoAdb, Enlace, EstadoMapeo, IdMando, InfoActualizacion, InfoApp,
  InfoMando, Instantanea, Juego, JuegoActivo, MapeoMando, Opciones, OpcionesApp, PasoMacro, PerfilComunidad, PerfilLocal,
  Ventana, VentanaAbierta, VistaAsistente, VistaPerfil, VistaSalida, VistaToques,
} from '../dominio/tipos';

/** Lo que la interfaz pide al backend: el real (Tauri + nucleo en Rust) o el simulado del navegador. */
export interface Backend {
  info(): Promise<InfoApp>;
  listarMandos(): Promise<InfoMando[]>;
  /** Avisa cuando se conecta o desconecta un mando. Devuelve la funcion para dejar de escuchar. */
  alCambiarMandos(cb: (mandos: InfoMando[]) => void): () => void;
  /** Avisa al pausar o reanudar los mandos virtuales (bandeja o atajo de teclado). */
  alCambiarPausa(cb: (pausado: boolean) => void): () => void;
  /** Avisa cuando cambia el juego activo. */
  alCambiarJuego(cb: (juego: JuegoActivo | null) => void): () => void;
  /** Estado en vivo de un mando (como mucho ~60 veces por segundo). */
  suscribirEntrada(id: IdMando, cb: (i: Instantanea) => void): () => void;

  obtenerMapeo(id: IdMando): Promise<EstadoMapeo>;
  editarMapeo(id: IdMando, mapeo: MapeoMando): Promise<EstadoMapeo>;
  guardarMapeo(id: IdMando): Promise<{ estado: EstadoMapeo; ruta: string }>;
  restablecerMapeo(id: IdMando): Promise<EstadoMapeo>;
  autoMapear(id: IdMando): Promise<EstadoMapeo>;
  exportarSdl(id: IdMando): Promise<string>;
  importarSdl(id: IdMando, linea: string): Promise<EstadoMapeo>;
  /** Configuracion completa en JSON (preset). */
  exportarConfig(id: IdMando): Promise<string>;
  /** Aplica un preset (JSON, 1 MB como mucho; se valida en el nucleo). */
  importarConfig(id: IdMando, texto: string): Promise<EstadoMapeo>;
  /** Anade mandos nuevos (gamecontrollerdb.txt o lineas sueltas) sin borrar los anteriores. Devuelve cuantos. */
  anadirMandos(texto: string): Promise<number>;
  /** Descarga la ultima base oficial de mandos (SDL GameControllerDB). */
  actualizarBase(): Promise<Actualizacion>;
  /** Abre la web con este mando listo para enviarlo a la comunidad (la moderacion lo revisa). */
  enviarAComunidad(id: IdMando): Promise<void>;
  probarVibracion(id: IdMando): Promise<void>;
  /** Vibracion de prueba con la configuracion del mando (intensidades 0..1). */
  probarMotores(id: IdMando, fuerte: number, debil: number): Promise<void>;

  /** Que mandos virtuales se pueden crear aqui. */
  disponibilidadSalidas(): Promise<Disponibilidad[]>;
  pausar(pausado: boolean): Promise<boolean>;
  reintentarSalida(id: IdMando): Promise<VistaSalida>;
  grabarMacroIniciar(id: IdMando): Promise<void>;
  grabarMacroTerminar(id: IdMando): Promise<PasoMacro[]>;

  asistenteIniciar(id: IdMando): Promise<VistaAsistente>;
  asistenteSaltar(id: IdMando): Promise<VistaAsistente>;
  asistenteAtras(id: IdMando): Promise<VistaAsistente>;
  asistenteCancelar(id: IdMando): Promise<void>;
  asistenteAplicar(id: IdMando): Promise<EstadoMapeo>;

  listarJuegos(): Promise<Juego[]>;
  juegoActivo(): Promise<JuegoActivo | null>;
  guardarJuego(juego: Juego): Promise<Juego[]>;
  borrarJuego(juego: string): Promise<Juego[]>;
  copiarAJuego(juego: string, id: IdMando): Promise<Juego[]>;
  quitarDeJuego(juego: string, guid: string): Promise<Juego[]>;
  ventanaActiva(): Promise<Ventana | null>;

  /** Toques: ventanas abiertas (null si no se pueden listar, p. ej. en Wayland puro). */
  listarVentanas(): Promise<VentanaAbierta[] | null>;
  /** Estado de los toques (perfil, juego detectado, destino, foco). */
  estadoToques(): Promise<VistaToques>;
  pausarToques(pausa: boolean): Promise<VistaToques>;
  configToques(): Promise<ConfigToques>;
  guardarConfigToques(config: ConfigToques): Promise<ConfigToques>;
  perfilesToques(): Promise<PerfilLocal[]>;
  verPerfilToques(id: string): Promise<VistaPerfil>;
  /** Guarda un perfil (.conf) de archivo o de la comunidad; el nucleo lo valida. */
  importarPerfilToques(texto: string): Promise<PerfilLocal>;
  borrarPerfilToques(id: string): Promise<PerfilLocal[]>;
  /** Perfiles publicados en la comunidad para un juego (paquete). */
  buscarComunidadToques(paquete: string): Promise<PerfilComunidad[]>;
  dispositivosAdb(): Promise<DispositivoAdb[]>;

  obtenerOpciones(): Promise<OpcionesApp>;
  guardarOpciones(opciones: Opciones): Promise<OpcionesApp>;
  leerRegistro(): Promise<string[]>;
  abrirEnlace(cual: Enlace): Promise<void>;
  /** null si ya es la ultima version. */
  buscarActualizacion(): Promise<InfoActualizacion | null>;
  instalarActualizacion(): Promise<void>;
}
