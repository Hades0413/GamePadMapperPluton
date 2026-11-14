import { claseBoton } from '../../componentes/boton';
import { Casilla, Deslizador, Tarjeta } from '../../componentes/controles';
import { IconoVibrar } from '../../componentes/iconos';
import { VIBRACION_DEFECTO } from '../../dominio/configuracion';
import type { AjusteVibracion } from '../../dominio/tipos';
import { useT } from '../../i18n/contexto';
import type { PropsSeccion } from './comun';

/** Vibracion que el juego manda al mando virtual y llega al fisico (como «Force Feedback»). */
export function Vibracion({ backend, info, estado, editar, ejecutar }: PropsSeccion) {
  const t = useT();
  const v = estado.mapeo.vibracion;
  const cambiar = (p: Partial<AjusteVibracion>) => editar((x) => ({ ...x, vibracion: { ...x.vibracion, ...p } }));
  const probar = (fuerte: number, debil: number) =>
    ejecutar(() => backend.probarMotores(info.id, fuerte, debil), () => t('Vibrando…'));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Tarjeta titulo={t('Vibración')}>
        {!info.vibracion && <p className="mb-3 rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">{t('Este mando no tiene vibración')}</p>}
        <div className="space-y-3">
          <Casilla etiqueta={t('Reenviar la vibración del juego a este mando')} marcada={v.activa} onCambiar={(activa) => cambiar({ activa })} />
          <Casilla etiqueta={t('Intercambiar motores')} marcada={v.intercambiar} desactivada={!v.activa}
            ayuda={t('Útil si el mando tiene los motores al revés.')} onCambiar={(intercambiar) => cambiar({ intercambiar })} />
          <Deslizador etiqueta={t('Intensidad general')} valor={v.fuerza} min={0} max={1} onCambiar={(fuerza) => cambiar({ fuerza })} />
          <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => cambiar({ ...VIBRACION_DEFECTO })}>{t('Valores por defecto')}</button>
        </div>
        <p className="mt-4 text-xs text-muted">
          {t('El juego manda dos intensidades: motor grande (golpes, explosiones) y motor pequeño (efectos suaves). Si el mando solo tiene un motor, el sistema las mezcla.')}
        </p>
      </Tarjeta>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {([
          { clave: 'fuerte', titulo: t('Motor grande (izquierdo)'), prueba: [1, 0] },
          { clave: 'debil', titulo: t('Motor pequeño (derecho)'), prueba: [0, 1] },
        ] as const).map(({ clave, titulo, prueba }) => (
          <Tarjeta key={clave} titulo={titulo}>
            <Deslizador etiqueta={t('Intensidad')} valor={v[clave]} min={0} max={1} onCambiar={(x) => cambiar({ [clave]: x })} />
            <button type="button" className={claseBoton('secundario', 'sm', 'mt-3')} disabled={!info.vibracion}
              onClick={() => probar(prueba[0], prueba[1])}>
              <IconoVibrar />{t('Probar')}
            </button>
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}
