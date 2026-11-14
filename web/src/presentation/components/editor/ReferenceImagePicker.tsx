import { useT } from '../../i18n/I18nContext';
import { REFERENCE_ACCEPT, type ReferenceProblem } from '../../lib/referenceImage';
import { Button } from '../ui/Button';

/**
 * «Usar imagen de referencia»: elige una captura local para ver los botones encima. La imagen no
 * sale del navegador (ver useReferenceImage).
 */
export function ReferenceImagePicker({
  active, problem, onPick, onClear,
}: {
  active: boolean;
  problem: ReferenceProblem | null;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-xl border border-dashed border-line px-3 py-1.5 text-sm text-muted hover:border-primary hover:text-ink focus-within:border-primary">
          {active ? t('Cambiar imagen de referencia') : t('Usar imagen de referencia')}
          <input type="file" accept={REFERENCE_ACCEPT} className="sr-only" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPick(file);
          }} />
        </label>
        {active && <Button size="sm" variant="ghost" onClick={onClear}>{t('Quitar imagen')}</Button>}
      </div>
      <p className="text-xs text-muted">{t('La imagen solo se usa aquí para colocar los botones; no se sube ni se guarda.')}</p>
      {problem && (
        <p className="text-xs text-danger" role="alert">
          {problem === 'size' ? t('La imagen pesa más de 10 MB.') : t('Elige una imagen JPG, PNG o WebP.')}
        </p>
      )}
    </div>
  );
}
