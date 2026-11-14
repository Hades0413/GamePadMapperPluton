import { PASOS_ASISTENTE } from '../../dominio/controles';
import { completarMapeo, LIMITES } from '../../dominio/configuracion';
import { leerFuente } from '../../dominio/fuentes';
import { ERROR } from '../../dominio/errores';
import { conAsignacion } from '../../dominio/mapeo';
import { CONTROLES } from '../../dominio/tipos';
import type {
  Control, Disponibilidad, EstadoCrudo, EstadoMapeo, IdMando, InfoMando, Instantanea, Juego, JuegoActivo, MapeoMando,
  OpcionesApp, VistaAsistente, VistaSalida,
} from '../../dominio/tipos';
import type { Backend } from '../backend';
import { aplicar, entradasExtra, pad } from './aplicar';
import { estadoAnimado, MANDO_PALETAS, MANDOS_SIMULADOS, mapeoAutomatico, reposo } from './mandos';

/**
 * Backend simulado para `pnpm dev` en el navegador: tres mandos que se mueven solos, un asistente
 * que «pulsa» cada control por ti, mandos virtuales de mentira, juegos y opciones en memoria. Los
 * mapeos guardados van a localStorage.
 */

const NOMBRE_SDL: Record<Control, string> = {
  A: 'a', B: 'b', X: 'x', Y: 'y', L1: 'leftshoulder', R1: 'rightshoulder', L2: 'lefttrigger', R2: 'righttrigger',
  L3: 'leftstick', R3: 'rightstick', SELECT: 'back', START: 'start', HOME: 'guide', DPAD_UP: 'dpup',
  DPAD_DOWN: 'dpdown', DPAD_LEFT: 'dpleft', DPAD_RIGHT: 'dpright', LS_X: 'leftx', LS_Y: 'lefty', RS_X: 'rightx',
  RS_Y: 'righty',
};
const CLAVE = (guid: string) => `gpm.escritorio.mapeo.${guid}`;
const CALIBRACION_MS = 700;
const ESPERA_MS = 900;
const PULSACION_MS = 450;

interface Asistente {
  inicio: number;
  pasoDesde: number;
  indice: number;
  asignaciones: Partial<Record<Control, string>>;
}

function leerGuardado(guid: string): MapeoMando | null {
  try {
    const t = localStorage.getItem(CLAVE(guid));
    return t ? completarMapeo(JSON.parse(t) as MapeoMando) : null;
  } catch {
    return null;
  }
}

