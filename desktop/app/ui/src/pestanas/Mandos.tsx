import { useRef, useState } from 'react';
import type { Backend } from '../backend';
import { claseBoton } from '../componentes/boton';
import { DialogoTexto } from '../componentes/DialogoTexto';
import {
  IconoAuto, IconoCopiar, IconoDeshacer, IconoGuardar, IconoMando, IconoSubir, IconoVarita, IconoVibrar,
} from '../componentes/iconos';
import { ListaMandos } from '../componentes/ListaMandos';
import { PanelAsistente } from '../componentes/PanelAsistente';
import { LIMITES, NOMBRE_SALIDA } from '../dominio/configuracion';
import { ERROR } from '../dominio/errores';
import type { Control, EstadoMapeo, MapeoMando, OrigenMapeo } from '../dominio/tipos';
import { enlaceInicial } from '../hooks/enlaceInicial';
import { useMandoActivo, useMandos } from '../hooks/useMandos';
import { useT } from '../i18n/contexto';
import { Botones } from './mando/Botones';
import type { PropsSeccion, SubPestana } from './mando/comun';
import { Cruceta } from './mando/Cruceta';
import { Extras } from './mando/Extras';
import { Gatillos } from './mando/Gatillos';
import { General } from './mando/General';
import { Macros } from './mando/Macros';
import { Salida } from './mando/Salida';
import { Stick } from './mando/Stick';
import { Vibracion } from './mando/Vibracion';

/** Tamano maximo de un archivo de mandos (igual que MAX_ANADIR en src-tauri/src/comandos.rs). */
const MAX_ARCHIVO = 4 * 1024 * 1024;

type Dialogo = 'sdl' | 'preset' | null;

interface Props {
  backend: Backend;
  ejecutar: <T>(accion: () => Promise<T>, ok?: (r: T) => string) => void;
}

