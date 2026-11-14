import { ETIQUETA, INSTRUCCION } from '../dominio/controles';
import { describirFuente } from '../dominio/fuentes';
import type { InfoMando, VistaAsistente } from '../dominio/tipos';
import { useT } from '../i18n/contexto';
import { claseBoton } from './boton';

interface Props {
  info: InfoMando;
  vista: VistaAsistente;
  onAtras: () => void;
  onSaltar: () => void;
  onCancelar: () => void;
  onAplicar: () => void;
}

/** «Asignar todo»: un control cada vez, con la entrada detectada y el progreso. */
export function PanelAsistente({ info, vista, onAtras, onSaltar, onCancelar, onAplicar }: Props) {
  const t = useT();
  const terminado = vista.fase === 'terminado';
  const asignados = Object.keys(vista.asignaciones).length;
  const progreso = Math.round((Math.min(vista.indice, vista.total) / vista.total) * 100);

  let ayuda = '';
  if (vista.fase === 'calibrando') ayuda = t('Calibrando: no toques el mando un momento…');
  else if (vista.fase === 'soltando') ayuda = t('Suelta todos los botones y sticks…');
  else if (vista.fase === 'esperando') ayuda = t('Esperando…');

  return (
    <section className="card border-accent/50 p-5 shadow-xl shadow-black/30" aria-live="polite" aria-label={t('Asignar todo')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-accent">{t('Asignar todo')}</h2>
        <span className="font-mono text-xs text-muted">{t('Paso {n} de {total}', { n: Math.min(vista.indice + 1, vista.total), total: vista.total })}</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progreso}%` }} />
      </div>

      {terminado ? (
        <div className="space-y-1">
          <p className="text-lg font-semibold">{t('¡Listo!')}</p>
          <p className="text-sm text-muted">{t('{n} de {total} controles asignados. Revisa el resultado y úsalo como mapeo de este mando.', { n: asignados, total: vista.total })}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {vista.paso && <p className="text-xl font-semibold leading-snug">{t(INSTRUCCION[vista.paso])}</p>}
          <p className="text-sm text-muted">{ayuda}</p>
          {vista.aviso?.tipo === 'repetida' && (
            <p role="alert" className="text-sm text-warning">
              {t('Esa entrada ya está asignada a {control}. Usa otra o pulsa «Saltar».', { control: ETIQUETA[vista.aviso.control] })}
            </p>
          )}
          {vista.ejes_ruidosos.length > 0 && (
            <p className="text-xs text-muted">{t('Ejes con ruido ignorados: {ejes}', { ejes: vista.ejes_ruidosos.map((e) => `a${e}`).join(', ') })}</p>
          )}
        </div>
      )}

      <ul className="mt-4 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
        {Object.entries(vista.asignaciones).map(([c, f]) => (
          <li key={c} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs text-muted">
            <span className="text-ink">{ETIQUETA[c as keyof typeof ETIQUETA]}</span> {describirFuente(f, info)}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className={claseBoton('fantasma', 'sm')} onClick={onCancelar}>{t('Cancelar')}</button>
        <button type="button" className={claseBoton('secundario', 'sm')} onClick={onAtras} disabled={vista.indice === 0}>{t('Atrás')}</button>
        {terminado ? (
          <button type="button" className={claseBoton('primario', 'sm')} onClick={onAplicar}>{t('Usar este mapeo')}</button>
        ) : (
          <button type="button" className={claseBoton('secundario', 'sm')} onClick={onSaltar}>{t('Saltar')}</button>
        )}
      </div>
    </section>
  );
}
