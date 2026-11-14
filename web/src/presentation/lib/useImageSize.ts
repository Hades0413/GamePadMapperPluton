import { useEffect, useState } from 'react';

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/** Tamano real (en pixeles) de una imagen remota, o null mientras carga o si falla. */
export function useImageSize(url: string | null): ImageSize | null {
  const [size, setSize] = useState<{ url: string; size: ImageSize } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (alive && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setSize({ url, size: { width: img.naturalWidth, height: img.naturalHeight } });
      }
    };
    img.src = url;
    return () => { alive = false; };
  }, [url]);
  return url && size?.url === url ? size.size : null;
}
