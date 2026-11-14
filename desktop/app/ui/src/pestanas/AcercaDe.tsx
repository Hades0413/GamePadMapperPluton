import { useEffect, useState } from 'react';
import type { Backend } from '../backend';
import { claseBoton } from '../componentes/boton';
import { Tarjeta } from '../componentes/controles';
import type { InfoApp } from '../dominio/tipos';
import { useT } from '../i18n/contexto';

/** Version, licencias, avisos de marcas y enlaces. */
export function PestanaAcercaDe({ backend, ejecutar }: {
  backend: Backend; ejecutar: <T>(accion: () => Promise<T>, ok?: (r: T) => string) => void;
}) {
  const t = useT();
  const [app, setApp] = useState<InfoApp | null>(null);
  useEffect(() => {
    let vivo = true;
    void backend.info().then((i) => vivo && setApp(i));
    return () => {
      vivo = false;
    };
  }, [backend]);

  const enlace = (cual: Parameters<Backend['abrirEnlace']>[0], texto: string) => (
    <button type="button" className={claseBoton('secundario', 'sm')} onClick={() => ejecutar(() => backend.abrirEnlace(cual))}>{texto}</button>
  );

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="card flex flex-wrap items-center gap-4 p-5">
          <span className="flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-brand">
            <img src="/icon-fg.png" alt="" width={64} height={64} className="scale-150" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold">Gamepad Mapper <span className="text-primary">Plutón</span></h1>
            <p className="text-sm text-muted">{t('Versión {v} · Linux y Windows', { v: app?.version ?? '…' })}</p>
            <p className="mt-1 text-sm">{t('Mapea cualquier mando y conviértelo en el mando que espera cada juego.')}</p>
          </div>
        </section>
        <Tarjeta titulo={t('Enlaces')}>
          <div className="flex flex-wrap gap-2">
            {enlace('web', t('Web'))}
            {enlace('repositorio', t('Código fuente'))}
            {enlace('versiones', t('Descargas'))}
            {enlace('licencia', t('Licencia'))}
          </div>
        </Tarjeta>
        <Tarjeta titulo={t('Licencias y avisos')}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
            <li>{t('Código: PolyForm Noncommercial 1.0.0.')}</li>
            <li>{t('Base de mandos: SDL_GameControllerDB (licencia zlib).')}</li>
            <li>{t('Mandos virtuales: uinput del kernel en Linux; en Windows, ViGEmBus de Nefarius si lo instalas tú (no se incluye).')}</li>
            <li>{t('Xbox, DualShock, PlayStation, Nintendo Switch y sus nombres son marcas de sus dueños; aquí solo describen con qué mando es compatible la salida. El dibujo del mando es propio.')}</li>
          </ul>
        </Tarjeta>
        {app && (
          <Tarjeta titulo={t('Datos')}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">{t('Configuración')}</dt><dd className="truncate font-mono text-xs">{app.carpeta_mapeos ?? '—'}</dd>
              <dt className="text-muted">{t('Mandos reconocidos')}</dt><dd>{app.entradas_base_datos}</dd>
              <dt className="text-muted">{t('Base incluida')}</dt><dd>{app.base_incluida}</dd>
            </dl>
          </Tarjeta>
        )}
      </div>
    </main>
  );
}
