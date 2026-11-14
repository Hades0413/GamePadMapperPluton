import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/contexto';
import { claseBoton } from './boton';

interface Props {
  titulo: string;
  explicacion: string;
  marcador: string;
  textoInicial?: string;
  boton: string;
  /** Tamano maximo del texto en caracteres. */
  maximo: number;
  onCerrar: () => void;
  onAceptar: (texto: string) => void;
}

/** Dialogo para pegar texto (linea SDL, preset JSON...). */
export function DialogoTexto({ titulo, explicacion, marcador, textoInicial = '', boton, maximo, onCerrar, onAceptar }: Props) {
  const t = useT();
  const [texto, setTexto] = useState(textoInicial);
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogo.current?.showModal();
  }, []);

  return (
    <dialog ref={dialogo} onClose={onCerrar} aria-labelledby="titulo-dialogo"
      className="card m-auto w-[min(44rem,calc(100vw-2rem))] p-5 text-ink backdrop:bg-black/60">
      <form method="dialog" onSubmit={(e) => {
        e.preventDefault();
        if (texto.trim()) onAceptar(texto.trim());
      }}>
        <h2 id="titulo-dialogo" className="mb-1 text-base font-semibold">{titulo}</h2>
        <p className="mb-3 text-sm text-muted">{explicacion}</p>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value.slice(0, maximo))} rows={8} autoFocus spellCheck={false}
          className="input mb-4 resize-none font-mono text-xs select-text" placeholder={marcador} />
        <div className="flex justify-end gap-2">
          <button type="button" className={claseBoton('fantasma', 'sm')} onClick={onCerrar}>{t('Cancelar')}</button>
          <button type="submit" className={claseBoton('primario', 'sm')} disabled={!texto.trim()}>{boton}</button>
        </div>
      </form>
    </dialog>
  );
}
