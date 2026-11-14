import { Barra, Deslizador, Tarjeta } from '../../componentes/controles';
import { GraficoRespuesta } from '../../componentes/GraficoRespuesta';
import { GATILLO_DEFECTO, respuestaGatillo } from '../../dominio/configuracion';
import { describirFuente, valorGatillo } from '../../dominio/fuentes';
import type { AjusteGatillo } from '../../dominio/tipos';
import { useT } from '../../i18n/contexto';
import { claseBoton } from '../../componentes/boton';
import type { PropsSeccion } from './comun';

/** Zona muerta, anti zona muerta y recorrido de cada gatillo, con su grafica en vivo. */
export function Gatillos({ info, estado, vivo, editar }: PropsSeccion) {
  const t = useT();
  const m = estado.mapeo;
  const lados = [
    { clave: 'gatillo_izquierdo', control: 'L2', titulo: t('Gatillo izquierdo (L2)') },
    { clave: 'gatillo_derecho', control: 'R2', titulo: t('Gatillo derecho (R2)') },
  ] as const;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {lados.map(({ clave, control, titulo }) => {
        const a = m[clave];
        const fuente = m.asignaciones[control];
        const entrada = vivo ? valorGatillo(fuente, vivo.crudo) : null;
        const salida = control === 'L2' ? vivo?.estandar.l2 : vivo?.estandar.r2;
        const cambiar = (p: Partial<AjusteGatillo>) => editar((x) => ({ ...x, [clave]: { ...x[clave], ...p } }));
        return (
          <Tarjeta key={clave} titulo={titulo} extra={
            <span className="font-mono text-xs text-muted">{fuente ? describirFuente(fuente, info) : t('sin asignar')}</span>
          }>
            <div className="flex flex-wrap items-start gap-4">
              <GraficoRespuesta funcion={(v) => respuestaGatillo(v, a)} entrada={entrada} positiva etiqueta={t('Respuesta de {control}', { control })} />
              <div className="min-w-48 flex-1 space-y-3">
                <Deslizador etiqueta={t('Zona muerta')} valor={a.zona_muerta} min={0} max={0.5}
                  ayuda={t('Recorrido inicial que no cuenta (gatillos que no vuelven del todo).')} onCambiar={(v) => cambiar({ zona_muerta: v })} />
                <Deslizador etiqueta={t('Anti zona muerta')} valor={a.anti_zona_muerta} min={0} max={0.5}
                  ayuda={t('Mínimo que sale en cuanto pasas la zona muerta, para juegos con su propia zona muerta.')} onCambiar={(v) => cambiar({ anti_zona_muerta: v })} />
                <Deslizador etiqueta={t('A fondo en')} valor={a.maximo} min={Math.min(1, a.zona_muerta + 0.05)} max={1}
                  ayuda={t('A partir de aquí el gatillo ya cuenta como pulsado a fondo.')} onCambiar={(v) => cambiar({ maximo: v })} />
                <div className="space-y-1 text-xs text-muted">
                  <span className="flex justify-between"><span>{t('Entrada')}</span><span className="font-mono">{Math.round((entrada ?? 0) * 100)} %</span></span>
                  <Barra valor={entrada ?? 0} color="bg-muted" />
                  <span className="flex justify-between"><span>{t('Salida')}</span><span className="font-mono">{Math.round((salida ?? 0) * 100)} %</span></span>
                  <Barra valor={salida ?? 0} />
                </div>
                <button type="button" className={claseBoton('fantasma', 'sm')} onClick={() => cambiar({ ...GATILLO_DEFECTO })}>{t('Valores por defecto')}</button>
              </div>
            </div>
          </Tarjeta>
        );
      })}
    </div>
  );
}
