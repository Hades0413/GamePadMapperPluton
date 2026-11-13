/** Imagenes de un juego (las suben solo los administradores). */
export type GameImageKind = 'icon' | 'background';

export const GAME_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type GameImageType = (typeof GAME_IMAGE_TYPES)[number];
export const GAME_IMAGE_MAX_BYTES = 1024 * 1024;

/** Imagen ya preparada para subir (redimensionada y sin metadatos). */
export interface GameImageFile {
  readonly data: Blob;
  readonly type: GameImageType;
}

export function isGameImageType(value: string): value is GameImageType {
  return (GAME_IMAGE_TYPES as readonly string[]).includes(value);
}
