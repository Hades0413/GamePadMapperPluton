import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/contexto';
import { claseBoton } from './boton';

/** Pegar una linea de SDL GameControllerDB para usarla como mapeo de este mando. */
export function DialogoImportar({ onCerrar, onImportar }: { onCerrar: () => void; onImportar: (linea: string) => void }) {
  const t = useT();
  const [linea, setLinea] = useState('');
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogo.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogo} onClose={onCerrar} aria-labelledby="titulo-importar"
      className="card m-auto w-[min(40rem,calc(100vw-2rem))] p-5 text-ink backdrop:bg-black/60">
      <form method="dialog" onSubmit={(e) => {
        e.preventDefault();
        if (linea.trim()) onImportar(linea.trim());
      }}>
        <h2 id="titulo-importar" className="mb-1 text-base font-semibold">{t('Importar línea SDL')}</h2>
        <p className="mb-3 text-sm text-muted">{t('Pega una línea de gamecontrollerdb.txt (GUID,nombre,a:b0,...). Se usará con este mando aunque el GUID sea otro.')}</p>
        <textarea value={linea} onChange={(e) => setLinea(e.target.value)} rows={4} autoFocus spellCheck={false}
          className="input mb-4 resize-none font-mono text-xs select-text" placeholder="030000005e0400008e02000014010000,Xbox 360 Controller,a:b0,b:b1,..." />
        <div className="flex justify-end gap-2">
          <button type="button" className={claseBoton('fantasma', 'sm')} onClick={onCerrar}>{t('Cancelar')}</button>
          <button type="submit" className={claseBoton('primario', 'sm')} disabled={!linea.trim()}>{t('Importar')}</button>
        </div>
      </form>
    </dialog>
  );
}
