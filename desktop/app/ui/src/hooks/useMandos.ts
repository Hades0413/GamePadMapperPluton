import { useCallback, useEffect, useState } from 'react';
import type { Backend } from '../backend';
import type { EstadoMapeo, IdMando, InfoApp, InfoMando, Instantanea } from '../dominio/tipos';

/** Mandos conectados (con conexion en caliente) y el elegido. */
export function useMandos(backend: Backend) {
  const [mandos, setMandos] = useState<InfoMando[]>([]);
  const [elegido, setElegido] = useState<IdMando | null>(null);
  const [app, setApp] = useState<InfoApp | null>(null);

  const refrescarApp = useCallback(() => backend.info().then(setApp), [backend]);

  useEffect(() => {
    let vivo = true;
    void backend.listarMandos().then((m) => vivo && setMandos(m));
    void refrescarApp();
    const quitar = backend.alCambiarMandos(setMandos);
    return () => {
      vivo = false;
      quitar();
    };
  }, [backend, refrescarApp]);

  // Si el elegido se desconecta (o no hay ninguno), se pasa al primero.
  const activo = mandos.some((m) => m.id === elegido) ? elegido : (mandos[0]?.id ?? null);
  return { mandos, activo, elegir: setElegido, app, refrescarApp };
}

/** Mapeo y estado en vivo del mando activo (lo de otro mando anterior se descarta por su id). */
export function useMandoActivo(backend: Backend, id: IdMando | null) {
  const [mapeo, setMapeo] = useState<{ id: IdMando; estado: EstadoMapeo } | null>(null);
  const [vivo, setVivo] = useState<Instantanea | null>(null);

  useEffect(() => {
    if (id === null) return;
    let activo = true;
    void backend.obtenerMapeo(id).then((estado) => activo && setMapeo({ id, estado }));
    const quitar = backend.suscribirEntrada(id, (i) => activo && setVivo(i));
    return () => {
      activo = false;
      quitar();
    };
  }, [backend, id]);

  const setEstado = useCallback((estado: EstadoMapeo) => {
    if (id !== null) setMapeo({ id, estado });
  }, [id]);

  return {
    estado: mapeo?.id === id ? mapeo.estado : null,
    setEstado,
    vivo: vivo?.id === id ? vivo : null,
  };
}
