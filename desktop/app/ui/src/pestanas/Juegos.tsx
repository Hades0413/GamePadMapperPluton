import { useEffect, useState } from 'react';
import type { Backend } from '../backend';
import { claseBoton } from '../componentes/boton';
import { Casilla, Tarjeta } from '../componentes/controles';
import { idDeNombre, NOMBRE_SALIDA, nombrePerfil } from '../dominio/configuracion';
import type { InfoMando, Juego, JuegoActivo, OpcionesApp, PerfilLocal } from '../dominio/tipos';
import { useT } from '../i18n/contexto';
import { SeccionToques } from './JuegosToques';

interface Props {
  backend: Backend;
  ejecutar: <T>(accion: () => Promise<T>, ok?: (r: T) => string) => void;
}

/**
 * Juegos: una configuracion por juego y por modelo de mando que se usa sola cuando el juego tiene
 * el foco (por su ejecutable o la clase de su ventana), y los toques para juegos Android (perfiles,
 * juego detectado por adb y perfil de toques de cada juego).
 */
export function PestanaJuegos({ backend, ejecutar }: Props) {
  const t = useT();
  const [juegos, setJuegos] = useState<Juego[]>([]);
  const [mandos, setMandos] = useState<InfoMando[]>([]);
  const [activo, setActivo] = useState<JuegoActivo | null>(null);
  const [opciones, setOpciones] = useState<OpcionesApp | null>(null);
  const [nombre, setNombre] = useState('');
  const [coincidencia, setCoincidencia] = useState('');
  const [detectando, setDetectando] = useState(0);
  const [mandoElegido, setMandoElegido] = useState<number | null>(null);
  const [perfiles, setPerfiles] = useState<PerfilLocal[]>([]);

  useEffect(() => {
    let vivo = true;
    void backend.listarJuegos().then((j) => vivo && setJuegos(j));
    void backend.listarMandos().then((m) => vivo && setMandos(m));
    void backend.juegoActivo().then((j) => vivo && setActivo(j));
    void backend.obtenerOpciones().then((o) => vivo && setOpciones(o));
    void backend.perfilesToques().then((p) => vivo && setPerfiles(p));
    const quitarMandos = backend.alCambiarMandos(setMandos);
    const quitarJuego = backend.alCambiarJuego(setActivo);
    return () => {
      vivo = false;
      quitarMandos();
      quitarJuego();
    };
  }, [backend]);

  // Cuenta atras para detectar la ventana activa: da tiempo a cambiar al juego.
  useEffect(() => {
    if (detectando <= 0) return;
    const temporizador = setTimeout(() => {
      if (detectando > 1) {
        setDetectando(detectando - 1);
        return;
      }
      setDetectando(0);
      ejecutar(async () => {
        const v = await backend.ventanaActiva();
        if (!v) throw new Error(t('No se pudo saber qué ventana tiene el foco (en Wayland solo funciona con juegos de XWayland).'));
        setCoincidencia(v.ejecutable || v.clase);
        if (!nombre) setNombre(v.titulo.slice(0, 80) || v.ejecutable);
        return v;
      }, (v) => t('Ventana detectada: {ventana}', { ventana: v.ejecutable || v.clase }));
    }, 1000);
    return () => clearTimeout(temporizador);
  }, [detectando, backend, ejecutar, nombre, t]);

  const mando = mandos.find((m) => m.id === mandoElegido) ?? mandos[0] ?? null;
  const nombreDeGuid = (guid: string) => mandos.find((m) => m.guid === guid)?.nombre;

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-6xl space-y-6">
      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Tarjeta titulo={t('Cambio automático')}>
            {opciones && (
              <Casilla etiqueta={t('Usar la configuración del juego cuando tiene el foco')} marcada={opciones.cambio_automatico}
                onCambiar={(v) => ejecutar(async () => setOpciones(await backend.guardarOpciones({ ...opciones, cambio_automatico: v })))} />
            )}
            <p className="mt-3 text-sm">
              {activo
                ? <span className="rounded-md bg-accent/15 px-2 py-1 font-medium text-accent">🎮 {t('Ahora: {juego}', { juego: activo.nombre })}</span>
                : <span className="text-muted">{t('Ningún juego con foco: se usa la configuración normal de cada mando.')}</span>}
            </p>
          </Tarjeta>

          <Tarjeta titulo={t('Añadir juego')}>
            <form className="space-y-3" onSubmit={(e) => {
              e.preventDefault();
              const juego: Juego = { id: idDeNombre(nombre), nombre: nombre.trim(), coincidencia: coincidencia.trim(), mapeos: {} };
              ejecutar(async () => {
                setJuegos(await backend.guardarJuego(juego));
                setNombre('');
                setCoincidencia('');
              }, () => t('Juego añadido'));
            }}>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted">{t('Nombre')}</span>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} className="input h-9 py-0 text-sm" placeholder="Hollow Knight" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted">{t('Ejecutable o clase de ventana')}</span>
                <input value={coincidencia} onChange={(e) => setCoincidencia(e.target.value)} maxLength={128}
                  className="input h-9 py-0 font-mono text-sm" placeholder="hollow_knight.exe" />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={claseBoton('secundario', 'sm')} disabled={detectando > 0} onClick={() => setDetectando(3)}>
                  {detectando > 0 ? t('Cambia al juego… {n}', { n: detectando }) : t('Detectar ventana activa')}
                </button>
                <button type="submit" className={claseBoton('primario', 'sm')} disabled={!nombre.trim() || !coincidencia.trim()}>{t('Añadir')}</button>
              </div>
            </form>
          </Tarjeta>
        </div>

        <div className="min-w-0 space-y-3">
          {mandos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{t('Mando para copiar:')}</span>
              <select value={mando?.id ?? ''} onChange={(e) => setMandoElegido(Number(e.target.value))} className="input h-8 w-72 py-0 text-sm">
                {mandos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
          )}
          {juegos.length === 0 && (
            <p className="card p-8 text-center text-muted">{t('Aún no hay juegos. Añade uno con el nombre de su ejecutable o detectando su ventana.')}</p>
          )}
          {juegos.map((j) => (
            <section key={j.id} className={`card p-4 ${activo?.id === j.id ? 'border-accent/70' : ''}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 font-semibold">
                    {j.nombre}
                    {activo?.id === j.id && <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs text-accent">{t('Activo')}</span>}
                  </h2>
                  <p className="font-mono text-xs text-muted">{j.coincidencia}</p>
                </div>
                <button type="button" className={claseBoton('secundario', 'sm')} disabled={!mando}
                  title={t('Guarda en este juego la configuración actual del mando elegido')}
                  onClick={() => mando && ejecutar(async () => setJuegos(await backend.copiarAJuego(j.id, mando.id)), () => t('Configuración copiada al juego'))}>
                  {t('Copiar config. del mando')}
                </button>
                <button type="button" className={claseBoton('fantasma', 'sm')}
                  onClick={() => ejecutar(async () => setJuegos(await backend.borrarJuego(j.id)), () => t('Juego borrado'))}>{t('Borrar')}</button>
              </div>
              <ul className="mt-3 space-y-1.5">
                {Object.entries(j.mapeos).length === 0 && <li className="text-sm text-muted">{t('Sin configuraciones: este juego usa la normal de cada mando.')}</li>}
                {Object.entries(j.mapeos).map(([guid, m]) => (
                  <li key={guid} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{nombreDeGuid(guid) ?? m.nombre}</span>
                    <span className="text-xs text-muted">{m.salida === 'toques' ? `→ ${t('Toques')}` : m.salida !== 'ninguna' ? `→ ${NOMBRE_SALIDA[m.salida]}` : t('sin mando virtual')}</span>
                    <span className="text-xs text-muted">{t('{n} acciones · {m} macros', { n: Object.keys(m.acciones).length, m: m.macros.length })}</span>
                    <button type="button" className={claseBoton('fantasma', 'sm')} aria-label={t('Quitar')}
                      onClick={() => ejecutar(async () => setJuegos(await backend.quitarDeJuego(j.id, guid)))}>✕</button>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>{t('Perfil de toques de este juego:')}</span>
                <select className="input h-8 w-72 py-0 text-sm" value={j.perfil_toques ?? ''}
                  onChange={(e) => ejecutar(async () => setJuegos(await backend.guardarJuego({ ...j, perfil_toques: e.target.value || null })))}>
                  <option value="">{t('Ninguno (juego detectado por adb)')}</option>
                  {j.perfil_toques && !perfiles.some((p) => p.id === j.perfil_toques) && <option value={j.perfil_toques}>{j.perfil_toques}</option>}
                  {perfiles.map((p) => <option key={p.id} value={p.id}>{`${nombrePerfil(p)} — ${p.paquete}`}</option>)}
                </select>
              </label>
            </section>
          ))}
          <p className="text-xs text-muted">
            {t('Para editar la configuración de un juego: ajústala en «Mandos» y vuelve a pulsar «Copiar config. del mando». Un juego Android en una ventana (Waydroid, scrcpy) puede llevar su perfil de toques aunque no haya adb.')}
          </p>
        </div>
      </div>

      <section aria-label={t('Toques (juegos Android)')} className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t('Toques (juegos Android)')}</h2>
          <p className="text-sm text-muted">{t('Juega con mando a juegos Android que se ven en el PC (Waydroid, emuladores, scrcpy) con los perfiles de la app y de la comunidad. El destino se elige en Mandos → Salida → Toques.')}</p>
        </div>
        <SeccionToques backend={backend} ejecutar={ejecutar} perfiles={perfiles} onPerfiles={setPerfiles} />
      </section>
      </div>
    </main>
  );
}
