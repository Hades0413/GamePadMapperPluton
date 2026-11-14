import type { ControllerMapping, MappingStatus } from '@domain/controller/ControllerMapping';

/** Mandos de la comunidad (lineas SDL). */
export interface ControllerMappingRepository {
  /** Aprobados (publicos), los mas recientes primero. */
  listApproved(search: string, limit: number): Promise<readonly ControllerMapping[]>;
  /** Envios propios en cualquier estado. */
  listMine(authorId: string): Promise<readonly ControllerMapping[]>;
  /** Envia una linea (queda pendiente de revision). Devuelve el id. */
  submit(line: string): Promise<string>;
  remove(id: string): Promise<void>;
  /** Solo admins. */
  adminList(status: MappingStatus): Promise<readonly ControllerMapping[]>;
  /** Solo admins. */
  review(id: string, approve: boolean): Promise<void>;
}
