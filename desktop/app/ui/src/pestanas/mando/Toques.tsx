import { useCallback, useEffect, useState } from 'react';
import { claseBoton } from '../../componentes/boton';
import { Casilla, Tarjeta } from '../../componentes/controles';
import { nombrePerfil } from '../../dominio/configuracion';
import type { DestinoToques, Rect, VentanaAbierta, VistaToques } from '../../dominio/tipos';
import { useT } from '../../i18n/contexto';
import type { PropsSeccion } from './comun';

const RECT_DEFECTO: Rect = { x: 0, y: 0, ancho: 1280, alto: 720 };

/** Hook: estado de los toques, consultado cada segundo mientras se ve. */
function useEstadoToques(backend: PropsSeccion['backend']) {
  const [estado, setEstado] = useState<VistaToques | null>(null);
  const refrescar = useCallback(() => backend.estadoToques().then(setEstado).catch(() => undefined), [backend]);
  useEffect(() => {
    void refrescar();
    const temporizador = setInterval(() => void refrescar(), 1000);
    return () => clearInterval(temporizador);
  }, [refrescar]);
  return { estado, setEstado };
}

const textoRect = (r: Rect) => `${r.ancho}×${r.alto} @ ${r.x},${r.y}`;

/**
 * Salida «Toques» de un mando: donde caen los toques (pantalla, ventana del juego o rectangulo) y
 * su estado (perfil, juego detectado, foco, pausa). Los perfiles se gestionan en «Juegos».
 */
