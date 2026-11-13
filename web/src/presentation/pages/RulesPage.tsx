import { useDocumentTitle } from '../lib/useDocumentTitle';

export default function RulesPage() {
  useDocumentTitle('Normas de la comunidad');
  return (
    <article className="prose-page">
      <h1 className="text-3xl font-bold text-ink">Normas de la comunidad</h1>
      <p>Para que el catálogo sea útil para todos, al publicar un perfil te comprometes a:</p>
      <ul>
        <li>Subir perfiles que <strong>funcionen</strong> y que hayas probado en el juego.</li>
        <li>Usar títulos y descripciones <strong>claros y respetuosos</strong>: nada ofensivo, sexual, violento ni discriminatorio.</li>
        <li>No hacer <strong>spam</strong>: ni publicidad, ni enlaces, ni el mismo perfil muchas veces.</li>
        <li>No subir como tuyo el trabajo de otra persona sin su permiso.</li>
        <li>No usar los perfiles para hacer trampas que el juego prohíba.</li>
      </ul>

      <h2>Moderación</h2>
      <ul>
        <li>Cualquier usuario con sesión puede <strong>reportar</strong> un perfil.</li>
        <li>Un perfil con <strong>3 reportes se oculta automáticamente</strong> hasta que lo revisa la moderación.</li>
        <li>La moderación puede ocultar o borrar perfiles y <strong>bloquear</strong> cuentas que incumplan estas normas.</li>
        <li>Para evitar abusos hay límites: 10 perfiles nuevos al día y 100 en total por cuenta.</li>
      </ul>

      <h2>Licencia de los perfiles</h2>
      <p>
        Al publicar un perfil permites que cualquiera lo descargue, lo use y lo modifique gratis dentro de la app.
        La app es de uso gratuito y no comercial (PolyForm Noncommercial 1.0.0).
      </p>
    </article>
  );
}
