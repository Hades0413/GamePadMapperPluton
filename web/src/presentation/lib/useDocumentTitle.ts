import { useEffect } from 'react';

const SITE = 'Gamepad Mapper Plutón';

export function useDocumentTitle(title?: string, description?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : `${SITE} — Juega con mando en juegos táctiles`;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}
