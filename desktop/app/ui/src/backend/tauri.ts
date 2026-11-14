import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { InfoMando, Instantanea } from '../dominio/tipos';
import type { Backend } from './backend';

/** Backend real: comandos de `src-tauri/src/comandos.rs`. */
export function crearBackendTauri(): Backend {
  return {
    info: () => invoke('info_app'),
    listarMandos: () => invoke('listar_mandos'),
    alCambiarMandos(cb) {
      const quitar = listen<InfoMando[]>('mandos-cambiados', (e) => cb(e.payload));
      return () => void quitar.then((f) => f());
    },
    suscribirEntrada(id, cb) {
      const canal = new Channel<Instantanea>();
      canal.onmessage = cb;
      void invoke('suscribir_entrada', { id, canal });
      return () => void invoke('cancelar_suscripcion', { canal: canal.id });
    },
    obtenerMapeo: (id) => invoke('obtener_mapeo', { id }),
    editarMapeo: (id, mapeo) => invoke('editar_mapeo', { id, mapeo }),
    guardarMapeo: (id) => invoke('guardar_mapeo', { id }),
    restablecerMapeo: (id) => invoke('restablecer_mapeo', { id }),
    autoMapear: (id) => invoke('auto_mapear', { id }),
    exportarSdl: (id) => invoke('exportar_sdl', { id }),
    importarSdl: (id, linea) => invoke('importar_sdl', { id, linea }),
    anadirMandos: (texto) => invoke('anadir_mandos', { texto }),
    actualizarBase: () => invoke('actualizar_base'),
    enviarAComunidad: (id) => invoke('enviar_a_comunidad', { id }),
    probarVibracion: (id) => invoke('probar_vibracion', { id }),
    asistenteIniciar: (id) => invoke('asistente_iniciar', { id }),
    asistenteSaltar: (id) => invoke('asistente_saltar', { id }),
    asistenteAtras: (id) => invoke('asistente_atras', { id }),
    asistenteCancelar: (id) => invoke('asistente_cancelar', { id }),
    asistenteAplicar: (id) => invoke('asistente_aplicar', { id }),
  };
}
