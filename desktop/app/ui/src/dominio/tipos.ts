/**
 * Tipos que intercambian la interfaz y el nucleo en Rust (serde). Mismos nombres que en
 * `desktop/app/nucleo/src`: si cambia uno, cambia el otro.
 */

export type IdMando = number;
export type Plataforma = 'evdev' | 'xinput' | 'simulado';
export type Conexion = 'usb' | 'bluetooth' | 'virtual' | 'otra';

export interface DescEntrada {
  indice: number;
  codigo: number;
  nombre: string;
}

export interface InfoMando {
  id: IdMando;
  nombre: string;
  guid: string;
  vendedor: number;
  producto: number;
  version: number;
  conexion: Conexion;
  plataforma: Plataforma;
  ruta: string;
  botones: DescEntrada[];
  ejes: DescEntrada[];
  hats: number;
  vibracion: boolean;
}

export interface EstadoCrudo {
  botones: boolean[];
  ejes: number[];
  hats: number[];
}

export const CONTROLES = [
  'A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'SELECT', 'START', 'HOME',
  'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT', 'LS_X', 'LS_Y', 'RS_X', 'RS_Y',
] as const;
export type Control = (typeof CONTROLES)[number];

/** Respuesta de un eje (mapeo/mod.rs: AjusteEje). */
export interface AjusteEje {
  zona_muerta: number;
  anti_zona_muerta: number;
  sensibilidad: number;
  saturacion: number;
}

export interface AjusteStick {
  zona_muerta: number;
  curva: number;
  invertir_x: boolean;
  invertir_y: boolean;
  eje_x: AjusteEje;
  eje_y: AjusteEje;
}

export interface AjusteGatillo {
  zona_muerta: number;
  anti_zona_muerta: number;
  maximo: number;
}

export interface AjusteVibracion {
  activa: boolean;
  intercambiar: boolean;
  fuerza: number;
  fuerte: number;
  debil: number;
}

/** Mando virtual que produce un mando (salida/mod.rs: TipoSalida). */
export type TipoSalida = 'ninguna' | 'xbox360' | 'dualshock4' | 'switchpro';

/** Controles del mando virtual (mapeo/acciones.rs: SalidaPad), en el orden de sus bits. */
export const SALIDAS = [
  'A', 'B', 'X', 'Y', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'SELECT', 'START', 'HOME',
  'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT', 'TOUCHPAD', 'CAPTURA',
  'LS_UP', 'LS_DOWN', 'LS_LEFT', 'LS_RIGHT', 'RS_UP', 'RS_DOWN', 'RS_LEFT', 'RS_RIGHT',
] as const;
export type SalidaPad = (typeof SALIDAS)[number];

export type Modo = 'normal' | 'turbo' | 'alternar';

export type Accion =
  | { tipo: 'pad'; salida: SalidaPad; modo: Modo; turbo_hz: number }
  | { tipo: 'macro'; macro_id: number }
  | { tipo: 'tecla'; tecla: string }
  | { tipo: 'ignorar' };

export type PasoMacro =
  | { tipo: 'pulsar'; salida: SalidaPad }
  | { tipo: 'soltar'; salida: SalidaPad }
  | { tipo: 'toque'; salida: SalidaPad; ms: number }
  | { tipo: 'esperar'; ms: number };

export interface Macro {
  id: number;
  nombre: string;
  pasos: PasoMacro[];
  repetir: boolean;
}

/** Entrada con accion: un control estandar (A, DPAD_UP...) o una entrada cruda (b12, +a7, h1.2). */
export type Entrada = string;

export interface Capa {
  nombre: string;
  modificador: Entrada;
  acciones: Record<Entrada, Accion>;
}

export type Lado = 'izquierdo' | 'derecho';

export interface AjusteDireccion {
  intercambiar_sticks: boolean;
  cruceta_a_stick: Lado | null;
  stick_a_cruceta: Lado | null;
}