/** Estado crudo con `fuente` pulsada a fondo. */
function pulsar(e: EstadoCrudo, texto: string): EstadoCrudo {
  const f = leerFuente(texto);
  if (!f) return e;
  if (f.tipo === 'boton') e.botones[f.indice] = true;
  else if (f.tipo === 'hat') e.hats[f.indice] = f.mascara;
  else e.ejes[f.indice] = (f.mitad === 'negativa' ? -1 : 1) * (f.invertido ? -1 : 1);
  return e;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function crearBackendSimulado(): Backend {
  const mapeos = new Map<IdMando, EstadoMapeo>();
  const estadoDe = (info: InfoMando, mapeo: MapeoMando, origen: EstadoMapeo['origen'], sinGuardar: boolean): EstadoMapeo =>
    ({ mapeo, origen, sin_guardar: sinGuardar, extras: entradasExtra(info, mapeo) });
  for (const info of MANDOS_SIMULADOS) {
    const guardado = leerGuardado(info.guid);
    mapeos.set(info.id, guardado ? estadoDe(info, guardado, 'guardado', false) : estadoDe(info, mapeoAutomatico(info), 'basedatos', false));
  }
  // El mando con paletas viene de ejemplo como DualShock 4 virtual con una paleta en turbo.
  const paletas = mapeos.get(MANDO_PALETAS.id);
  if (paletas && paletas.origen !== 'guardado') {
    paletas.mapeo.salida = 'dualshock4';
    paletas.mapeo.acciones = { b11: { tipo: 'pad', salida: 'A', modo: 'turbo', turbo_hz: 12 }, b12: { tipo: 'pad', salida: 'TOUCHPAD', modo: 'normal', turbo_hz: 10 } };
  }
  const asistentes = new Map<IdMando, Asistente>();
  const grabando = new Set<IdMando>();
  let entradasBase = 1614;
  let anadidos = 0;
  let actualizada: number | null = null;
  let pausado = false;
  const pausaCb = new Set<(p: boolean) => void>();
  let juegos: Juego[] = [{ id: 'hollow-knight', nombre: 'Hollow Knight', coincidencia: 'hollow_knight.exe', mapeos: {} }];
  let opciones: OpcionesApp = {
    minimizar_a_bandeja: true, iniciar_con_sistema: false, iniciar_minimizado: false, tema: 'oscuro', idioma: 'auto',
    cambio_automatico: true, atajo_pausa: 'Ctrl+Alt+P', registro: false, buscar_actualizaciones: true,
    ruta_registro: '~/.config/gamepad-mapper-pluton/registro.log',
  };

  const buscar = (id: IdMando): InfoMando => {
    const info = MANDOS_SIMULADOS.find((m) => m.id === id);
    if (!info) throw new Error(ERROR.noConectado);
    return info;
  };
  const estadoMapeo = (id: IdMando): EstadoMapeo => {
    const e = mapeos.get(id);
    if (!e) throw new Error(ERROR.noConectado);
    return structuredClone(e);
  };
  const poner = (id: IdMando, mapeo: MapeoMando, origen: EstadoMapeo['origen'], sinGuardar = true) => {
    const info = buscar(id);
    const limpio = completarMapeo({ ...structuredClone(mapeo), guid: info.guid, nombre: info.nombre });
    if (limpio.macros.length > LIMITES.macros || limpio.capas.length > LIMITES.capas) throw new Error(ERROR.validacionDemasiadas);
    if (limpio.macros.some((m) => m.pasos.length > LIMITES.pasos)) throw new Error(ERROR.validacionMacro);
    mapeos.set(id, estadoDe(info, limpio, origen, sinGuardar));
    return estadoMapeo(id);
  };
  const salida = (id: IdMando): VistaSalida => {
    const tipo = mapeos.get(id)?.mapeo.salida ?? 'ninguna';
    const activa = tipo !== 'ninguna' && !pausado;
    return { tipo, activa, descripcion: activa ? `/dev/input/event${30 + id}` : null, error: null };
  };

  const vistaAsistente = (a: Asistente, ahora: number): VistaAsistente => {
    const terminado = a.indice >= PASOS_ASISTENTE.length;
    const fase = terminado ? 'terminado' : ahora - a.inicio < CALIBRACION_MS ? 'calibrando' : 'esperando';
    return {
      fase, paso: terminado ? null : PASOS_ASISTENTE[a.indice] ?? null, indice: a.indice,
      total: PASOS_ASISTENTE.length, asignaciones: { ...a.asignaciones }, aviso: null, ejes_ruidosos: [],
    };
  };

  /** Avanza el asistente simulado y devuelve el estado crudo de ese instante. */
  const crudoCon = (info: InfoMando, ahora: number): EstadoCrudo => {
    const a = asistentes.get(info.id);
    if (!a) return estadoAnimado(info, ahora);
    const paso = PASOS_ASISTENTE[a.indice];
    if (!paso || ahora - a.inicio < CALIBRACION_MS) return reposo(info);
    const fuente = mapeoAutomatico(info).asignaciones[paso];
    const t = ahora - a.pasoDesde;
    if (!fuente || t >= ESPERA_MS + PULSACION_MS) {
      if (fuente) a.asignaciones[paso] = fuente;
      a.indice += 1;
      a.pasoDesde = ahora;
      return reposo(info);
    }
    return t >= ESPERA_MS ? pulsar(reposo(info), fuente) : reposo(info);
  };

  return {
    info: async () => ({
      version: '0.1.0', carpeta_mapeos: '~/.config/gamepad-mapper-pluton/mandos', entradas_base_datos: entradasBase,
      base_incluida: '2026-11-09', base_actualizada: actualizada, mandos_anadidos: anadidos, plataforma: 'linux', pausado,
    }),
    listarMandos: async () => structuredClone([...MANDOS_SIMULADOS]),
    alCambiarMandos: () => () => undefined,
    alCambiarPausa(cb) {
      pausaCb.add(cb);
      return () => pausaCb.delete(cb);
    },
    alCambiarJuego: () => () => undefined,
    suscribirEntrada(id, cb) {
      const info = buscar(id);
      const temporizador = setInterval(() => {
        const ahora = performance.now();
        const crudo = crudoCon(info, ahora);
        const a = asistentes.get(id);
        const m = estadoMapeo(id).mapeo;
        const estandar = aplicar(m, crudo);
        const instantanea: Instantanea = {
          id, crudo, estandar, asistente: a ? vistaAsistente(a, ahora) : null,
          pad: pausado ? { botones: 0, ls: [0, 0], rs: [0, 0], l2: 0, r2: 0 } : pad(m, estandar, crudo, ahora),
          salida: salida(id), juego: null, grabando: grabando.has(id), pausado,
        };
        cb(instantanea);
      }, 1000 / 60);
      return () => clearInterval(temporizador);
    },
    obtenerMapeo: async (id) => estadoMapeo(id),
    editarMapeo: async (id, mapeo) => poner(id, mapeo, 'manual'),
    async guardarMapeo(id) {
      const estado = estadoMapeo(id);
      try {
        localStorage.setItem(CLAVE(estado.mapeo.guid), JSON.stringify(estado.mapeo));
      } catch {
        // sin almacenamiento: se guarda solo en memoria
      }
      const guardado = poner(id, estado.mapeo, estado.origen, false);
      return { estado: guardado, ruta: `~/.config/gamepad-mapper-pluton/mandos/${estado.mapeo.guid}.json` };
    },
    async restablecerMapeo(id) {
      const info = buscar(id);
      try {
        localStorage.removeItem(CLAVE(info.guid));
      } catch {
        // nada que borrar
      }
      return poner(id, mapeoAutomatico(info), 'basedatos', false);
    },
    autoMapear: async (id) => poner(id, { ...estadoMapeo(id).mapeo, asignaciones: mapeoAutomatico(buscar(id)).asignaciones }, 'basedatos'),
    async exportarSdl(id) {
      const m = estadoMapeo(id).mapeo;
      const pares = Object.entries(m.asignaciones).map(([c, f]) => `${NOMBRE_SDL[c as Control]}:${f}`).join(',');
      return `${m.guid},${m.nombre},${pares},platform:Linux,`;
    },
    async importarSdl(id, linea) {
      const asignaciones: MapeoMando['asignaciones'] = {};
      for (const par of linea.split(',').slice(2)) {
        const [salidaSdl, entrada] = par.split(':');
        const control = CONTROLES.find((c) => NOMBRE_SDL[c] === salidaSdl);
        if (control && entrada && leerFuente(entrada)) asignaciones[control] = entrada;
      }
      return poner(id, { ...estadoMapeo(id).mapeo, asignaciones }, 'manual');
    },
    exportarConfig: async (id) => JSON.stringify(estadoMapeo(id).mapeo, null, 2),
    async importarConfig(id, texto) {
      if (texto.length > LIMITES.presetBytes) throw new Error(ERROR.validacionGrande);
      let m: MapeoMando;
      try {
        m = JSON.parse(texto) as MapeoMando;
      } catch {
        throw new Error(ERROR.validacionJson);
      }
      if (typeof m !== 'object' || typeof m.asignaciones !== 'object') throw new Error(ERROR.validacionJson);
      return poner(id, m, 'manual');
    },
    async anadirMandos(texto) {
      const n = texto.split('\n').filter((l) => /^[0-9a-f]{32},/i.test(l.trim())).length;
      if (n === 0) throw new Error(ERROR.sinMandosValidos);
      entradasBase += n;
      anadidos += n;
      return n;
    },
    async enviarAComunidad(id) {
      buscar(id);
    },
    async actualizarBase() {
      await esperar(600);
      const antes = entradasBase;
      entradasBase += 12;
      actualizada = Math.floor(Date.now() / 1000);
      return { antes, despues: entradasBase, comunidad: 3 };
    },
    probarVibracion: async (id) => {
      if (!buscar(id).vibracion) throw new Error(ERROR.sinVibracion);
    },
    probarMotores: async (id) => {
      if (!buscar(id).vibracion) throw new Error(ERROR.sinVibracion);
    },
    disponibilidadSalidas: async (): Promise<Disponibilidad[]> => [
      { tipo: 'xbox360', disponible: true, motivo: null },
      { tipo: 'dualshock4', disponible: true, motivo: null },
      { tipo: 'switchpro', disponible: true, motivo: null },
    ],
    async pausar(p) {
      pausado = p;
      pausaCb.forEach((cb) => cb(p));
      return p;
    },
    reintentarSalida: async (id) => salida(id),
    grabarMacroIniciar: async (id) => {
      grabando.add(id);
    },
    async grabarMacroTerminar(id) {
      if (!grabando.delete(id)) throw new Error(ERROR.sinGrabacion);
      return [
        { tipo: 'pulsar', salida: 'DPAD_DOWN' }, { tipo: 'esperar', ms: 60 }, { tipo: 'pulsar', salida: 'DPAD_RIGHT' },
        { tipo: 'soltar', salida: 'DPAD_DOWN' }, { tipo: 'esperar', ms: 60 }, { tipo: 'soltar', salida: 'DPAD_RIGHT' },
        { tipo: 'toque', salida: 'X', ms: 80 },
      ];
    },
    async asistenteIniciar(id) {
      buscar(id);
      const ahora = performance.now();
      const a = { inicio: ahora, pasoDesde: ahora + CALIBRACION_MS, indice: 0, asignaciones: {} };
      asistentes.set(id, a);
      return vistaAsistente(a, ahora);
    },
    async asistenteSaltar(id) {
      const a = asistentes.get(id);
      if (!a) throw new Error(ERROR.sinAsistente);
      a.indice = Math.min(PASOS_ASISTENTE.length, a.indice + 1);
      a.pasoDesde = performance.now();
      return vistaAsistente(a, performance.now());
    },
    async asistenteAtras(id) {
      const a = asistentes.get(id);
      if (!a) throw new Error(ERROR.sinAsistente);
      a.indice = Math.max(0, a.indice - 1);
      const paso = PASOS_ASISTENTE[a.indice];
      if (paso) a.asignaciones = conAsignacion(a.asignaciones, paso, null);
      a.pasoDesde = performance.now();
      return vistaAsistente(a, performance.now());
    },
    asistenteCancelar: async (id) => {
      asistentes.delete(id);
    },
    async asistenteAplicar(id) {
      const a = asistentes.get(id);
      if (!a || a.indice < PASOS_ASISTENTE.length) throw new Error(ERROR.asistenteSinTerminar);
      asistentes.delete(id);
      return poner(id, { ...estadoMapeo(id).mapeo, asignaciones: a.asignaciones }, 'asistente');
    },
    listarJuegos: async () => structuredClone(juegos),
    juegoActivo: async (): Promise<JuegoActivo | null> => null,
    async guardarJuego(juego) {
      if (!/^[a-z0-9-]{1,40}$/.test(juego.id) || !juego.nombre.trim() || !juego.coincidencia.trim()) throw new Error(ERROR.juegoNoValido);
      juegos = juegos.some((j) => j.id === juego.id) ? juegos.map((j) => (j.id === juego.id ? juego : j)) : [...juegos, juego];
      return structuredClone(juegos);
    },
    async borrarJuego(id) {
      if (!juegos.some((j) => j.id === id)) throw new Error(ERROR.juegoNoExiste);
      juegos = juegos.filter((j) => j.id !== id);
      return structuredClone(juegos);
    },
    async copiarAJuego(juego, id) {
      const m = estadoMapeo(id).mapeo;
      juegos = juegos.map((j) => (j.id === juego ? { ...j, mapeos: { ...j.mapeos, [m.guid]: m } } : j));
      return structuredClone(juegos);
    },
    async quitarDeJuego(juego, guid) {
      juegos = juegos.map((j) => (j.id === juego ? { ...j, mapeos: Object.fromEntries(Object.entries(j.mapeos).filter(([g]) => g !== guid)) } : j));
      return structuredClone(juegos);
    },
    async ventanaActiva() {
      await esperar(300);
      return { ejecutable: 'Celeste.exe', clase: 'celeste.exe', titulo: 'Celeste' };
    },
    obtenerOpciones: async () => ({ ...opciones }),
    async guardarOpciones(o) {
      if (!/^$|^((Ctrl|Alt|Shift|Super)\+)+([A-Z0-9]|F([1-9]|1[0-2]))$/.test(o.atajo_pausa)) throw new Error(ERROR.atajoNoValido);
      opciones = { ...opciones, ...o };
      return { ...opciones };
    },
    leerRegistro: async () => [
      '10:15:02 UTC [INFO] Gamepad Mapper Pluton 0.1.0 — mapeos en ~/.config/gamepad-mapper-pluton/mandos',
      '10:15:02 UTC [INFO] mando conectado: Mando Pro con paletas (simulado) (/dev/input/event23)',
      '10:15:02 UTC [INFO] mando virtual Dualshock4 creado en /dev/input/event33',
      '10:15:02 UTC [INFO] Mando Pro con paletas (simulado) capturado (EVIOCGRAB)',
    ],
    abrirEnlace: async () => undefined,
    buscarActualizacion: async () => {
      await esperar(500);
      return null;
    },
    instalarActualizacion: async () => undefined,
  };
}
