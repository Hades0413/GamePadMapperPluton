import type { ReactNode } from 'react';
import { buttonClassName } from '../../components/ui/buttonStyles';

/** Boton que abre el selector de archivos (imagenes). */
export function FilePicker({
  children, disabled = false, variant = 'secondary', onFile,
}: { children: ReactNode; disabled?: boolean; variant?: 'primary' | 'secondary'; onFile: (file: File) => void }) {
  return (
    <label className={`${buttonClassName(variant, 'sm')} cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      {children}
      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }} />
    </label>
  );
}
