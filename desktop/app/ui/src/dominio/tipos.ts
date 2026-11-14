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

export interface AjusteStick {
  zona_muerta: number;
  curva: number;
  invertir_x: boolean;
  invertir_y: boolean;
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
}

export type OrigenMapeo = 'guardado' | 'basedatos' | 'heuristica' | 'asistente' | 'manual';

export interface EstadoMapeo {
  mapeo: MapeoMando;
  origen: OrigenMapeo;
  sin_guardar: boolean;
}

export interface EstadoEstandar {
  botones: Partial<Record<Control, boolean>>;
  ls: [number, number];
  rs: [number, number];
  l2: number;
  r2: number;
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
}

export interface InfoApp {
  version: string;
  carpeta_mapeos: string | null;
  entradas_base_datos: number;
}
