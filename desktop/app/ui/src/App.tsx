import { useMemo } from 'react';
import { crearBackend, enTauri } from './backend';
import { Cabecera } from './componentes/Cabecera';
import { PestanaMandos } from './pestanas/Mandos';

export function App() {
  const backend = useMemo(() => crearBackend(), []);
  return (
    <div className="flex h-dvh flex-col">
      <Cabecera simulado={!enTauri()} />
      <PestanaMandos backend={backend} />
    </div>
  );
}
