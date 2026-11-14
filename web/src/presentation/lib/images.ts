import type { GameImageFile, GameImageKind } from '@domain/game/GameImage';

/**
 * Prepara una imagen elegida por el admin antes de subirla: la vuelve a dibujar en un canvas
 * (asi se pierden los metadatos, como la ubicacion de la foto) y la reduce.
 *  - Icono: cuadrado de 256 px, PNG (recorta al centro).
 *  - Fondo: horizontal, como mucho 1600 px de ancho, JPEG.
 */
export async function prepareGameImage(file: File, kind: GameImageKind): Promise<GameImageFile> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Elige una imagen PNG, JPEG o WebP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('La imagen es demasiado grande (máximo 20 MB).');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no puede procesar imágenes.');
    if (kind === 'icon') {
      const side = Math.min(bitmap.width, bitmap.height);
      canvas.width = canvas.height = 256;
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
      return { data: await toBlob(canvas, 'image/png'), type: 'image/png' };
    }
    if (bitmap.width <= bitmap.height) throw new Error('El fondo tiene que ser una captura en horizontal.');
    const scale = Math.min(1, 1600 / bitmap.width);
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { data: await toBlob(canvas, 'image/jpeg', 0.82), type: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), type, quality),
  );
}
