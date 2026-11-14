import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { crearBackend, enTauri } from './backend';
import { AvisoFlotante } from './componentes/AvisoFlotante';
import { Cabecera, type Pestana } from './componentes/Cabecera';
import type { Opciones, Tema } from './dominio/tipos';
import { useAviso } from './hooks/useAviso';
import { useI18n } from './i18n/contexto';
import { PestanaAcercaDe } from './pestanas/AcercaDe';
import { PestanaJuegos } from './pestanas/Juegos';
import { PestanaMandos } from './pestanas/Mandos';
import { PestanaOpciones } from './pestanas/Opciones';

/** Aplica el tema (atributo `data-tema` en <html>; «sistema» sigue al sistema operativo). */
function aplicarTema(tema: Tema) {
  const claro = tema === 'claro' || (tema === 'sistema' && window.matchMedia?.('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.tema = claro ? 'claro' : 'oscuro';
}

export function App() {
  const backend = useMemo(() => crearBackend(), []);
  const { t, cambiarIdioma } = useI18n();
  const [pestana, setPestana] = useState<Pestana>('mandos');
  const [pausado, setPausado] = useState(false);
  const { aviso, ejecutar } = useAviso();

  const aplicarOpciones = useCallback((o: Opciones) => {
    aplicarTema(o.tema);
    if (o.idioma !== 'auto') cambiarIdioma(o.idioma);
  }, [cambiarIdioma]);

  // Lo ultimo de cada funcion, para el efecto de arranque (que solo debe ejecutarse una vez).
  const actuales = useRef({ aplicarOpciones, ejecutar, t });
  useEffect(() => {
    actuales.current = { aplicarOpciones, ejecutar, t };
  });

  useEffect(() => {
    let vivo = true;
    void backend.obtenerOpciones().then((o) => {
      if (!vivo) return;
      actuales.current.aplicarOpciones(o);
      // Comprobacion de version al arrancar (solo avisa; se instala desde «Opciones»).
      if (o.buscar_actualizaciones && enTauri()) {
        void backend.buscarActualizacion().then((a) => {
          const { ejecutar: ej, t: tr } = actuales.current;
          if (vivo && a) ej(async () => a, () => tr('Hay una versión nueva: {v}', { v: a.version }));
        }).catch(() => undefined);
      }
    });
    void backend.info().then((i) => vivo && setPausado(i.pausado));
    const quitar = backend.alCambiarPausa(setPausado);
    return () => {
      vivo = false;
      quitar();
    };
  }, [backend]);

  return (
    <div className="flex h-dvh flex-col">
      <Cabecera simulado={!enTauri()} pestana={pestana} onPestana={setPestana} pausado={pausado}
        onPausar={(p) => ejecutar(async () => setPausado(await backend.pausar(p)), () => (p ? t('Mandos virtuales en pausa') : t('Mandos virtuales reanudados')))} />
      {pestana === 'mandos' && <PestanaMandos backend={backend} ejecutar={ejecutar} />}
      {pestana === 'juegos' && <PestanaJuegos backend={backend} ejecutar={ejecutar} />}
      {pestana === 'opciones' && <PestanaOpciones backend={backend} ejecutar={ejecutar} onCambio={aplicarOpciones} />}
      {pestana === 'acerca' && <PestanaAcercaDe backend={backend} ejecutar={ejecutar} />}
      <AvisoFlotante aviso={aviso} />
    </div>
  );
}
