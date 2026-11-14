import { Link } from 'react-router';
import { ExternalLink } from '../components/ui/Button';
import { useLinks } from '../di/ServicesContext';
import { useI18n } from '../i18n/I18nContext';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { paths } from '../routes/paths';

export default function PrivacyPage() {
  const { t, tr } = useI18n();
  useDocumentTitle(t('Política de privacidad'));
  const links = useLinks();
  return (
    <article className="prose-page">
      <h1 className="text-3xl font-bold text-ink">{t('Política de privacidad')}</h1>
      <p>{t('Última actualización: 13 de noviembre de 2026.')}</p>
      <p>
        {tr('Esta política cubre la app <b>Gamepad Mapper Plutón</b> para Android (<c>com.gamepadmapper.app</c>) y esta web. Las dos son un proyecto personal de Hades0413, gratuito y sin anuncios.')}
      </p>

      <h2>{t('La app de Android')}</h2>
      <ul>
        <li>{tr('<b>No recoge ni envía datos personales.</b> No tiene cuentas, anuncios ni analíticas.')}</li>
        <li>
          {tr('El <b>servicio de accesibilidad</b> se usa solo para leer los botones del mando y tocar la pantalla donde tú configuras. Lo que ocurre en la pantalla y lo que pulsas no se guarda ni se envía a ningún sitio.')}
        </li>
        <li>{t('Tus perfiles se guardan solo en tu teléfono, en la carpeta de la app.')}</li>
        <li>
          {tr('La app se conecta a internet solo para <b>descargar el catálogo de perfiles</b> (con los iconos y capturas de los juegos) y para <b>comprobar si hay versiones nuevas</b> en GitHub (esto último se puede desactivar en Ajustes). Esas peticiones no llevan datos tuyos.')}
        </li>
        <li>
          {tr('Al <b>instalar un perfil de la comunidad</b> o responder <b>«¿Te funcionó?»</b>, la app envía el perfil, tu respuesta y un <b>número de instalación aleatorio</b> que crea la propia app (no identifica tu teléfono ni a ti). Sirve solo para contar instalaciones y votos, una vez por instalación.')}
        </li>
        <li>
          {tr('El <b>giroscopio, el teclado y el ratón</b> se leen solo para mover la cámara o tocar donde configuras; no se guardan ni se envían.')}
        </li>
        <li>
          {tr('<b>«Enviar diagnóstico»</b> (opcional): la app te enseña el informe completo antes de enviarlo (versión, Android, modelo, mandos conectados y las últimas líneas del registro, sin datos personales). Solo lo lee el autor y se borra a los 30 días.')}
        </li>
      </ul>

      <h2>{t('Esta web')}</h2>
      <ul>
        <li>{tr('Para <b>ver y descargar perfiles</b> no hace falta cuenta y no guardamos nada sobre ti.')}</li>
        <li>
          {tr('Solo si <b>inicias sesión con GitHub</b> (para subir perfiles, dar «me gusta» o reportar), guardamos tu <b>identificador, nombre de usuario y avatar públicos de GitHub</b>, y el correo que GitHub comparte al iniciar sesión. El correo no se muestra a nadie ni se usa para escribirte.')}
        </li>
        <li>
          {tr('Lo que publicas (perfiles, título, descripción y, si lo indicas, el modelo de tu teléfono) es <b>público</b> junto con tu nombre de usuario. El modelo es opcional y no te identifica.')}
        </li>
        <li>
          {t('Los iconos y capturas de los juegos se toman de la ficha pública de cada juego en Google Play (o los sube la moderación) y se guardan en nuestros servidores: la web y la app no cargan imágenes de otros sitios. Los usuarios no suben imágenes.')}
        </li>
        <li>{t('Guardamos qué perfiles te gustan y los reportes que haces (estos solo los ve la moderación).')}</li>
        <li>
          {tr('Los <b>comentarios</b> que escribes son públicos, con tu nombre de GitHub. Puedes borrarlos cuando quieras (y también el autor del perfil y la moderación). Se borran con tu cuenta.')}
        </li>
        <li>
          {t('La sesión se guarda en el almacenamiento local de tu navegador. No usamos cookies de seguimiento, publicidad ni analíticas.')}
        </li>
        <li>
          {t('El idioma que eliges (ES/EN) se guarda en el almacenamiento local de tu navegador.')}
        </li>
      </ul>

      <h2>{t('Servicios que usamos')}</h2>
      <ul>
        <li>{tr('<b>Supabase</b>: base de datos, inicio de sesión e imágenes de los juegos.')}</li>
        <li>{tr('<b>GitHub</b>: inicio de sesión y alojamiento de esta web (GitHub Pages) y del código.')}</li>
        <li>{tr('<b>Google Play</b>: distribución de la app.')}</li>
      </ul>
      <p>{t('Cada uno trata los datos técnicos de conexión (como la dirección IP) según su propia política.')}</p>

      <h2>{t('Tus derechos y cómo borrar tus datos')}</h2>
      <p>
        {tr('Puedes borrar tu cuenta y <b>todos</b> tus datos en cualquier momento desde {account}. Se borra al instante. También puedes borrar perfiles sueltos. Para cualquier otra petición, escríbenos en {github}.', {
          account: <Link to={paths.account}>{t('Mi cuenta › Borrar mi cuenta')}</Link>,
          github: <ExternalLink href={`${links.repoUrl}/issues`}>GitHub</ExternalLink>,
        })}
      </p>

      <h2>{t('Menores')}</h2>
      <p>{t('La web no está dirigida a menores de 13 años. Para iniciar sesión hace falta una cuenta de GitHub, que exige esa edad mínima.')}</p>

      <h2>{t('Cambios')}</h2>
      <p>{t('Si cambia esta política, actualizaremos la fecha de arriba.')}</p>
    </article>
  );
}