/** Descarga un texto como archivo (sin permisos especiales: un enlace temporal). */
function descargar(nombre: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function PestanaMandos({ backend, ejecutar }: Props) {
  const t = useT();
  const { mandos, activo, elegir, app, refrescarApp } = useMandos(backend);
  const { estado, setEstado, vivo } = useMandoActivo(backend, activo);
  const [seleccionado, setSeleccionado] = useState<Control | null>(null);
  const [sub, setSub] = useState<SubPestana>(() => (enlaceInicial().sub as SubPestana | undefined) ?? 'general');
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [presetPegado, setPresetPegado] = useState('');
  const archivoPreset = useRef<HTMLInputElement>(null);
  const info = mandos.find((m) => m.id === activo) ?? null;
  const asistente = vivo?.asistente ?? null;

  /** Acciones que devuelven el mapeo nuevo: lo muestra. */
  const conMapeo = (accion: () => Promise<EstadoMapeo>, ok?: string) =>
    ejecutar(async () => setEstado(await accion()), ok === undefined ? undefined : () => ok);

  const anadirMandos = (archivo: File) => ejecutar(async () => {
    // Limite tambien en el backend; aqui evita leer en memoria un archivo enorme.
    if (archivo.size > MAX_ARCHIVO) throw new Error(ERROR.archivoGrande);
    return backend.anadirMandos(await archivo.text());
  }, (n) => {
    void refrescarApp();
    return t('{n} mandos añadidos a la base de datos', { n });
  });
  const actualizarBase = () => ejecutar(() => backend.actualizarBase(), (r) => {
    void refrescarApp();
    const nuevos = r.despues - r.antes;
    const base = nuevos > 0 ? t('Base actualizada: {n} mandos nuevos', { n: nuevos }) : t('La base ya estaba al día');
    return r.comunidad === null ? base : `${base} · ${t('{n} de la comunidad', { n: r.comunidad })}`;
  });

  if (!info) {
    return (
      <main className="grid min-h-0 flex-1 grid-cols-[13rem_1fr] xl:grid-cols-[16rem_1fr]">
        <ListaMandos mandos={mandos} activo={null} app={app} onElegir={elegir} onAnadirMandos={anadirMandos} onActualizarBase={actualizarBase} />
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-muted">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-primary"><IconoMando /></span>
          <p className="text-lg font-medium text-ink">{t('No hay ningún mando conectado')}</p>
          <p className="max-w-md text-sm">{t('En Linux hace falta permiso para leer /dev/input (grupo «input»). Mira desktop/linux/instalar-permisos.sh.')}</p>
        </div>
      </main>
    );
  }

  const id = info.id;
  const editar = (cambio: (m: MapeoMando) => MapeoMando) => {
    if (!estado) return;
    const nuevo = cambio(estado.mapeo);
    setEstado({ ...estado, mapeo: nuevo, origen: 'manual', sin_guardar: true });
    conMapeo(() => backend.editarMapeo(id, nuevo));
  };

  const origen: Record<OrigenMapeo, string> = {
    guardado: t('Guardado'),
    basedatos: t('SDL GameControllerDB'),
    heuristica: t('Detección automática'),
    asistente: t('Asistente'),
    manual: t('Editado'),
  };
  const subpestanas: { id: SubPestana; texto: string; cuenta?: number | undefined }[] = [
    { id: 'general', texto: t('General') },
    { id: 'botones', texto: t('Botones') },
    { id: 'cruceta', texto: t('Cruceta') },
    { id: 'gatillos', texto: t('Gatillos') },
    { id: 'stick_izquierdo', texto: t('Stick izquierdo') },
    { id: 'stick_derecho', texto: t('Stick derecho') },
    { id: 'extras', texto: t('Botones extra'), cuenta: estado?.extras.filter((e) => e.startsWith('b')).length },
    { id: 'macros', texto: t('Macros'), cuenta: estado?.mapeo.macros.length },
    { id: 'vibracion', texto: t('Vibración') },
    { id: 'salida', texto: t('Salida') },
  ];
  const salida = vivo?.salida;

  const props: PropsSeccion | null = estado && {
    backend, info, estado, vivo, editar, ejecutar, seleccionado, onSeleccionar: setSeleccionado,
  };

  return (
    <main className="grid min-h-0 flex-1 grid-cols-[13rem_1fr] xl:grid-cols-[16rem_1fr]">
      <ListaMandos mandos={mandos} activo={id} app={app} onElegir={elegir} onAnadirMandos={anadirMandos} onActualizarBase={actualizarBase} />

      <div className="min-h-0 space-y-4 overflow-y-auto p-4">
        <section className="card space-y-3 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-lg font-semibold">{info.nombre}</h1>
                {estado && <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">{origen[estado.origen]}</span>}
                {estado?.sin_guardar && <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">{t('Sin guardar')}</span>}
                {salida && salida.tipo !== 'ninguna' && (
                  <button type="button" onClick={() => setSub('salida')}
                    className={`cursor-pointer rounded-md px-2 py-0.5 text-xs font-medium ${salida.activa ? 'bg-success/15 text-success' : salida.error ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-muted'}`}>
                    → {NOMBRE_SALIDA[salida.tipo]} {salida.activa ? '✓' : salida.error ? '✗' : '⏸'}
                  </button>
                )}
                {vivo?.juego && (
                  <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent" title={t('Se usa la configuración de este juego')}>
                    🎮 {vivo.juego}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-muted" title={info.guid}>{info.guid} · {info.ruta}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={claseBoton('fantasma')}
                onClick={() => conMapeo(() => backend.restablecerMapeo(id), t('Mapeo restablecido'))}>
                <IconoDeshacer />{t('Restablecer')}
              </button>
              <button type="button" className={claseBoton(estado?.sin_guardar ? 'primario' : 'secundario')} disabled={!estado?.sin_guardar}
                onClick={() => ejecutar(() => backend.guardarMapeo(id), (r) => {
                  setEstado(r.estado);
                  return t('Guardado en {ruta}', { ruta: r.ruta });
                })}>
                <IconoGuardar />{t('Guardar')}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button type="button" className={claseBoton('primario', 'sm')} disabled={!!asistente}
              onClick={() => { setSeleccionado(null); setSub('general'); ejecutar(() => backend.asistenteIniciar(id)); }}>
              <IconoVarita />{t('Asignar todo')}
            </button>
            <button type="button" className={claseBoton('secundario', 'sm')} onClick={() => conMapeo(() => backend.autoMapear(id), t('Mapeo automático aplicado (sin guardar)'))}>
              <IconoAuto />{t('Automático')}
            </button>
            <button type="button" className={claseBoton('secundario', 'sm')} disabled={!info.vibracion}
              title={info.vibracion ? undefined : t('Este mando no tiene vibración')}
              onClick={() => ejecutar(() => backend.probarVibracion(id), () => t('Vibrando…'))}>
              <IconoVibrar />{t('Vibración')}
            </button>
            <span className="ml-auto flex flex-wrap gap-1" role="group" aria-label={t('Presets')}>
              <button type="button" className={claseBoton('fantasma', 'sm')} title={t('Copia toda la configuración del mando (JSON)')}
                onClick={() => ejecutar(async () => navigator.clipboard.writeText(await backend.exportarConfig(id)), () => t('Configuración copiada'))}>
                <IconoCopiar />{t('Copiar')}
              </button>
              <button type="button" className={claseBoton('fantasma', 'sm')} title={t('Pega una configuración copiada (de este u otro mando)')}
                onClick={() => {
                  // Se intenta leer el portapapeles para rellenar el dialogo; si no hay permiso, se pega a mano.
                  void navigator.clipboard?.readText?.().then((txt) => setPresetPegado(txt.slice(0, LIMITES.presetBytes))).catch(() => setPresetPegado(''))
                    .finally(() => setDialogo('preset'));
                }}>
                <IconoSubir />{t('Pegar')}
              </button>
              <button type="button" className={claseBoton('fantasma', 'sm')}
                onClick={() => ejecutar(async () => descargar(`gamepad-mapper-${info.guid}.json`, await backend.exportarConfig(id)), () => t('Configuración guardada en un archivo'))}>
                <IconoGuardar />{t('Guardar archivo')}
              </button>
              <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => archivoPreset.current?.click()}>
                <IconoSubir />{t('Cargar archivo')}
              </button>
              <input ref={archivoPreset} type="file" accept=".json,application/json" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) conMapeo(async () => {
                    if (f.size > LIMITES.presetBytes) throw new Error(ERROR.validacionGrande);
                    return backend.importarConfig(id, await f.text());
                  }, t('Configuración cargada (sin guardar)'));
                }} />
              <span className="mx-1 w-px self-stretch bg-line" />
              <button type="button" className={claseBoton('fantasma', 'sm')} title={t('Copia el mapeo en formato SDL')}
                onClick={() => ejecutar(async () => navigator.clipboard.writeText(await backend.exportarSdl(id)), () => t('Línea SDL copiada al portapapeles'))}>
                {t('SDL')} ↗
              </button>
              <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => setDialogo('sdl')}>{t('SDL')} ↙</button>
              <button type="button" className={claseBoton('fantasma', 'sm')}
                title={t('Abre la web con este mando listo para enviarlo; se publica cuando lo aprueba la moderación')}
                onClick={() => ejecutar(() => backend.enviarAComunidad(id), () => t('Abriendo la web…'))}>
                {t('Enviar a la comunidad')}
              </button>
            </span>
          </div>
        </section>

        {asistente && (
          <PanelAsistente info={info} vista={asistente}
            onAtras={() => ejecutar(() => backend.asistenteAtras(id))}
            onSaltar={() => ejecutar(() => backend.asistenteSaltar(id))}
            onCancelar={() => ejecutar(() => backend.asistenteCancelar(id))}
            onAplicar={() => conMapeo(() => backend.asistenteAplicar(id), t('Mapeo del asistente aplicado (sin guardar)'))} />
        )}

        <nav role="tablist" aria-label={t('Configuración del mando')} className="flex gap-1 overflow-x-auto border-b border-line">
          {subpestanas.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={sub === p.id} onClick={() => setSub(p.id)}
              className={`-mb-px shrink-0 cursor-pointer border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${sub === p.id
                ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {p.texto}
              {!!p.cuenta && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{p.cuenta}</span>}
            </button>
          ))}
        </nav>

        {props && (
          <div role="tabpanel">
            {sub === 'general' && <General {...props} />}
            {sub === 'botones' && <Botones {...props} />}
            {sub === 'cruceta' && <Cruceta {...props} />}
            {sub === 'gatillos' && <Gatillos {...props} />}
            {sub === 'stick_izquierdo' && <Stick {...props} lado="stick_izquierdo" />}
            {sub === 'stick_derecho' && <Stick {...props} lado="stick_derecho" />}
            {sub === 'extras' && <Extras {...props} />}
            {sub === 'macros' && <Macros key={id} {...props} />}
            {sub === 'vibracion' && <Vibracion {...props} />}
            {sub === 'salida' && <Salida {...props} />}
          </div>
        )}
      </div>

      {dialogo === 'sdl' && (
        <DialogoTexto titulo={t('Importar línea SDL')} boton={t('Importar')} maximo={4096}
          explicacion={t('Pega una línea de gamecontrollerdb.txt (GUID,nombre,a:b0,...). Se usará con este mando aunque el GUID sea otro.')}
          marcador="030000005e0400008e02000014010000,Xbox 360 Controller,a:b0,b:b1,..."
          onCerrar={() => setDialogo(null)}
          onAceptar={(linea) => {
            setDialogo(null);
            conMapeo(() => backend.importarSdl(id, linea), t('Línea SDL importada (sin guardar)'));
          }} />
      )}
      {dialogo === 'preset' && (
        <DialogoTexto titulo={t('Pegar configuración')} boton={t('Aplicar')} maximo={LIMITES.presetBytes} textoInicial={presetPegado}
          explicacion={t('Pega una configuración copiada con «Copiar» (JSON, 1 MB como mucho). Se aplica a este mando sin guardar.')}
          marcador='{"version":2,"asignaciones":{...}}'
          onCerrar={() => setDialogo(null)}
          onAceptar={(texto) => {
            setDialogo(null);
            conMapeo(() => backend.importarConfig(id, texto), t('Configuración aplicada (sin guardar)'));
          }} />
      )}
    </main>
  );
}
