import { Asignaciones } from '../../componentes/Asignaciones';
import { DiagramaMando } from '../../componentes/DiagramaMando';
import { PadVirtual } from '../../componentes/PadVirtual';
import { PanelEnVivo } from '../../componentes/PanelEnVivo';
import { conAsignacion } from '../../dominio/mapeo';
import { useT } from '../../i18n/contexto';
import type { PropsSeccion } from './comun';

/** Diagrama, asignaciones, entrada en vivo y el mando virtual (como «General» de x360ce). */
export function General({ info, estado, vivo, editar, seleccionado, onSeleccionar }: PropsSeccion) {
  const t = useT();
  const asistente = vivo?.asistente ?? null;
  const mapeo = estado.mapeo;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-4">
        <section className="card p-4" aria-label={t('Mando')}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('Mando estándar')}</h2>
            <p className="text-xs text-muted">{t('Pulsa un control del dibujo para elegir su entrada.')}</p>
          </div>
          <div className="mx-auto max-w-[40rem]">
            <DiagramaMando estado={vivo?.estandar ?? null} seleccionado={seleccionado}
              pedido={asistente?.paso ?? null} asignados={asistente ? asistente.asignaciones : mapeo.asignaciones}
              onElegir={onSeleccionar} />
          </div>
        </section>
        <Asignaciones info={info} mapeo={mapeo} crudo={vivo?.crudo ?? null} seleccionado={seleccionado}
          onElegir={onSeleccionar}
          onAsignar={(c, f) => editar((m) => ({ ...m, asignaciones: conAsignacion(m.asignaciones, c, f) }))} />
      </div>
      <div className="min-w-0 space-y-4">
        <PadVirtual pad={vivo?.pad ?? null} salida={vivo?.salida ?? null} compacto />
        <PanelEnVivo info={info} crudo={vivo?.crudo ?? null} ruidosos={asistente?.ejes_ruidosos ?? []} extras={estado.extras} />
      </div>
    </div>
  );
}
