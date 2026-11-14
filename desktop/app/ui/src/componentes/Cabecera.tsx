import { useI18n } from '../i18n/contexto';
import type { Idioma } from '../i18n/traducir';

export type Pestana = 'mandos' | 'juegos';

/** Logo, pestanas (Juegos llega en una fase posterior) e idioma. */
export function Cabecera({ simulado }: { simulado: boolean }) {
  const { t, idioma, cambiarIdioma } = useI18n();
  const pestana = (id: Pestana, texto: string, activa: boolean) => (
    <button type="button" role="tab" aria-selected={activa} disabled={!activa} key={id}
      title={activa ? undefined : t('Próximamente')}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${activa ? 'bg-surface-2 text-ink' : 'cursor-not-allowed text-muted/60'}`}>
      {texto}
      {!activa && <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{t('Próximamente')}</span>}
    </button>
  );
  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-bg/80 px-4">
      <div className="flex items-center gap-2.5 font-bold tracking-tight">
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-xl bg-brand">
          <img src="/icon-fg.png" alt="" width={32} height={32} className="scale-150" />
        </span>
        <span>Gamepad Mapper <span className="text-primary">Plutón</span></span>
        <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-muted">{t('Escritorio')}</span>
      </div>
      <nav role="tablist" aria-label={t('Secciones')} className="flex gap-1">
        {pestana('mandos', t('Mandos'), true)}
        {pestana('juegos', t('Juegos'), false)}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {simulado && (
          <span className="rounded-md bg-warning/15 px-2 py-1 text-xs font-medium text-warning" title={t('Sin Tauri: datos de ejemplo')}>
            {t('Modo demostración')}
          </span>
        )}
        <div className="flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label={t('Idioma')}>
          {(['es', 'en'] as Idioma[]).map((i) => (
            <button key={i} type="button" onClick={() => cambiarIdioma(i)} aria-pressed={idioma === i}
              className={`cursor-pointer rounded-md px-2 py-1 font-semibold uppercase ${idioma === i ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>
              {i}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
