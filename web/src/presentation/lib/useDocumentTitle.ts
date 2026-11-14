import { useEffect } from 'react';
import { useT } from '../i18n/I18nContext';

const SITE = 'Gamepad Mapper Plutón';
const DEFAULT_DESCRIPTION = 'Convierte los botones de tu mando en toques de pantalla en juegos de Android. Descarga perfiles de la comunidad para tu juego.';

/** Titulo y descripcion de la pestana. Los llamadores pasan `title` y `description` ya traducidos. */
export function useDocumentTitle(title?: string, description?: string) {
  const t = useT();
  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : `${SITE} — ${t('Juega con mando en juegos táctiles')}`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description ?? t(DEFAULT_DESCRIPTION));
  }, [title, description, t]);
}
