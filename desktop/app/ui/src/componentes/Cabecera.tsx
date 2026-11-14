import { useI18n } from '../i18n/contexto';
import type { Idioma } from '../i18n/traducir';

export type Pestana = 'mandos' | 'juegos' | 'opciones' | 'acerca';

interface Props {
  simulado: boolean;
  pestana: Pestana;
  onPestana: (p: Pestana) => void;
  pausado: boolean;
  onPausar: (p: boolean) => void;
}

/** Logo, pestanas, pausa de los mandos virtuales e idioma. */
export function Cabecera({ simulado, pestana, onPestana, pausado, onPausar }: Props) {
  const { t, idioma, cambiarIdioma } = useI18n();
  const pestanas: { id: Pestana; texto: string }[] = [
    { id: 'mandos', texto: t('Mandos') },
    { id: 'juegos', texto: t('Juegos') },
    { id: 'opciones', texto: t('Opciones') },
    { id: 'acerca', texto: t('Acerca de') },
  ];
  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-bg/80 px-4">
      <div className="flex items-center gap-2.5 font-bold tracking-tight">
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-xl bg-brand">
          <img src="/icon-fg.png" alt="" width={32} height={32} className="scale-150" />
        </span>
        <span className="whitespace-nowrap">Gamepad Mapper <span className="text-primary">Plutón</span></span>
        <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-muted">{t('Escritorio')}</span>
      </div>
      <nav role="tablist" aria-label={t('Secciones')} className="flex gap-1">
        {pestanas.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} onClick={() => onPestana(p.id)}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${pestana === p.id
              ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>
            {p.texto}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {simulado && (
          <span className="rounded-md bg-warning/15 px-2 py-1 text-xs font-medium text-warning" title={t('Sin Tauri: datos de ejemplo')}>
            {t('Modo demostración')}
          </span>
        )}
        <button type="button" onClick={() => onPausar(!pausado)} aria-pressed={pausado}
          title={t('Pausa o reanuda todos los mandos virtuales')}
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${pausado
            ? 'border-warning/60 bg-warning/15 text-warning' : 'border-line text-muted hover:text-ink'}`}>
          <span className={`size-2 rounded-full ${pausado ? 'bg-warning' : 'bg-success'}`} />
          {pausado ? t('En pausa') : t('Activo')}
        </button>
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
