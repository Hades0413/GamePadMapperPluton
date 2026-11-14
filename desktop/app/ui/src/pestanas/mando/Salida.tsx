import { useEffect, useState } from 'react';
import { claseBoton } from '../../componentes/boton';
import { Tarjeta } from '../../componentes/controles';
import { PadVirtual } from '../../componentes/PadVirtual';
import { NOMBRE_SALIDA } from '../../dominio/configuracion';
import { ERROR } from '../../dominio/errores';
import type { Disponibilidad, InfoApp, TipoSalida } from '../../dominio/tipos';
import { useT } from '../../i18n/contexto';
import type { PropsSeccion } from './comun';

/** Elegir el mando virtual que produce este mando (o ninguno) y ver su estado. */
export function Salida({ backend, info, estado, vivo, editar, ejecutar }: PropsSeccion) {
  const t = useT();
  const [disponibles, setDisponibles] = useState<Disponibilidad[]>([]);
  const [app, setApp] = useState<InfoApp | null>(null);
  useEffect(() => {
    let vivo = true;
    void backend.disponibilidadSalidas().then((d) => vivo && setDisponibles(d));
    void backend.info().then((i) => vivo && setApp(i));
    return () => {
      vivo = false;
    };
  }, [backend]);

  const elegido = estado.mapeo.salida;
  const vista = vivo?.salida ?? null;
  const descripcion: Record<TipoSalida, string> = {
    ninguna: t('Solo se lee el mando: los juegos lo ven tal cual. Las teclas siguen funcionando.'),
    xbox360: t('El más compatible: XInput en Windows, xpad en Linux. Recomendado para casi todos los juegos.'),
    dualshock4: t('Para juegos que muestran botones de PlayStation o lo piden. En Windows, sin panel táctil ni sensores.'),
    switchpro: t('Para emuladores y juegos que esperan un mando de Nintendo (solo Linux).'),
  };
  const tipos: TipoSalida[] = ['ninguna', 'xbox360', 'dualshock4', 'switchpro'];
  const motivo = (tipo: TipoSalida) => disponibles.find((d) => d.tipo === tipo && !d.disponible)?.motivo ?? null;
  const faltaVigem = disponibles.some((d) => d.motivo === ERROR.sinVigem || d.motivo === ERROR.sinClienteVigem);
  const sinPermiso = disponibles.some((d) => d.motivo === ERROR.sinUinput);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <Tarjeta titulo={t('Convertir en otro mando')} extra={<p className="text-xs text-muted">{t('Los juegos verán un mando virtual de este tipo en lugar del tuyo.')}</p>}>
          <div role="radiogroup" aria-label={t('Tipo de mando virtual')} className="grid gap-3 sm:grid-cols-2">
            {tipos.map((tipo) => {
              const no = tipo !== 'ninguna' ? motivo(tipo) : null;
              const activo = elegido === tipo;
              return (
                <button key={tipo} type="button" role="radio" aria-checked={activo} disabled={!!no && !activo}
                  onClick={() => editar((m) => ({ ...m, salida: tipo }))}
                  className={`cursor-pointer rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${activo
                    ? 'border-primary/80 bg-primary/10' : 'border-line bg-surface hover:border-primary/40'}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{tipo === 'ninguna' ? t('Ninguno') : NOMBRE_SALIDA[tipo]}</span>
                    <span className={`size-3 rounded-full border-2 ${activo ? 'border-primary bg-primary' : 'border-line'}`} />
                  </span>
                  <span className="mt-1 block text-xs text-muted">{descripcion[tipo]}</span>
                  {no && <span className="mt-1.5 block text-xs text-warning">{t(no)}</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted">
            {t('Próximamente: «Toques» para juegos Android (Waydroid, emuladores, scrcpy) con la misma configuración.')}
          </p>
        </Tarjeta>

        <Tarjeta titulo={t('Estado')}>
          {elegido === 'ninguna' ? (
            <p className="text-sm text-muted">{t('Sin mando virtual.')}</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${vista?.activa ? 'bg-success' : vista?.error ? 'bg-danger' : 'bg-line'}`} />
                <span className="font-medium">
                  {vista?.activa ? t('{tipo} activo', { tipo: NOMBRE_SALIDA[elegido] })
                    : vivo?.pausado ? t('En pausa') : t('{tipo} inactivo', { tipo: NOMBRE_SALIDA[elegido] })}
                </span>
                {vista?.descripcion && <span className="font-mono text-xs text-muted">{vista.descripcion}</span>}
              </p>
              {vista?.activa && app?.plataforma === 'linux' && (
                <p className="text-xs text-muted">{t('El mando físico está capturado (EVIOCGRAB): los juegos solo ven el virtual. Se libera al quitarlo, al pausar o al cerrar la app.')}</p>
              )}
              {vista?.activa && app?.plataforma === 'windows' && (
                <p className="text-xs text-muted">{t('En Windows el mando físico sigue visible: para ocultarlo a los juegos usa HidHide.')}</p>
              )}
              {vista?.error && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                  <p>{t(vista.error)}</p>
                  <button type="button" className={claseBoton('secundario', 'sm', 'mt-2')}
                    onClick={() => ejecutar(() => backend.reintentarSalida(info.id), (r) => (r.activa ? t('Mando virtual creado') : t(r.error ?? '')))}>
                    {t('Reintentar')}
                  </button>
                </div>
              )}
            </div>
          )}
        </Tarjeta>

        {faltaVigem && (
          <Tarjeta titulo={t('ViGEmBus (Windows)')}>
            <div className="space-y-2 text-sm text-muted">
              <p>{t('Para crear mandos virtuales en Windows hace falta el driver ViGEmBus de Nefarius. La app no lo incluye: instálalo tú desde su página oficial y reinicia la app.')}</p>
              <p>{t('Además, copia ViGEmClient.dll (x64) junto al ejecutable de la app.')}</p>
              <p className="text-warning">{t('Aviso: su autor lo ha retirado y ya no recibe soporte, aunque sigue funcionando en Windows 10 y 11.')}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className={claseBoton('secundario', 'sm')} onClick={() => ejecutar(() => backend.abrirEnlace('vigembus'))}>
                  {t('Versiones oficiales de ViGEmBus')}
                </button>
                <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => ejecutar(() => backend.abrirEnlace('vigemclient'))}>
                  {t('ViGEmClient')}
                </button>
              </div>
            </div>
          </Tarjeta>
        )}
        {sinPermiso && (
          <Tarjeta titulo={t('Permisos en Linux')}>
            <p className="text-sm text-muted">
              {t('Hace falta poder escribir en /dev/uinput. El paquete .deb instala la regla udev; si usas la AppImage, añade tu usuario al grupo «input» o instala la regla 70-gamepad-mapper-pluton.rules y vuelve a conectar.')}
            </p>
          </Tarjeta>
        )}
      </div>
      <PadVirtual pad={vivo?.pad ?? null} salida={vista} />
    </div>
  );
}
