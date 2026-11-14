import type { Backend } from '../../backend';
import { esControl } from '../../dominio/configuracion';
import { ETIQUETA } from '../../dominio/controles';
import { describirFuente } from '../../dominio/fuentes';
import type { Control, Entrada, EstadoMapeo, InfoMando, Instantanea, MapeoMando } from '../../dominio/tipos';

/** Nombre corto de una entrada (control estandar o entrada cruda). */
export function nombreEntrada(e: Entrada, info: InfoMando): string {
  return esControl(e) ? ETIQUETA[e] : describirFuente(e, info);
}

/** Lo que recibe cada sub-pestana de un mando. */
export interface PropsSeccion {
  backend: Backend;
  info: InfoMando;
  estado: EstadoMapeo;
  vivo: Instantanea | null;
  /** Cambia la configuracion (se envia al nucleo, que la valida; no se guarda hasta «Guardar»). */
  editar: (cambio: (m: MapeoMando) => MapeoMando) => void;
  /** Ejecuta una accion del backend y avisa del resultado o del error. */
  ejecutar: <T>(accion: () => Promise<T>, ok?: (r: T) => string) => void;
  seleccionado: Control | null;
  onSeleccionar: (c: Control | null) => void;
}

export type SubPestana =
  | 'general' | 'botones' | 'cruceta' | 'gatillos' | 'stick_izquierdo' | 'stick_derecho' | 'extras' | 'macros'
  | 'vibracion' | 'salida';
