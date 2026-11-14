import { useEffect, useRef, useState } from 'react';
import type { Backend } from '../backend';
import { claseBoton } from '../componentes/boton';
import { Casilla, Tarjeta } from '../componentes/controles';
import { VistaPreviaPerfil } from '../componentes/VistaPreviaPerfil';
import { nombrePerfil, paqueteValido } from '../dominio/configuracion';
import { ERROR } from '../dominio/errores';
import type { ConfigToques, DispositivoAdb, PerfilComunidad, PerfilLocal, VistaPerfil, VistaToques } from '../dominio/tipos';
import { useT } from '../i18n/contexto';

/** Tamano maximo de un perfil que se lee de archivo (el nucleo lo vuelve a validar: 16 KB). */
const MAX_ARCHIVO_PERFIL = 64 * 1024;

interface Props {
  backend: Backend;
  ejecutar: <T>(accion: () => Promise<T>, ok?: (r: T) => string) => void;
  perfiles: PerfilLocal[];
  onPerfiles: (p: PerfilLocal[]) => void;
}

/**
 * Toques en juegos Android: juego detectado por adb, perfil en uso (o fijado a mano) y los
 * perfiles guardados: importar de archivo, descargar de la comunidad, ver y borrar.
 */
export function SeccionToques({ backend, ejecutar, perfiles, onPerfiles }: Props) {
  const t = useT();
  const [estado, setEstado] = useState<VistaToques | null>(null);
  const [config, setConfig] = useState<ConfigToques | null>(null);
  const [dispositivos, setDispositivos] = useState<DispositivoAdb[] | null>(null);
  const [vista, setVista] = useState<VistaPerfil | null>(null);
  // null: sigue al juego detectado hasta que se escriba otro.
  const [paqueteEscrito, setPaquete] = useState<string | null>(null);
  const [comunidad, setComunidad] = useState<PerfilComunidad[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [elegidoComunidad, setElegidoComunidad] = useState<string | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    const refrescar = () => void backend.estadoToques().then((e) => vivo && setEstado(e)).catch(() => undefined);
    refrescar();
    void backend.configToques().then((c) => vivo && setConfig(c));
    const temporizador = setInterval(refrescar, 1000);
    return () => {
      vivo = false;
      clearInterval(temporizador);
    };
  }, [backend]);

  const paquete = paqueteEscrito ?? estado?.paquete ?? '';

  const guardarConfig = (c: ConfigToques) => ejecutar(async () => setConfig(await backend.guardarConfigToques(c)));
  const buscarDispositivos = () => ejecutar(async () => setDispositivos(await backend.dispositivosAdb()));
  const buscarComunidad = () => {
    setBuscando(true);
    ejecutar(async () => {
      try {
        const r = await backend.buscarComunidadToques(paquete.trim());
        setComunidad(r);
        setElegidoComunidad(r[0]?.id ?? null);
        return r;
      } finally {
        setBuscando(false);
      }
    }, (r) => t('{n} perfiles de la comunidad', { n: r.length }));
  };
  const importar = (texto: string) => ejecutar(async () => {
    const p = await backend.importarPerfilToques(texto);
    onPerfiles(await backend.perfilesToques());
    return p;
  }, (p) => t('Perfil «{nombre}» guardado', { nombre: nombrePerfil(p) }));

  const porPaquete = new Map<string, PerfilLocal[]>();
  for (const p of perfiles) porPaquete.set(p.paquete, [...(porPaquete.get(p.paquete) ?? []), p]);
  const enUso = estado?.perfil?.id ?? null;
  const delComunidad = comunidad?.find((c) => c.id === elegidoComunidad) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <Tarjeta titulo={t('Juego Android detectado')}>
          <div className="space-y-3 text-sm">
            {config && (
              <Casilla etiqueta={t('Detectar el juego por adb (Waydroid, emuladores)')} marcada={config.adb}
                ayuda={t('Cada 2 s mira qué app está en primer plano y usa su perfil de toques.')}
                onCambiar={(v) => guardarConfig({ ...config, adb: v })} />
            )}
            {config?.adb && (
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label={t('Dispositivo adb')} className="input h-8 min-w-0 flex-1 py-0 text-sm" value={config.dispositivo ?? ''}
                  onChange={(e) => guardarConfig({ ...config, dispositivo: e.target.value || null })}>
                  <option value="">{t('El primero disponible')}</option>
                  {config.dispositivo && !dispositivos?.some((d) => d.serie === config.dispositivo) && <option value={config.dispositivo}>{config.dispositivo}</option>}
                  {(dispositivos ?? []).map((d) => (
                    <option key={d.serie} value={d.serie} disabled={d.estado !== 'device'}>
                      {`${d.modelo ?? d.serie} (${d.serie})${d.estado !== 'device' ? ` — ${d.estado}` : ''}`}
                    </option>
                  ))}
                </select>
                <button type="button" className={claseBoton('secundario', 'sm')} onClick={buscarDispositivos}>{t('Buscar')}</button>
              </div>
            )}
            <div className="min-w-0 space-y-1">
              {estado?.paquete
                ? <p className="truncate"><span className="rounded-md bg-accent/15 px-2 py-1 font-mono text-xs font-medium text-accent">{estado.paquete}</span></p>
                : <p className="text-muted">{estado?.error_adb ? t(estado.error_adb) : t('Ningún juego Android detectado.')}</p>}
              {estado?.dispositivo && <p className="truncate text-xs text-muted">{estado.dispositivo.modelo ?? estado.dispositivo.serie} · {estado.dispositivo.serie}</p>}
            </div>
            {estado?.error_adb === ERROR.adbSin && (
              <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => ejecutar(() => backend.abrirEnlace('platform_tools'))}>
                {t('Descargar Android platform-tools')}
              </button>
            )}
            <p className="text-xs text-muted">
              {t('Waydroid: «adb connect» a la IP que muestra «waydroid status» (puerto 5555). Emuladores: aparecen solos en adb.')}
            </p>
          </div>
        </Tarjeta>

        <Tarjeta titulo={t('Perfil en uso')}>
          <div className="space-y-3 text-sm">
            <p>
              {estado?.perfil
                ? <><span className="font-semibold">{nombrePerfil(estado.perfil)}</span> <span className="font-mono text-xs text-muted">{estado.perfil.paquete}</span></>
                : <span className="text-muted">{t('Ninguno: elige uno o abre un juego que tenga perfil.')}</span>}
              {estado?.origen && <span className="ml-2 inline-block whitespace-nowrap rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
                {{ fijo: t('elegido a mano'), juego: t('del juego (ventana)'), detectado: t('juego detectado') }[estado.origen]}
              </span>}
            </p>
            {config && (
              <label className="block text-xs text-muted">
                <span className="mb-1 block">{t('Fijar a mano (manda sobre el juego detectado)')}</span>
                <select className="input h-8 py-0 text-sm" value={config.fijo ?? ''}
                  onChange={(e) => guardarConfig({ ...config, fijo: e.target.value || null })}>
                  <option value="">{t('Automático')}</option>
                  {perfiles.map((p) => <option key={p.id} value={p.id}>{`${nombrePerfil(p)} — ${p.paquete}`}</option>)}
                </select>
              </label>
            )}
            {estado && (
              <p className="text-xs text-muted">
                {estado.mando === null ? t('Ningún mando usa los toques: elige «Toques» en la pestaña Salida de un mando.')
                  : estado.mapeando ? t('Tocando ahora.') : estado.pausado ? t('Toques en pausa') : t('Toques preparados, sin tocar todavía.')}
              </p>
            )}
          </div>
        </Tarjeta>
      </div>

      <div className="min-w-0 space-y-4">
        <Tarjeta titulo={t('Perfiles de toques')} extra={
          <div className="flex flex-wrap gap-2">
            <button type="button" className={claseBoton('secundario', 'sm')} onClick={() => archivo.current?.click()}>{t('Importar archivo .conf')}</button>
            <input ref={archivo} type="file" accept=".conf,.txt,text/plain" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (f.size > MAX_ARCHIVO_PERFIL) {
                ejecutar(async () => { throw new Error(ERROR.perfilGrande); });
                return;
              }
              void f.text().then(importar);
            }} />
          </div>}>
          {perfiles.length === 0 && <p className="text-sm text-muted">{t('Aún no hay perfiles. Impórtalos de un archivo o descárgalos de la comunidad.')}</p>}
          <ul className="space-y-3">
            {[...porPaquete.entries()].map(([paq, lista]) => (
              <li key={paq}>
                <p className="mb-1 font-mono text-xs text-muted">{paq}</p>
                <ul className="space-y-1.5">
                  {lista.map((p) => {
                    const elegido = config?.elegidos[paq] === p.id;
                    return (
                      <li key={p.id} className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${enUso === p.id ? 'bg-accent/10 ring-1 ring-accent/50' : 'bg-surface-2/60'}`}>
                        <span className="min-w-0 flex-1 truncate font-medium">{nombrePerfil(p)}</span>
                        {enUso === p.id && <span className="rounded bg-accent/15 px-1.5 py-0.5 text-xs text-accent">{t('En uso')}</span>}
                        <span className="text-xs text-muted">{t('{n} botones · {w}×{h}', { n: p.botones, w: p.pantalla[0], h: p.pantalla[1] })}</span>
                        <button type="button" className={claseBoton('fantasma', 'sm')} aria-pressed={vista?.id === p.id}
                          onClick={() => (vista?.id === p.id ? setVista(null) : ejecutar(async () => setVista(await backend.verPerfilToques(p.id))))}>
                          {t('Ver')}
                        </button>
                        {config && (
                          <button type="button" className={claseBoton(elegido ? 'primario' : 'secundario', 'sm')} disabled={elegido}
                            title={t('Usar este perfil cuando se detecte este juego')}
                            onClick={() => guardarConfig({ ...config, elegidos: { ...config.elegidos, [paq]: p.id } })}>
                            {elegido ? t('Elegido para el juego') : t('Usar para este juego')}
                          </button>
                        )}
                        <button type="button" className={claseBoton('fantasma', 'sm')} aria-label={t('Borrar')}
                          onClick={() => ejecutar(async () => {
                            onPerfiles(await backend.borrarPerfilToques(p.id));
                            if (vista?.id === p.id) setVista(null);
                            setConfig(await backend.configToques());
                          }, () => t('Perfil borrado'))}>✕</button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
          {vista && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-muted">{t('Vista previa: {nombre}', { nombre: nombrePerfil(vista) })}</p>
              <VistaPreviaPerfil pantalla={vista.pantalla} lista={vista.lista} className="max-h-72" />
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo={t('Descargar de la comunidad')} extra={<p className="text-xs text-muted">{t('Perfiles publicados en la web, ordenados por «me gusta».')}</p>}>
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
            e.preventDefault();
            buscarComunidad();
          }}>
            <input value={paquete} onChange={(e) => setPaquete(e.target.value)} maxLength={160} aria-label={t('Paquete del juego')}
              placeholder="com.supercell.clashroyale" className="input h-9 min-w-0 flex-1 py-0 font-mono text-sm" />
            <button type="submit" className={claseBoton('primario', 'sm')} disabled={buscando || !paqueteValido(paquete.trim())}>
              {buscando ? t('Buscando…') : t('Descargar de la comunidad')}
            </button>
          </form>
          {comunidad && comunidad.length === 0 && <p className="mt-3 text-sm text-muted">{t('No hay perfiles publicados para ese juego todavía.')}</p>}
          {comunidad && comunidad.length > 0 && (
            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <ul className="space-y-1.5">
                {comunidad.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setElegidoComunidad(c.id)} aria-pressed={c.id === elegidoComunidad}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${c.id === elegidoComunidad ? 'bg-primary/15 ring-1 ring-primary/50' : 'bg-surface-2/60 hover:bg-surface-2'}`}>
                      <span className="min-w-0 flex-1 truncate font-medium">{c.titulo}</span>
                      <span className="text-xs text-muted">♥ {c.me_gusta}</span>
                      <span className="text-xs text-muted">{t('{n} botones', { n: c.lista.length })}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {delComunidad && (
                <div className="space-y-2">
                  <VistaPreviaPerfil pantalla={delComunidad.pantalla} lista={delComunidad.lista} />
                  <button type="button" className={claseBoton('primario', 'sm')}
                    onClick={() => importar(delComunidad.conf)}>
                    {t('Guardar en mis perfiles')}
                  </button>
                </div>
              )}
            </div>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
