import { useI18n } from '../../i18n/I18nContext';
import type { Lang } from '../../i18n/translate';

const OPTIONS: readonly (readonly [Lang, string, string])[] = [
  ['es', 'ES', 'Español'],
  ['en', 'EN', 'English'],
];

/** Selector de idioma ES / EN. Cada boton dice su idioma en ese mismo idioma (no se traduce). */
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t('Idioma')} className="flex rounded-lg border border-line p-0.5 text-xs font-semibold">
      {OPTIONS.map(([value, short, name]) => (
        <button key={value} type="button" lang={value} aria-pressed={lang === value} aria-label={name} title={name}
          onClick={() => setLang(value)}
          className={`rounded-md px-2 py-1 transition-colors ${lang === value ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>
          {short}
        </button>
      ))}
    </div>
  );
}
