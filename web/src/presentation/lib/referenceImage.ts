import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Imagen de referencia para colocar los botones (una captura propia del juego). Se queda SOLO en
 * este navegador: se muestra con una URL blob: (object URL) y nunca se sube, ni se guarda en
 * sessionStorage, localStorage ni en el borrador. La URL se revoca al quitarla, al cambiarla y al
 * salir (desmontar).
 */
export const REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
export const REFERENCE_ACCEPT = 'image/jpeg,image/png,image/webp';

export type ReferenceProblem = 'type' | 'size';
type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Tipo real por los primeros bytes (no se fia de la extension ni del tipo que dice el archivo). */
export function sniffImage(head: Uint8Array): ImageType | null {
  const at = (i: number, bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

/** Comprueba tamano y tipo; devuelve el tipo real o el problema. */
export async function checkReferenceImage(file: Blob): Promise<{ type: ImageType } | { problem: ReferenceProblem }> {
  if (file.size <= 0 || file.size > REFERENCE_MAX_BYTES) return { problem: file.size > 0 ? 'size' : 'type' };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const type = sniffImage(head);
  return type ? { type } : { problem: 'type' };
}

function revoke(ref: { current: string | null }): void {
  if (ref.current) URL.revokeObjectURL(ref.current);
  ref.current = null;
}

export function useReferenceImage() {
  const [url, setUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<ReferenceProblem | null>(null);
  const current = useRef<string | null>(null);
  const mounted = useRef(false);

  const clear = useCallback(() => {
    revoke(current);
    setUrl(null);
    setProblem(null);
  }, []);

  const pick = useCallback(async (file: File) => {
    const result = await checkReferenceImage(file);
    if (!mounted.current) return;   // se cerro mientras se leia
    if ('problem' in result) {
      setProblem(result.problem);
      return;
    }
    revoke(current);
    // Copia con el tipo detectado: el navegador la trata siempre como esa imagen.
    const next = URL.createObjectURL(new Blob([file], { type: result.type }));
    current.current = next;
    setProblem(null);
    setUrl(next);
  }, []);

  // Al salir de la pagina o cerrar el editor: se libera la imagen.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revoke(current);
    };
  }, []);

  return { url, problem, pick, clear };
}
