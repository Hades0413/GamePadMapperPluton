import { valorEje } from '../dominio/fuentes';
import type { AjusteStick, EstadoCrudo, EstadoEstandar, MapeoMando } from '../dominio/tipos';
import { useT } from '../i18n/contexto';

interface Props {
  mapeo: MapeoMando;
  crudo: EstadoCrudo | null;
  estandar: EstadoEstandar | null;
  onCambiar: (lado: 'stick_izquierdo' | 'stick_derecho', ajuste: AjusteStick) => void;
}

/** Zona muerta, curva e inversion de cada stick, con una vista previa (crudo y ajustado). */
export function AjustesSticks({ mapeo, crudo, estandar, onCambiar }: Props) {
  const t = useT();
  const lados = [
    { lado: 'stick_izquierdo', titulo: t('Stick izquierdo'), x: mapeo.asignaciones.LS_X, y: mapeo.asignaciones.LS_Y, final: estandar?.ls },
    { lado: 'stick_derecho', titulo: t('Stick derecho'), x: mapeo.asignaciones.RS_X, y: mapeo.asignaciones.RS_Y, final: estandar?.rs },
  ] as const;

  return (
    <section className="@container card p-4" aria-label={t('Sticks')}>
      <h2 className="mb-3 text-sm font-semibold">{t('Sticks')}</h2>
      <div className="grid gap-5 @md:grid-cols-2">
        {lados.map(({ lado, titulo, x, y, final }) => {
          const a = mapeo[lado];
          const crudoXY: [number, number] = crudo ? [valorEje(x, crudo), valorEje(y, crudo)] : [0, 0];
          const cambiar = (p: Partial<AjusteStick>) => onCambiar(lado, { ...a, ...p });
          return (
            <div key={lado} className="space-y-2.5">
              <div className="flex items-center gap-3">
                <svg viewBox="-50 -50 100 100" className="size-20 shrink-0" aria-hidden="true">
                  <circle r={46} fill="var(--color-bg)" stroke="var(--color-line)" />
                  <circle r={46 * a.zona_muerta} fill="var(--color-warning)" opacity={0.18} />
                  <line x1={-46} x2={46} stroke="var(--color-line)" strokeWidth={0.6} />
                  <line y1={-46} y2={46} stroke="var(--color-line)" strokeWidth={0.6} />
                  <circle cx={crudoXY[0] * 46} cy={crudoXY[1] * 46} r={4} fill="var(--color-muted)" opacity={0.6} />
                  <circle cx={(final?.[0] ?? 0) * 46} cy={(final?.[1] ?? 0) * 46} r={6} fill="var(--color-primary)" />
                </svg>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium">{titulo}</h3>
                  <p className="text-xs text-muted">
                    <span className="mr-1 inline-block size-2 rounded-full bg-muted/60" />{t('crudo')}
                    <span className="mr-1 ml-3 inline-block size-2 rounded-full bg-primary" />{t('ajustado')}
                  </p>
                </div>
              </div>
              <label className="block text-xs">
                <span className="flex justify-between text-muted"><span>{t('Zona muerta')}</span><span className="font-mono">{Math.round(a.zona_muerta * 100)} %</span></span>
                <input type="range" min={0} max={0.5} step={0.01} value={a.zona_muerta} className="w-full accent-primary"
                  onChange={(e) => cambiar({ zona_muerta: Number(e.target.value) })} />
              </label>
              <label className="block text-xs">
                <span className="flex justify-between text-muted"><span>{t('Curva de respuesta')}</span><span className="font-mono">{a.curva.toFixed(2)}</span></span>
                <input type="range" min={0.5} max={3} step={0.05} value={a.curva} className="w-full accent-primary"
                  onChange={(e) => cambiar({ curva: Number(e.target.value) })} />
              </label>
              <div className="flex gap-4 text-xs">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={a.invertir_x} className="accent-primary" onChange={(e) => cambiar({ invertir_x: e.target.checked })} />
                  {t('Invertir X')}
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={a.invertir_y} className="accent-primary" onChange={(e) => cambiar({ invertir_y: e.target.checked })} />
                  {t('Invertir Y')}
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
