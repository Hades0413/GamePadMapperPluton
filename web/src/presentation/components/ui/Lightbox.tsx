import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../i18n/I18nContext';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from './icons';

export interface LightboxItem {
  /** Nombre corto de la vista («Sobre el juego»...). */
  readonly label: string;
  /** Proporcion ancho / alto del contenido (para que quepa entero en la pantalla). */
  readonly ratio: number;
  readonly content: ReactNode;
}

/**
 * Visor a pantalla completa: anterior / siguiente (botones, flechas del teclado o deslizando
 * con el dedo) y cerrar (boton, Escape o tocando fuera). Usa <dialog> nativo: foco y fondo
 * los gestiona el navegador, y al cerrar el foco vuelve a donde estaba.
 */
export function Lightbox({
  items, open, start = 0, onClose,
}: { items: readonly LightboxItem[]; open: boolean; start?: number; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(start);
  const touchX = useRef<number | null>(null);
  const count = items.length;
  const go = (d: number) => setIndex((i) => (i + d + count) % count);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setIndex(Math.min(Math.max(start, 0), Math.max(count - 1, 0)));
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, start, count]);

  const item = items[index] ?? items[0];
  const many = count > 1;
  const nav = 'grid size-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={item ? `${item.label} (${index + 1}/${count})` : t('Vista previa')}
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const x0 = touchX.current, x1 = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (!many || x0 === null || x1 === undefined || Math.abs(x1 - x0) < 50) return;
        go(x1 < x0 ? 1 : -1);
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      {item && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="min-w-0 truncate text-sm font-medium" aria-live="polite">
              {item.label}{many && <span className="ml-2 text-white/60">{index + 1} / {count}</span>}
            </p>
            <button type="button" onClick={onClose} aria-label={t('Cerrar')} className={nav} autoFocus>
              <CloseIcon className="size-5" />
            </button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-16">
            {/* Lo mas grande posible sin salirse: ancho limitado por el alto disponible. */}
            <div style={{ width: `min(100%, calc((100dvh - 10rem) * ${item.ratio}))` }}>{item.content}</div>
            {many && (
              <>
                {/* Pantallas grandes: flechas a los lados, fuera de la imagen */}
                <button type="button" onClick={() => go(-1)} aria-label={t('Anterior')}
                  className={`${nav} absolute top-1/2 left-3 hidden -translate-y-1/2 sm:grid`}>
                  <ChevronLeftIcon className="size-6" />
                </button>
                <button type="button" onClick={() => go(1)} aria-label={t('Siguiente')}
                  className={`${nav} absolute top-1/2 right-3 hidden -translate-y-1/2 sm:grid`}>
                  <ChevronRightIcon className="size-6" />
                </button>
              </>
            )}
          </div>
          {many && (
            // Movil: flechas debajo (no tapan la imagen); tambien se puede deslizar
            <div className="flex items-center justify-center gap-6 pb-6 sm:hidden">
              <button type="button" onClick={() => go(-1)} aria-label={t('Anterior')} className={nav}>
                <ChevronLeftIcon className="size-6" />
              </button>
              <span className="text-sm text-white/70">{index + 1} / {count}</span>
              <button type="button" onClick={() => go(1)} aria-label={t('Siguiente')} className={nav}>
                <ChevronRightIcon className="size-6" />
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
