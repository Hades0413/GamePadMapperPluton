import { Link } from 'react-router';
import { useLinks } from '../../di/ServicesContext';
import { useT } from '../../i18n/I18nContext';
import { useInstallPrompt } from '../../lib/pwa';
import { paths } from '../../routes/paths';
import { ExternalLink } from '../ui/Button';
import { InstallIcon } from '../ui/icons';

export function Footer() {
  const links = useLinks();
  const t = useT();
  const install = useInstallPrompt();
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted sm:flex-row sm:justify-between">
        <div className="space-y-1">
          <p className="font-semibold text-ink">Gamepad Mapper Plutón</p>
          <p>{t('Hecho por Hades0413. Uso gratuito y no comercial (PolyForm Noncommercial 1.0.0).')}</p>
          <p className="text-xs">{t('Los nombres e iconos de los juegos pertenecen a sus respectivos dueños y se muestran solo para identificarlos.')}</p>
          {install && (
            <button type="button" onClick={() => void install()} title={t('Instala la web en tu dispositivo para abrirla como una app.')}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-ink hover:border-primary/60">
              <InstallIcon />{t('Instalar la web')}
            </button>
          )}
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