export function PanelToques({ backend, info, estado: mapeo, editar, ejecutar }: PropsSeccion) {
  const t = useT();
  const { estado, setEstado } = useEstadoToques(backend);
  const [ventanas, setVentanas] = useState<VentanaAbierta[] | null | undefined>(undefined);
  const destino = mapeo.mapeo.toques.destino;
  const [rect, setRect] = useState<Rect>(destino.tipo === 'rectangulo' ? destino : RECT_DEFECTO);

  const listar = useCallback(() => {
    void backend.listarVentanas().then(setVentanas).catch(() => setVentanas(null));
  }, [backend]);
  useEffect(() => listar(), [listar]);

  const poner = (d: DestinoToques, soloConFoco = mapeo.mapeo.toques.solo_con_foco) =>
    editar((m) => ({ ...m, toques: { destino: d, solo_con_foco: soloConFoco } }));

  const opciones: { tipo: DestinoToques['tipo']; texto: string; ayuda: string }[] = [
    { tipo: 'ventana', texto: t('Ventana del juego'), ayuda: t('Sigue la ventana si se mueve o cambia de tamaño (X11/XWayland o Windows).') },
    { tipo: 'pantalla_completa', texto: t('Pantalla completa'), ayuda: t('Todo el escritorio (en Windows, el monitor principal).') },
    { tipo: 'rectangulo', texto: t('Rectángulo manual'), ayuda: t('Para Wayland puro o un juego sin ventana propia.') },
  ];
  const elegida = destino.tipo === 'ventana' ? ventanas?.find((v) => v.titulo === destino.titulo && v.clase === destino.clase) : undefined;
  const esDeEste = estado?.mando === info.id;

  return (
    <div className="space-y-4">
      <Tarjeta titulo={t('Dónde tocar')} extra={<p className="text-xs text-muted">{t('Los toques del perfil se adaptan a ese rectángulo como en el móvil.')}</p>}>
        <div role="radiogroup" aria-label={t('Destino de los toques')} className="grid gap-2 sm:grid-cols-3">
          {opciones.map((o) => {
            const activo = destino.tipo === o.tipo;
            return (
              <button key={o.tipo} type="button" role="radio" aria-checked={activo}
                onClick={() => {
                  if (o.tipo === 'pantalla_completa') poner({ tipo: 'pantalla_completa' });
                  else if (o.tipo === 'rectangulo') poner({ tipo: 'rectangulo', ...rect });
                  else {
                    const v = ventanas?.find((w) => w.activa) ?? ventanas?.[0];
                    poner({ tipo: 'ventana', titulo: v?.titulo ?? '', clase: v?.clase ?? '' });
                  }
                }}
                className={`flex cursor-pointer flex-col justify-start rounded-xl border p-2.5 text-left transition-colors ${activo ? 'border-primary/80 bg-primary/10' : 'border-line bg-surface hover:border-primary/40'}`}>
                <span className="block text-sm font-semibold">{o.texto}</span>
                <span className="mt-0.5 block text-xs text-muted">{o.ayuda}</span>
              </button>
            );
          })}
        </div>

        {destino.tipo === 'ventana' && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={t('Ventana del juego')} className="input h-9 min-w-0 flex-1 py-0 text-sm"
                value={elegida ? String(elegida.id) : ''}
                onChange={(e) => {
                  const v = ventanas?.find((w) => String(w.id) === e.target.value);
                  if (v) poner({ tipo: 'ventana', titulo: v.titulo, clase: v.clase });
                }}>
                {!elegida && <option value="">{destino.titulo || destino.clase ? `${destino.titulo} (${destino.clase}) — ${t('no está abierta')}` : t('Elige una ventana…')}</option>}
                {(ventanas ?? []).map((v) => (
                  <option key={v.id} value={String(v.id)}>{`${v.titulo} — ${v.clase || '?'} — ${v.rect.ancho}×${v.rect.alto}`}</option>
                ))}
              </select>
              <button type="button" className={claseBoton('secundario', 'sm')} onClick={listar}>{t('Actualizar')}</button>
            </div>
            {ventanas === null && (
              <p className="text-xs text-warning">{t('No se pueden listar ventanas en este escritorio (Wayland puro): usa el rectángulo manual o la pantalla completa.')}</p>
            )}
            <Casilla etiqueta={t('Solo mientras la ventana tiene el foco')} marcada={mapeo.mapeo.toques.solo_con_foco}
              ayuda={t('Fuera del juego el mando vuelve a funcionar normal.')}
              onCambiar={(v) => poner(destino, v)} />
          </div>
        )}

        {destino.tipo === 'rectangulo' && (
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            poner({ tipo: 'rectangulo', ...rect });
          }}>
            {(['x', 'y', 'ancho', 'alto'] as const).map((k) => (
              <label key={k} className="text-xs text-muted">
                <span className="mb-1 block">{{ x: 'X', y: 'Y', ancho: t('Ancho'), alto: t('Alto') }[k]}</span>
                <input type="number" value={rect[k]} min={k === 'ancho' || k === 'alto' ? 50 : -32768} max={k === 'ancho' || k === 'alto' ? 16384 : 32768}
                  className="input h-9 w-24 py-0 font-mono text-sm" onChange={(e) => setRect({ ...rect, [k]: Math.round(Number(e.target.value) || 0) })} />
              </label>
            ))}
            <button type="submit" className={claseBoton('secundario', 'sm')}>{t('Aplicar')}</button>
            {elegida && (
              <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => setRect(elegida.rect)}>{t('Copiar de la ventana')}</button>
            )}
          </form>
        )}
      </Tarjeta>

      <Tarjeta titulo={t('Estado de los toques')}>
        {!estado ? <p className="text-sm text-muted">…</p> : (
          <div className="space-y-2 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className={`size-2.5 rounded-full ${esDeEste && estado.mapeando ? 'bg-success' : esDeEste && !estado.pausado ? 'bg-warning' : 'bg-line'}`} />
              <span className="font-medium">
                {!esDeEste ? t('Otro mando está usando los toques.')
                  : estado.pausado ? t('Toques en pausa')
                    : estado.mapeando ? t('Tocando: el mando está capturado')
                      : !estado.perfil ? t('Sin perfil para el juego actual')
                        : !estado.destino ? t('Esperando la ventana del juego…')
                          : t('Esperando a que la ventana tenga el foco…')}
              </span>
              {esDeEste && (
                <button type="button" className={claseBoton(estado.pausado ? 'primario' : 'secundario', 'sm', 'ml-auto')}
                  onClick={() => ejecutar(async () => setEstado(await backend.pausarToques(!estado.pausado)))}>
                  {estado.pausado ? t('Reanudar toques') : t('Pausar toques')}
                </button>
              )}
            </p>
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted">{t('Perfil')}</dt>
              <dd className="truncate">
                {estado.perfil ? <>{nombrePerfil(estado.perfil)} <span className="font-mono text-muted">{estado.perfil.paquete}</span></> : '—'}
                {estado.origen && <span className="ml-2 inline-block whitespace-nowrap rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                  {{ fijo: t('elegido a mano'), juego: t('del juego (ventana)'), detectado: t('juego detectado') }[estado.origen]}
                </span>}
              </dd>
              <dt className="text-muted">{t('Juego Android')}</dt>
              <dd className="truncate font-mono">{estado.paquete ?? (estado.error_adb ? t(estado.error_adb) : '—')}</dd>
              <dt className="text-muted">{t('Destino')}</dt>
              <dd className="truncate font-mono">{estado.destino ? textoRect(estado.destino) : '—'}{estado.ventana ? ` · ${estado.ventana}` : ''}</dd>
              {estado.foco !== null && <>
                <dt className="text-muted">{t('Foco')}</dt>
                <dd>{estado.foco ? t('sí') : t('no')}</dd>
              </>}
            </dl>
            {estado.error_perfil && <p className="text-xs text-danger">{t(estado.error_perfil)}</p>}
            <p className="text-xs text-muted">
              {t('Con el mando: SELECT+START (1 s) pausa o reanuda los toques y SELECT+R1/L1 cambia al siguiente perfil del mismo juego. Los perfiles se eligen en la pestaña «Juegos».')}
            </p>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
