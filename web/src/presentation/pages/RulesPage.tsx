import { useI18n } from '../i18n/I18nContext';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export default function RulesPage() {
  const { t, tr } = useI18n();
  useDocumentTitle(t('Normas de la comunidad'));
  return (
    <article className="prose-page">
      <h1 className="text-3xl font-bold text-ink">{t('Normas de la comunidad')}</h1>
      <p>{t('Para que el catálogo sea útil para todos, al publicar un perfil te comprometes a:')}</p>
      <ul>
        <li>{tr('Subir perfiles que <b>funcionen</b> y que hayas probado en el juego.')}</li>
        <li>{tr('Usar títulos y descripciones <b>claros y respetuosos</b>: nada ofensivo, sexual, violento ni discriminatorio.')}</li>
        <li>{tr('No hacer <b>spam</b>: ni publicidad, ni enlaces, ni el mismo perfil muchas veces.')}</li>
        <li>{t('No subir como tuyo el trabajo de otra persona sin su permiso.')}</li>
        <li>{t('No usar los perfiles para hacer trampas que el juego prohíba.')}</li>
      </ul>

      <h2>{t('Moderación')}</h2>
      <ul>
        <li>{tr('Cualquier usuario con sesión puede <b>reportar</b> un perfil.')}</li>
        <li>{tr('Un perfil con <b>3 reportes se oculta automáticamente</b> hasta que lo revisa la moderación.')}</li>
        <li>{tr('La moderación puede ocultar o borrar perfiles y <b>bloquear</b> cuentas que incumplan estas normas.')}</li>
        <li>{t('Para evitar abusos hay límites: 10 perfiles nuevos al día y 100 en total por cuenta.')}</li>
      </ul>

      <h2>{t('Licencia de los perfiles')}</h2>
      <p>
        {t('Al publicar un perfil permites que cualquiera lo descargue, lo use y lo modifique gratis dentro de la app. La app es de uso gratuito y no comercial (PolyForm Noncommercial 1.0.0).')}
      </p>
    </article>
  );
}
