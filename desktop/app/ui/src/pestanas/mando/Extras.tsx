import { Tarjeta } from '../../componentes/controles';
import { IconoMando } from '../../componentes/iconos';
import { conAccion } from '../../dominio/configuracion';
import { actividad, leerFuente } from '../../dominio/fuentes';
import type { Entrada } from '../../dominio/tipos';
import { useT } from '../../i18n/contexto';
import { FilasAcciones } from './Botones';
import type { PropsSeccion } from './comun';

/**
 * Botones extra: todo lo que el mando tiene ademas del mando estandar (paletas traseras, captura,
 * clic del panel tactil, ejes y hats adicionales). Cada uno puede producir un control del mando
 * virtual, una macro o una tecla, o ignorarse.
 */
export function Extras({ info, estado, vivo, editar }: PropsSeccion) {
  const t = useT();
  const m = estado.mapeo;
  const grupos: { titulo: string; entradas: Entrada[] }[] = [
    { titulo: t('Botones'), entradas: estado.extras.filter((e) => leerFuente(e)?.tipo === 'boton') },
    { titulo: t('Ejes (cada sentido por separado)'), entradas: estado.extras.filter((e) => leerFuente(e)?.tipo === 'eje') },
    { titulo: t('Hats'), entradas: estado.extras.filter((e) => leerFuente(e)?.tipo === 'hat') },
  ].filter((g) => g.entradas.length > 0);

  if (grupos.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center text-muted">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-primary"><IconoMando /></span>
        <p className="font-medium text-ink">{t('Este mando no tiene botones extra')}</p>
        <p className="max-w-md text-sm">{t('Todas sus entradas ya alimentan el mando estándar. Si quitas una asignación en «General», aparecerá aquí.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {t('Entradas que no usa el mando estándar: paletas, captura, clic del panel táctil, ejes adicionales… Púlsalas para verlas iluminarse.')}
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {grupos.map((g) => (
          <Tarjeta key={g.titulo} titulo={`${g.titulo} · ${g.entradas.length}`}>
            <FilasAcciones entradas={g.entradas} m={m} info={info}
              actividadDe={(e) => (vivo ? actividad(e, vivo.crudo) : 0)}
              onCambiar={(e, a) => editar((x) => ({ ...x, acciones: conAccion(x.acciones, e, a) }))} />
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}
