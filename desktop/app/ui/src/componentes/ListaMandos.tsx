import { useRef } from 'react';
import type { IdMando, InfoApp, InfoMando } from '../dominio/tipos';
import { useT } from '../i18n/contexto';
import { claseBoton } from './boton';
import { IconoBluetooth, IconoMando, IconoSubir, IconoUsb } from './iconos';

interface Props {
  mandos: InfoMando[];
  activo: IdMando | null;
  app: InfoApp | null;
  onElegir: (id: IdMando) => void;
  onCargarBaseDatos: (texto: string) => void;
}

const hex4 = (n: number) => n.toString(16).padStart(4, '0');

export function ListaMandos({ mandos, activo, app, onElegir, onCargarBaseDatos }: Props) {
  const t = useT();
  const archivo = useRef<HTMLInputElement>(null);
  const conexion: Record<InfoMando['conexion'], string> = { usb: 'USB', bluetooth: 'Bluetooth', virtual: t('Virtual'), otra: t('Otra') };
  const fuente: Record<InfoMando['plataforma'], string> = { evdev: 'evdev', xinput: 'XInput', simulado: t('simulado') };

  return (
    <aside className="flex min-h-0 flex-col gap-3 border-r border-line bg-surface/40 p-3" aria-label={t('Mandos conectados')}>
      <h2 className="etiqueta px-1 pt-1">{t('Mandos conectados')} · {mandos.length}</h2>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {mandos.length === 0 && (
          <li className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
            {t('Conecta un mando por USB o Bluetooth. Aparecerá aquí al momento.')}
          </li>
        )}
        {mandos.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onElegir(m.id)} aria-current={m.id === activo}
              className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-colors ${m.id === activo
                ? 'border-primary/70 bg-primary/10' : 'border-line bg-surface hover:border-primary/40'}`}>
              <span className="flex items-start gap-2.5">
                <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${m.id === activo ? 'bg-primary text-bg' : 'bg-surface-2 text-muted'}`}>
                  <IconoMando />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" title={m.nombre}>{m.nombre}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted">
                    {hex4(m.vendedor)}:{hex4(m.producto)} · {fuente[m.plataforma]}
                  </span>
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                    {m.conexion === 'bluetooth' ? <IconoBluetooth /> : <IconoUsb />}
                    {conexion[m.conexion]} · {m.botones.length}b {m.ejes.length}a {m.hats}h
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
        <p className="mb-2">
          {t('Base de datos SDL: {n} mandos conocidos', { n: app?.entradas_base_datos ?? 0 })}
        </p>
        <input ref={archivo} type="file" accept=".txt,text/plain" className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onCargarBaseDatos(await f.text());
            e.target.value = '';
          }} />
        <button type="button" className={claseBoton('secundario', 'sm', 'w-full')} onClick={() => archivo.current?.click()}>
          <IconoSubir />{t('Cargar gamecontrollerdb.txt')}
        </button>
      </div>
    </aside>
  );
}