export interface MapeoMando {
  version: number;
  guid: string;
  nombre: string;
  /** Fuente con sintaxis SDL: b0, a1, +a2, -a2, a3~, h0.4 */
  asignaciones: Partial<Record<Control, string>>;
  stick_izquierdo: AjusteStick;
  stick_derecho: AjusteStick;
  extras_sdl?: Record<string, string>;
  gatillo_izquierdo: AjusteGatillo;
  gatillo_derecho: AjusteGatillo;
  salida: TipoSalida;
  acciones: Record<Entrada, Accion>;
  capas: Capa[];
  macros: Macro[];
  vibracion: AjusteVibracion;
  direccion: AjusteDireccion;
}

export type OrigenMapeo = 'guardado' | 'basedatos' | 'heuristica' | 'asistente' | 'manual';

export interface EstadoMapeo {
  mapeo: MapeoMando;
  origen: OrigenMapeo;
  sin_guardar: boolean;
  /** Entradas del mando que no usa el mapeo estandar (botones extra). */
  extras: Entrada[];
}

export interface EstadoEstandar {
  botones: Partial<Record<Control, boolean>>;
  ls: [number, number];
  rs: [number, number];
  l2: number;
  r2: number;
}

/** Estado del mando virtual (botones como bits de SALIDAS). */
export interface EstadoPad {
  botones: number;
  ls: [number, number];
  rs: [number, number];
  l2: number;
  r2: number;
}

export interface VistaSalida {
  tipo: TipoSalida;
  activa: boolean;
  descripcion: string | null;
  error: string | null;
}

export type FaseAsistente = 'calibrando' | 'esperando' | 'soltando' | 'terminado' | 'cancelado';

export interface VistaAsistente {
  fase: FaseAsistente;
  paso: Control | null;
  indice: number;
  total: number;
  asignaciones: Partial<Record<Control, string>>;
  aviso: { tipo: 'repetida'; control: Control } | null;
  ejes_ruidosos: number[];
}

export interface Instantanea {
  id: IdMando;
  crudo: EstadoCrudo;
  estandar: EstadoEstandar;
  asistente: VistaAsistente | null;
  pad: EstadoPad;
  salida: VistaSalida;
  juego: string | null;
  grabando: boolean;
  pausado: boolean;
}

export interface Disponibilidad {
  tipo: TipoSalida;
  disponible: boolean;
  motivo: string | null;
}

export interface InfoApp {
  version: string;
  carpeta_mapeos: string | null;
  entradas_base_datos: number;
  /** Fecha de la base completa incluida en la app (AAAA-MM-DD). */
  base_incluida: string;
  /** Ultima actualizacion descargada (segundos Unix) o null si nunca se actualizo. */
  base_actualizada: number | null;
  /** Mandos anadidos por el usuario. */
  mandos_anadidos: number;
  plataforma: 'linux' | 'windows';
  pausado: boolean;
}

export interface Actualizacion {
  antes: number;
  despues: number;
  /** Mandos aprobados de la comunidad descargados (null si no se pudo consultar). */
  comunidad: number | null;
}

export interface Ventana {
  ejecutable: string;
  clase: string;
  titulo: string;
}

export interface Juego {
  id: string;
  nombre: string;
  coincidencia: string;
  mapeos: Record<string, MapeoMando>;
}

export interface JuegoActivo {
  id: string;
  nombre: string;
}

export type Tema = 'oscuro' | 'claro' | 'sistema';

export interface Opciones {
  minimizar_a_bandeja: boolean;
  iniciar_con_sistema: boolean;
  iniciar_minimizado: boolean;
  tema: Tema;
  idioma: 'auto' | 'es' | 'en';
  cambio_automatico: boolean;
  atajo_pausa: string;
  registro: boolean;
  buscar_actualizaciones: boolean;
}

export interface OpcionesApp extends Opciones {
  ruta_registro: string | null;
}

export interface InfoActualizacion {
  version: string;
  actual: string;
  notas: string | null;
  fecha: string | null;
}

/** Enlaces que puede abrir la interfaz (lista cerrada en src-tauri/src/comandos.rs). */
export type Enlace = 'vigembus' | 'vigemclient' | 'web' | 'repositorio' | 'versiones' | 'licencia';
