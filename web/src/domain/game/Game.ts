/** Juego de Android, identificado por su paquete (com.supercell.brawlstars). */
export interface Game {
  readonly packageName: string;
  readonly name: string;
  readonly iconUrl: string | null;
  /** Captura del juego (horizontal) para dibujar la vista previa de los perfiles encima. */
  readonly backgroundUrl: string | null;
  readonly profileCount: number;
  readonly lastProfileAt: Date | null;
}

export const GAME_NAME_MIN = 2;
export const GAME_NAME_MAX = 60;
export const PACKAGE_MAX = 150;
const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

export function isValidPackage(value: string): boolean {
  return value.length <= PACKAGE_MAX && PACKAGE_PATTERN.test(value);
}

/**
 * Apps del sistema, tiendas, ajustes, permisos y herramientas de root: un perfil para ellas
 * convertiria el mando en toques elegidos por otra persona. Misma lista que la base de datos
 * (private.is_sensitive_package) y la app (Library.isSensitivePackage).
 */
const SENSITIVE_PACKAGE =
  /^(android|com\.android|com\.google\.android|com\.miui|com\.xiaomi|com\.samsung\.android|com\.sec\.android|com\.oplus|com\.coloros|com\.huawei|com\.hihonor|com\.oneplus|com\.motorola|com\.lineageos|org\.lineageos|com\.topjohnwu|io\.github\.huskydg|me\.weishu|moe\.shizuku|rikka\.shizuku|com\.gamepadmapper)(\.|$)/i;

export function isSensitivePackage(value: string): boolean {
  return SENSITIVE_PACKAGE.test(value.trim());
}
