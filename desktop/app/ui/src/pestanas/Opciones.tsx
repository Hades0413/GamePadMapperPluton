import { useEffect, useState } from 'react';
import type { Backend } from '../backend';
import { claseBoton } from '../componentes/boton';
import { Casilla, Tarjeta } from '../componentes/controles';
import type { InfoActualizacion, Opciones, OpcionesApp, Tema } from '../dominio/tipos';
import { useI18n } from '../i18n/contexto';

interface Props {
  backend: Backend;
  ejecutar: <T>(accion: () => Promise<T>, ok?: (r: T) => string) => void;
  /** Avisa a la app de que han cambiado (tema, idioma). */
  onCambio: (o: Opciones) => void;
}

/** Opciones de la app: bandeja, inicio con el sistema, tema, idioma, juegos, atajo, registro y actualizaciones. */
export function PestanaOpciones({ backend, ejecutar, onCambio }: Props) {
  const { t, cambiarIdioma } = useI18n();
  const [o, setO] = useState<OpcionesApp | null>(null);
  const [atajo, setAtajo] = useState('');
  const [registro, setRegistro] = useState<string[]>([]);
  const [actualizacion, setActualizacion] = useState<InfoActualizacion | null | undefined>(undefined);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let vivo = true;
    void backend.obtenerOpciones().then((x) => {
      if (!vivo) return;
      setO(x);
      setAtajo(x.atajo_pausa);
    });
    void backend.leerRegistro().then((r) => vivo && setRegistro(r));
    return () => {
      vivo = false;
    };
  }, [backend]);

  if (!o) return <main className="flex-1" />;

  const guardar = (cambio: Partial<Opciones>, ok?: string) => ejecutar(async () => {
    const nuevas = await backend.guardarOpciones({ ...o, ...cambio });
    setO(nuevas);
    setAtajo(nuevas.atajo_pausa);
    onCambio(nuevas);
    if (cambio.idioma && cambio.idioma !== 'auto') cambiarIdioma(cambio.idioma);
  }, ok === undefined ? undefined : () => ok);

  const temas: { id: Tema; texto: string }[] = [
    { id: 'oscuro', texto: t('Oscuro') }, { id: 'claro', texto: t('Claro') }, { id: 'sistema', texto: t('Del sistema') },
  ];

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
        <Tarjeta titulo={t('Funcionamiento')}>
          <div className="space-y-3">
            <Casilla etiqueta={t('Al cerrar la ventana, seguir en la bandeja')} marcada={o.minimizar_a_bandeja}
              ayuda={t('Los mandos virtuales siguen funcionando con la ventana cerrada.')} onCambiar={(v) => guardar({ minimizar_a_bandeja: v })} />
            <Casilla etiqueta={t('Arrancar con el sistema')} marcada={o.iniciar_con_sistema}
              ayuda={t('Se abre en la bandeja al iniciar sesión.')} onCambiar={(v) => guardar({ iniciar_con_sistema: v })} />
            <Casilla etiqueta={t('Arrancar minimizada en la bandeja')} marcada={o.iniciar_minimizado} onCambiar={(v) => guardar({ iniciar_minimizado: v })} />
            <Casilla etiqueta={t('Cambiar de configuración al cambiar de juego')} marcada={o.cambio_automatico}
              ayuda={t('Pestaña «Juegos».')} onCambiar={(v) => guardar({ cambio_automatico: v })} />
          </div>
        </Tarjeta>

        <Tarjeta titulo={t('Apariencia')}>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs text-muted">{t('Tema')}</p>
              <div className="flex rounded-xl border border-line p-0.5" role="radiogroup" aria-label={t('Tema')}>
                {temas.map((x) => (
                  <button key={x.id} type="button" role="radio" aria-checked={o.tema === x.id} onClick={() => guardar({ tema: x.id })}
                    className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-sm ${o.tema === x.id ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:text-ink'}`}>
                    {x.texto}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs text-muted">{t('Idioma')}</span>
              <select value={o.idioma} onChange={(e) => guardar({ idioma: e.target.value as Opciones['idioma'] })} className="input h-9 py-0 text-sm">
                <option value="auto">{t('El del sistema')}</option>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
        </Tarjeta>

        <Tarjeta titulo={t('Atajo de pausa')}>
          <p className="mb-3 text-sm text-muted">{t('Atajo de teclado global para pausar o reanudar todos los mandos virtuales (también desde la bandeja).')}</p>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => {
            e.preventDefault();
            guardar({ atajo_pausa: atajo.trim() }, atajo.trim() ? t('Atajo guardado') : t('Atajo quitado'));
          }}>
            <input value={atajo} onChange={(e) => setAtajo(e.target.value)} maxLength={40} placeholder="Ctrl+Alt+P"
              aria-label={t('Atajo de pausa')} className="input h-9 w-48 py-0 font-mono text-sm" />
            <button type="submit" className={claseBoton('secundario', 'sm')} disabled={atajo.trim() === o.atajo_pausa}>{t('Guardar')}</button>
          </form>
          <p className="mt-2 text-xs text-muted">{t('Modificadores: Ctrl, Alt, Shift, Super; tecla: letra, número o F1–F12. Vacío = sin atajo.')}</p>
        </Tarjeta>

        <Tarjeta titulo={t('Actualizaciones de la app')}>
          <Casilla etiqueta={t('Buscar actualizaciones al arrancar')} marcada={o.buscar_actualizaciones} onCambiar={(v) => guardar({ buscar_actualizaciones: v })} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={claseBoton('secundario', 'sm')} disabled={buscando} onClick={() => {
              setBuscando(true);
              ejecutar(async () => {
                try {
                  const a = await backend.buscarActualizacion();
                  setActualizacion(a);
                  return a;
                } finally {
                  setBuscando(false);
                }
              }, (a) => (a ? t('Hay una versión nueva: {v}', { v: a.version }) : t('Ya tienes la última versión')));
            }}>
              {buscando ? t('Buscando…') : t('Buscar ahora')}
            </button>
            {actualizacion && (
              <button type="button" className={claseBoton('primario', 'sm')}
                onClick={() => ejecutar(() => backend.instalarActualizacion(), () => t('Instalando… la app se reiniciará'))}>
                {t('Instalar {v} y reiniciar', { v: actualizacion.version })}
              </button>
            )}
            {actualizacion === null && <span className="text-sm text-success">{t('Ya tienes la última versión')}</span>}
          </div>
          {actualizacion?.notas && <p className="mt-2 max-h-24 overflow-y-auto text-xs whitespace-pre-line text-muted">{actualizacion.notas}</p>}
          <p className="mt-3 text-xs text-muted">{t('Las actualizaciones están firmadas y se comprueban antes de instalarlas. En Linux se actualiza sola la AppImage; el .deb, descargándolo de nuevo.')}</p>
        </Tarjeta>

        <Tarjeta titulo={t('Registro')} className="lg:col-span-2" extra={
          <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => ejecutar(async () => setRegistro(await backend.leerRegistro()))}>
            {t('Actualizar')}
          </button>
        }>
          <Casilla etiqueta={t('Guardar el registro en un archivo')} marcada={o.registro}
            ayuda={o.ruta_registro ?? undefined} onCambiar={(v) => guardar({ registro: v })} />
          <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-bg p-3 font-mono text-[11px] leading-relaxed text-muted select-text">
            {registro.length > 0 ? registro.join('\n') : t('Sin mensajes todavía.')}
          </pre>
        </Tarjeta>
      </div>
    </main>
  );
}
