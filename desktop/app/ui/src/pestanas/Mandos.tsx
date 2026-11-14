import { useCallback, useEffect, useState } from 'react';
import type { Backend } from '../backend';
import { AjustesSticks } from '../componentes/AjustesSticks';
import { Asignaciones } from '../componentes/Asignaciones';
import { claseBoton } from '../componentes/boton';
import { DiagramaMando } from '../componentes/DiagramaMando';
import { DialogoImportar } from '../componentes/DialogoImportar';
import { IconoAuto, IconoCopiar, IconoDeshacer, IconoGuardar, IconoMando, IconoSubir, IconoVarita, IconoVibrar } from '../componentes/iconos';
import { ListaMandos } from '../componentes/ListaMandos';
import { PanelAsistente } from '../componentes/PanelAsistente';
import { PanelEnVivo } from '../componentes/PanelEnVivo';
import { conAsignacion } from '../dominio/mapeo';
import type { AjusteStick, Control, EstadoMapeo, MapeoMando, OrigenMapeo } from '../dominio/tipos';
import { useMandoActivo, useMandos } from '../hooks/useMandos';
import { useT } from '../i18n/contexto';

interface Aviso {
  texto: string;
  error: boolean;
}

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PestanaMandos({ backend }: { backend: Backend }) {
  const t = useT();
  const { mandos, activo, elegir, app, refrescarApp } = useMandos(backend);
  const { estado, setEstado, vivo } = useMandoActivo(backend, activo);
  const [seleccionado, setSeleccionado] = useState<Control | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [importando, setImportando] = useState(false);
  const info = mandos.find((m) => m.id === activo) ?? null;
  const asistente = vivo?.asistente ?? null;

  useEffect(() => {
    if (!aviso) return;
    const temporizador = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  /** Ejecuta una accion del backend y avisa del resultado (o del error). */
  const ejecutar = useCallback(async <T,>(accion: () => Promise<T>, ok?: (r: T) => string) => {
    try {
      const r = await accion();
      if (ok) setAviso({ texto: ok(r), error: false });
    } catch (e) {
      setAviso({ texto: t(mensajeDe(e)), error: true });
    }
  }, [t]);

  /** Igual, para las acciones que devuelven el mapeo nuevo: lo muestra. */
  const conMapeo = (accion: () => Promise<EstadoMapeo>, ok?: string) =>
    void ejecutar(async () => setEstado(await accion()), ok === undefined ? undefined : () => ok);

  const cargarBaseDatos = (texto: string) => void ejecutar(() => backend.cargarBaseDatos(texto), (n) => {
    void refrescarApp();
    return t('{n} mandos añadidos a la base de datos', { n });
  });

  if (!info) {
    return (
      <main className="grid min-h-0 flex-1 grid-cols-[13rem_1fr] xl:grid-cols-[16rem_1fr]">
        <ListaMandos mandos={mandos} activo={null} app={app} onElegir={elegir} onCargarBaseDatos={cargarBaseDatos} />
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-muted">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-primary"><IconoMando /></span>
          <p className="text-lg font-medium text-ink">{t('No hay ningún mando conectado')}</p>
          <p className="max-w-md text-sm">{t('En Linux hace falta permiso para leer /dev/input (grupo «input»). Mira desktop/linux/instalar-permisos.sh.')}</p>
        </div>
      </main>
    );
  }

  const id = info.id;
  const mapeo = estado?.mapeo ?? null;
  const editar = (cambio: (m: MapeoMando) => MapeoMando) => {
    if (!mapeo || !estado) return;
    const nuevo = cambio(mapeo);
    setEstado({ ...estado, mapeo: nuevo, origen: 'manual', sin_guardar: true });
    conMapeo(() => backend.editarMapeo(id, nuevo));
  };
  const asignar = (c: Control, fuente: string | null) =>
    editar((m) => ({ ...m, asignaciones: conAsignacion(m.asignaciones, c, fuente) }));
  const ajustarStick = (lado: 'stick_izquierdo' | 'stick_derecho', a: AjusteStick) => editar((m) => ({ ...m, [lado]: a }));

  const origen: Record<OrigenMapeo, string> = {
    guardado: t('Guardado'),
    basedatos: t('SDL GameControllerDB'),
    heuristica: t('Detección automática'),
    asistente: t('Asistente'),
    manual: t('Editado'),
  };

  return (
    <main className="grid min-h-0 flex-1 grid-cols-[13rem_1fr] xl:grid-cols-[16rem_1fr]">
      <ListaMandos mandos={mandos} activo={id} app={app} onElegir={elegir} onCargarBaseDatos={cargarBaseDatos} />

      <div className="min-h-0 space-y-4 overflow-y-auto p-4">
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold">{info.nombre}</h1>
                {estado && <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{origen[estado.origen]}</span>}
                {estado?.sin_guardar && <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">{t('Sin guardar')}</span>}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-muted" title={info.guid}>{info.guid} · {info.ruta}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={claseBoton('fantasma')}
                onClick={() => conMapeo(() => backend.restablecerMapeo(id), t('Mapeo restablecido'))}>
                <IconoDeshacer />{t('Restablecer')}
              </button>
              <button type="button" className={claseBoton(estado?.sin_guardar ? 'primario' : 'secundario')} disabled={!estado?.sin_guardar}
                onClick={() => void ejecutar(() => backend.guardarMapeo(id), (r) => {
                  setEstado(r.estado);
                  return t('Guardado en {ruta}', { ruta: r.ruta });
                })}>
                <IconoGuardar />{t('Guardar')}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className={claseBoton('primario')} disabled={!!asistente}
              onClick={() => { setSeleccionado(null); void ejecutar(() => backend.asistenteIniciar(id)); }}>
              <IconoVarita />{t('Asignar todo')}
            </button>
            <button type="button" className={claseBoton()} onClick={() => conMapeo(() => backend.autoMapear(id), t('Mapeo automático aplicado (sin guardar)'))}>
              <IconoAuto />{t('Automático')}
            </button>
            <button type="button" className={claseBoton()} disabled={!info.vibracion}
              title={info.vibracion ? undefined : t('Este mando no tiene vibración')}
              onClick={() => void ejecutar(() => backend.probarVibracion(id), () => t('Vibrando…'))}>
              <IconoVibrar />{t('Vibración')}
            </button>
            <span className="ml-auto flex gap-1">
              <button type="button" className={claseBoton('fantasma', 'sm')} title={t('Copia el mapeo en formato SDL')}
                onClick={() => void ejecutar(async () => {
                  const linea = await backend.exportarSdl(id);
                  await navigator.clipboard.writeText(linea);
                }, () => t('Línea SDL copiada al portapapeles'))}>
                <IconoCopiar />{t('Exportar SDL')}
              </button>
              <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => setImportando(true)}>
                <IconoSubir />{t('Importar SDL')}
              </button>
            </span>
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-4">
            {asistente && (
              <PanelAsistente info={info} vista={asistente}
                onAtras={() => void ejecutar(() => backend.asistenteAtras(id))}
                onSaltar={() => void ejecutar(() => backend.asistenteSaltar(id))}
                onCancelar={() => void ejecutar(() => backend.asistenteCancelar(id))}
                onAplicar={() => conMapeo(() => backend.asistenteAplicar(id), t('Mapeo del asistente aplicado (sin guardar)'))} />
            )}
            <section className="card p-4" aria-label={t('Mando')}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">{t('Mando estándar (compatible con XInput)')}</h2>
                <p className="text-xs text-muted">{t('Pulsa un control del dibujo para elegir su entrada.')}</p>
              </div>
              <div className="mx-auto max-w-[40rem]">
                <DiagramaMando estado={vivo?.estandar ?? null} seleccionado={seleccionado}
                  pedido={asistente?.paso ?? null} asignados={asistente ? asistente.asignaciones : (mapeo?.asignaciones ?? {})}
                  onElegir={setSeleccionado} />
              </div>
            </section>
            {mapeo && (
              <Asignaciones info={info} mapeo={mapeo} crudo={vivo?.crudo ?? null} seleccionado={seleccionado}
                onElegir={setSeleccionado} onAsignar={asignar} />
            )}
          </div>
          <div className="min-w-0 space-y-4">
            <PanelEnVivo info={info} crudo={vivo?.crudo ?? null} ruidosos={asistente?.ejes_ruidosos ?? []} />
            {mapeo && <AjustesSticks mapeo={mapeo} crudo={vivo?.crudo ?? null} estandar={vivo?.estandar ?? null} onCambiar={ajustarStick} />}
          </div>
        </div>
      </div>

      {importando && (
        <DialogoImportar onCerrar={() => setImportando(false)}
          onImportar={(linea) => {
            setImportando(false);
            conMapeo(() => backend.importarSdl(id, linea), t('Línea SDL importada (sin guardar)'));
          }} />
      )}

      {aviso && (
        <div role="status" className={`fixed right-4 bottom-4 z-50 max-w-md rounded-xl border px-4 py-3 text-sm shadow-xl shadow-black/40 ${aviso.error
          ? 'border-danger/50 bg-surface text-danger' : 'border-line bg-surface text-ink'}`}>
          {aviso.texto}
        </div>
      )}
    </main>
  );
}
