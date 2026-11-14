import { claseBoton } from '../../componentes/boton';
import { Casilla, Deslizador, Tarjeta } from '../../componentes/controles';
import { GraficoRespuesta } from '../../componentes/GraficoRespuesta';
import { EJE_DEFECTO, respuestaStick, STICK_DEFECTO } from '../../dominio/configuracion';
import { describirFuente, valorEje } from '../../dominio/fuentes';
import type { AjusteEje, AjusteStick } from '../../dominio/tipos';
import { useT } from '../../i18n/contexto';
import type { PropsSeccion } from './comun';

const dosDecimales = (v: number) => v.toFixed(2);

/**
 * Un stick como la pestana «Left/Right Thumb» de x360ce: zona muerta radial y curva del stick, y
 * para cada eje su grafica de respuesta en vivo con zona muerta, anti zona muerta, sensibilidad,
 * recorrido e inversion.
 */
export function Stick({ info, estado, vivo, editar, lado }: PropsSeccion & { lado: 'stick_izquierdo' | 'stick_derecho' }) {
  const t = useT();
  const m = estado.mapeo;
  const a = m[lado];
  const izquierdo = lado === 'stick_izquierdo';
  const fx = m.asignaciones[izquierdo ? 'LS_X' : 'RS_X'];
  const fy = m.asignaciones[izquierdo ? 'LS_Y' : 'RS_Y'];
  const crudo: [number, number] | null = vivo ? [valorEje(fx, vivo.crudo), valorEje(fy, vivo.crudo)] : null;
  const final = vivo ? (izquierdo ? vivo.estandar.ls : vivo.estandar.rs) : null;
  const cambiar = (p: Partial<AjusteStick>) => editar((x) => ({ ...x, [lado]: { ...x[lado], ...p } }));
  const cambiarEje = (eje: 'eje_x' | 'eje_y', p: Partial<AjusteEje>) =>
    editar((x) => ({ ...x, [lado]: { ...x[lado], [eje]: { ...x[lado][eje], ...p } } }));

  const ejes = [
    { eje: 'eje_x', titulo: t('Eje X (horizontal)'), fuente: fx, invertir: 'invertir_x', indice: 0 },
    { eje: 'eje_y', titulo: t('Eje Y (vertical)'), fuente: fy, invertir: 'invertir_y', indice: 1 },
  ] as const;

  return (
    <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <Tarjeta titulo={izquierdo ? t('Stick izquierdo') : t('Stick derecho')}>
        <svg viewBox="-50 -50 100 100" className="mx-auto mb-3 aspect-square w-full max-w-56" aria-hidden="true">
          <circle r={46} fill="var(--color-bg)" stroke="var(--color-line)" />
          <circle r={46 * a.zona_muerta} fill="var(--color-warning)" opacity={0.18} />
          <line x1={-46} x2={46} stroke="var(--color-line)" strokeWidth={0.6} />
          <line y1={-46} y2={46} stroke="var(--color-line)" strokeWidth={0.6} />
          {crudo && <circle cx={crudo[0] * 46} cy={crudo[1] * 46} r={4} fill="var(--color-muted)" opacity={0.6} />}
          {final && <circle cx={final[0] * 46} cy={final[1] * 46} r={6} fill="var(--color-primary)" />}
        </svg>
        <p className="mb-3 text-center text-xs text-muted">
          <span className="mr-1 inline-block size-2 rounded-full bg-muted/60" />{t('crudo')}
          <span className="mr-1 ml-3 inline-block size-2 rounded-full bg-primary" />{t('ajustado')}
        </p>
        <div className="space-y-3">
          <Deslizador etiqueta={t('Zona muerta radial')} valor={a.zona_muerta} min={0} max={0.5} onCambiar={(v) => cambiar({ zona_muerta: v })}
            ayuda={t('Círculo central en el que el stick vale 0 (evita el drift).')} />
          <Deslizador etiqueta={t('Curva de respuesta')} valor={a.curva} min={0.5} max={3} paso={0.05} formato={dosDecimales}
            ayuda={t('1 = lineal; más alto = más fino en el centro.')} onCambiar={(v) => cambiar({ curva: v })} />
          <p className="font-mono text-xs text-muted">X {fx ? describirFuente(fx, info) : '—'} · Y {fy ? describirFuente(fy, info) : '—'}</p>
          <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => cambiar({ ...STICK_DEFECTO })}>{t('Valores por defecto')}</button>
        </div>
      </Tarjeta>

      <div className="min-w-0 space-y-4">
        {ejes.map(({ eje, titulo, fuente, invertir, indice }) => {
          const e = a[eje];
          // Respuesta de este eje con el otro en reposo (lo que dibuja la grafica).
          const funcion = (v: number) => respuestaStick(indice === 0 ? v : 0, indice === 1 ? v : 0, a)[indice];
          return (
            <Tarjeta key={eje} titulo={titulo} extra={
              <span className="font-mono text-xs text-muted">
                {t('entrada')} {crudo ? crudo[indice].toFixed(2) : '—'} → {t('salida')} {final ? final[indice].toFixed(2) : '—'}
              </span>
            }>
              <div className="flex flex-wrap items-start gap-4">
                <GraficoRespuesta funcion={funcion} entrada={crudo ? crudo[indice] : null}
                  etiqueta={t('Respuesta de {control}', { control: `${izquierdo ? 'LS' : 'RS'} ${indice === 0 ? 'X' : 'Y'}` })} />
                <div className="min-w-48 flex-1 space-y-3">
                  <Deslizador etiqueta={t('Anti zona muerta')} valor={e.anti_zona_muerta} min={0} max={0.5}
                    ayuda={t('Mínimo que sale en cuanto pasas la zona muerta, para juegos con su propia zona muerta.')}
                    onCambiar={(v) => cambiarEje(eje, { anti_zona_muerta: v })} />
                  <Deslizador etiqueta={t('Zona muerta del eje')} valor={e.zona_muerta} min={0} max={0.5}
                    onCambiar={(v) => cambiarEje(eje, { zona_muerta: v })} />
                  <Deslizador etiqueta={t('Sensibilidad')} valor={e.sensibilidad} min={0.3} max={3} paso={0.05} formato={dosDecimales}
                    ayuda={t('Menos sensible en el centro con valores altos; más brusco con valores bajos.')}
                    onCambiar={(v) => cambiarEje(eje, { sensibilidad: v })} />
                  <Deslizador etiqueta={t('A fondo en')} valor={e.saturacion} min={Math.min(1, e.zona_muerta + 0.05)} max={1}
                    onCambiar={(v) => cambiarEje(eje, { saturacion: v })} />
                  <div className="flex flex-wrap items-center gap-4">
                    <Casilla etiqueta={t('Invertir')} marcada={a[invertir]} onCambiar={(v) => cambiar({ [invertir]: v })} />
                    <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => cambiarEje(eje, { ...EJE_DEFECTO })}>
                      {t('Valores por defecto')}
                    </button>
                  </div>
                  {!fuente && <p className="text-xs text-warning">{t('Este eje no tiene entrada asignada (pestaña General).')}</p>}
                </div>
              </div>
            </Tarjeta>
          );
        })}
      </div>
    </div>
  );
}
