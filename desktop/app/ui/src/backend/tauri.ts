import { Channel, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { InfoMando, Instantanea, JuegoActivo } from '../dominio/tipos';
import type { Backend } from './backend';

function escuchar<T>(evento: string, cb: (v: T) => void): () => void {
  const quitar = listen<T>(evento, (e) => cb(e.payload));
  return () => void quitar.then((f) => f());
}

/** Backend real: comandos de `src-tauri/src/comandos.rs` y `actualizar.rs`. */
export function crearBackendTauri(): Backend {
  return {
    info: () => invoke('info_app'),
    listarMandos: () => invoke('listar_mandos'),
    alCambiarMandos: (cb) => escuchar<InfoMando[]>('mandos-cambiados', cb),
    alCambiarPausa: (cb) => escuchar<boolean>('pausa-cambiada', cb),
    alCambiarJuego: (cb) => escuchar<[string, string] | null>('juego-cambiado', (j) => cb(j ? { id: j[0], nombre: j[1] } as JuegoActivo : null)),
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
    exportarConfig: (id) => invoke('exportar_config', { id }),
    importarConfig: (id, texto) => invoke('importar_config', { id, texto }),
    anadirMandos: (texto) => invoke('anadir_mandos', { texto }),
    actualizarBase: () => invoke('actualizar_base'),
    enviarAComunidad: (id) => invoke('enviar_a_comunidad', { id }),
    probarVibracion: (id) => invoke('probar_vibracion', { id }),
    probarMotores: (id, fuerte, debil) => invoke('probar_motores', { id, fuerte, debil }),
    disponibilidadSalidas: () => invoke('disponibilidad_salidas'),
    pausar: (pausado) => invoke('pausar', { pausado }),
    reintentarSalida: (id) => invoke('reintentar_salida', { id }),
    grabarMacroIniciar: (id) => invoke('grabar_macro_iniciar', { id }),
    grabarMacroTerminar: (id) => invoke('grabar_macro_terminar', { id }),
    asistenteIniciar: (id) => invoke('asistente_iniciar', { id }),
    asistenteSaltar: (id) => invoke('asistente_saltar', { id }),
    asistenteAtras: (id) => invoke('asistente_atras', { id }),
    asistenteCancelar: (id) => invoke('asistente_cancelar', { id }),
    asistenteAplicar: (id) => invoke('asistente_aplicar', { id }),
    listarJuegos: () => invoke('listar_juegos'),
    juegoActivo: () => invoke('juego_activo'),
    guardarJuego: (juego) => invoke('guardar_juego', { juego }),
    borrarJuego: (juego) => invoke('borrar_juego', { juego }),
    copiarAJuego: (juego, id) => invoke('copiar_a_juego', { juego, id }),
    quitarDeJuego: (juego, guid) => invoke('quitar_de_juego', { juego, guid }),
    ventanaActiva: () => invoke('ventana_activa'),
    obtenerOpciones: () => invoke('obtener_opciones'),
    guardarOpciones: (opciones) => invoke('guardar_opciones', { opciones }),
    leerRegistro: () => invoke('leer_registro'),
    abrirEnlace: (cual) => invoke('abrir_enlace', { cual }),
    buscarActualizacion: () => invoke('buscar_actualizacion'),
    instalarActualizacion: () => invoke('instalar_actualizacion'),
  };
}
