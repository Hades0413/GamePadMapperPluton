import { Link } from 'react-router';
import { useLinks } from '../../di/ServicesContext';
import { useT } from '../../i18n/I18nContext';
import { paths } from '../../routes/paths';
import { ExternalLink } from '../ui/Button';

export function Footer() {
  const links = useLinks();
  const t = useT();
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted sm:flex-row sm:justify-between">
        <div className="space-y-1">
          <p className="font-semibold text-ink">Gamepad Mapper Plutón</p>
          <p>{t('Hecho por Hades0413. Uso gratuito y no comercial (PolyForm Noncommercial 1.0.0).')}</p>
          <p className="text-xs">{t('Los nombres e iconos de los juegos pertenecen a sus respectivos dueños y se muestran solo para identificarlos.')}</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t('Pie de página')}>
          <Link to={paths.controllers} className="hover:text-ink">{t('Mandos')}</Link>
          <Link to={paths.rules} className="hover:text-ink">{t('Normas')}</Link>
          <Link to={paths.privacy} className="hover:text-ink">{t('Privacidad')}</Link>
          <ExternalLink href={links.repoUrl} className="hover:text-ink">{t('Código en GitHub')}</ExternalLink>
          <ExternalLink href={`${links.repoUrl}/issues`} className="hover:text-ink">{t('Contacto')}</ExternalLink>
        </nav>
      </div>
    </footer>
  );
}
