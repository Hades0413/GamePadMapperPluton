import { ErrorAlert } from '../components/ui/Alert';
import { ButtonLink, ExternalLink } from '../components/ui/Button';
import { GamepadIcon, PlayStoreIcon } from '../components/ui/icons';
import { PageSpinner } from '../components/ui/Spinner';
import { GameCard } from '../components/profile/GameCard';
import { useLinks } from '../di/ServicesContext';
import { useT } from '../i18n/I18nContext';
import { useDocumentTitle } from '../lib/useDocumentTitle';
import { useGames } from '../queries/games';
import { paths } from '../routes/paths';

const FEATURES = [
  ['Sin root ni PC', 'Funciona con el servicio de accesibilidad de Android. Root y Shizuku son mejoras opcionales.'],
  ['Cualquier mando', 'Bluetooth o USB: Xbox, PlayStation, genéricos… Varios mandos a la vez.'],
  ['Editor en el juego', 'Una burbuja flotante para colocar cada botón encima del juego, sin salir de él.'],
  ['Joystick y cámara', 'Stick izquierdo como joystick (con cruceta) y stick derecho como cámara con curva y zona muerta.'],
  ['Macros y turbo', 'Toque rápido, ráfagas, turbo, interruptor, deslizar y macros con tiempos.'],
  ['Perfiles de la comunidad', 'Descarga la configuración que otros jugadores ya ajustaron para tu juego.'],
] as const;

const STEPS = [
  ['Instala la app', 'Desde Google Play y activa el servicio de accesibilidad (la app te guía).'],
  ['Elige un perfil', 'Busca tu juego aquí y pulsa «Enviar a la app», o crea el tuyo con la burbuja.'],
  ['Juega con mando', 'Abre el juego: los botones del mando tocan la pantalla por ti.'],
] as const;

function TopGames() {
  const t = useT();
  const { data, isPending, error, refetch } = useGames('', 6);
  if (isPending) return <PageSpinner />;
  if (error) return <ErrorAlert error={error} onRetry={() => void refetch()} />;
  const games = data.pages.flatMap((p) => p.items);
  if (games.length === 0) return <p className="text-muted">{t('Todavía no hay perfiles. ¡Sé el primero en subir uno!')}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {games.map((g) => <GameCard key={g.packageName} game={g} />)}
    </div>
  );
}

export default function HomePage() {
  useDocumentTitle();
  const t = useT();
  const links = useLinks();

  return (
    <div className="space-y-24">
      <section className="relative pt-6 text-center sm:pt-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-10 -z-10 mx-auto h-72 max-w-2xl rounded-full bg-primary-strong/20 blur-3xl" />
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          <GamepadIcon className="size-3.5 text-accent" /> {t('Gratis · Sin anuncios · Código abierto')}
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">
          {t('Juega con')} <span className="text-primary">{t('mando')}</span> {t('en juegos que solo tienen controles táctiles')}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted text-pretty">
          {t('Gamepad Mapper Plutón convierte los botones y sticks de tu mando en toques de pantalla en Android.')}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ExternalLink href={links.playUrl} variant="primary" size="lg" icon={<PlayStoreIcon className="size-5" />}>
            {t('Descargar en Google Play')}
          </ExternalLink>
          <ButtonLink to={paths.games} variant="secondary" size="lg">{t('Ver perfiles de juegos')}</ButtonLink>
        </div>
      </section>

      <section aria-labelledby="features" className="space-y-8">
        <h2 id="features" className="text-center text-2xl font-bold sm:text-3xl">{t('Todo lo que necesitas')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, text]) => (
            <div key={title} className="card p-5">
              <h3 className="font-semibold">{t(title)}</h3>
              <p className="mt-2 text-sm text-muted">{t(text)}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="steps" className="space-y-8">
        <h2 id="steps" className="text-center text-2xl font-bold sm:text-3xl">{t('Cómo funciona')}</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="card p-5">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary-strong font-bold">{i + 1}</span>
              <h3 className="mt-3 font-semibold">{t(title)}</h3>
              <p className="mt-1 text-sm text-muted">{t(text)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="popular" className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <h2 id="popular" className="text-2xl font-bold sm:text-3xl">{t('Juegos con más perfiles')}</h2>
          <ButtonLink to={paths.games} variant="ghost" size="sm">{t('Ver todos →')}</ButtonLink>
        </div>
        <TopGames />
      </section>
    </div>
  );
}
