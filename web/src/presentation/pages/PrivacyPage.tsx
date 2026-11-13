import { Link } from 'react-router';
import { ExternalLink } from '../components/ui/Button';
import { useLinks } from '../di/ServicesContext';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { paths } from '../routes/paths';

export default function PrivacyPage() {
  useDocumentTitle('Política de privacidad');
  const links = useLinks();
  return (
    <article className="prose-page">
      <h1 className="text-3xl font-bold text-ink">Política de privacidad</h1>
      <p>Última actualización: 13 de noviembre de 2026.</p>
      <p>
        Esta política cubre la app <strong>Gamepad Mapper Plutón</strong> para Android
        (<code>com.gamepadmapper.app</code>) y esta web. Las dos son un proyecto personal de Hades0413, gratuito
        y sin anuncios.
      </p>

      <h2>La app de Android</h2>
      <ul>
        <li><strong>No recoge ni envía datos personales.</strong> No tiene cuentas, anuncios ni analíticas.</li>
        <li>
          El <strong>servicio de accesibilidad</strong> se usa solo para leer los botones del mando y tocar la pantalla
          donde tú configuras. Lo que ocurre en la pantalla y lo que pulsas no se guarda ni se envía a ningún sitio.
        </li>
        <li>Tus perfiles se guardan solo en tu teléfono, en la carpeta de la app.</li>
        <li>
          La app se conecta a internet solo para <strong>descargar el catálogo de perfiles</strong> (con los
          iconos y capturas de los juegos) y para
          <strong> comprobar si hay versiones nuevas</strong> en GitHub (esto último se puede desactivar en Ajustes).
          Esas peticiones no llevan datos tuyos.
        </li>
      </ul>

      <h2>Esta web</h2>
      <ul>
        <li>Para <strong>ver y descargar perfiles</strong> no hace falta cuenta y no guardamos nada sobre ti.</li>
        <li>
          Solo si <strong>inicias sesión con GitHub</strong> (para subir perfiles, dar «me gusta» o reportar),
          guardamos tu <strong>identificador, nombre de usuario y avatar públicos de GitHub</strong>, y el correo que
          GitHub comparte al iniciar sesión. El correo no se muestra a nadie ni se usa para escribirte.
        </li>
        <li>Lo que publicas (perfiles, título y descripción) es <strong>público</strong> junto con tu nombre de usuario.</li>
        <li>
          Los iconos y capturas de los juegos los añade solo la moderación (el icono se toma de la ficha pública
          del juego en Google Play) y se guardan en nuestros servidores: la web no carga imágenes de otros sitios.
        </li>
        <li>Guardamos qué perfiles te gustan y los reportes que haces (estos solo los ve la moderación).</li>
        <li>
          La sesión se guarda en el almacenamiento local de tu navegador. No usamos cookies de seguimiento,
          publicidad ni analíticas.
        </li>
      </ul>

      <h2>Servicios que usamos</h2>
      <ul>
        <li><strong>Supabase</strong>: base de datos, inicio de sesión e imágenes de los juegos.</li>
        <li><strong>GitHub</strong>: inicio de sesión y alojamiento de esta web (GitHub Pages) y del código.</li>
        <li><strong>Google Play</strong>: distribución de la app.</li>
      </ul>
      <p>Cada uno trata los datos técnicos de conexión (como la dirección IP) según su propia política.</p>

      <h2>Tus derechos y cómo borrar tus datos</h2>
      <p>
        Puedes borrar tu cuenta y <strong>todos</strong> tus datos en cualquier momento desde{' '}
        <Link to={paths.account}>Mi cuenta › Borrar mi cuenta</Link>. Se borra al instante. También puedes borrar
        perfiles sueltos. Para cualquier otra petición, escríbenos en{' '}
        <ExternalLink href={`${links.repoUrl}/issues`}>GitHub</ExternalLink>.
      </p>

      <h2>Menores</h2>
      <p>La web no está dirigida a menores de 13 años. Para iniciar sesión hace falta una cuenta de GitHub, que exige esa edad mínima.</p>

      <h2>Cambios</h2>
      <p>Si cambia esta política, actualizaremos la fecha de arriba.</p>
    </article>
  );
}
