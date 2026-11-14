import { PASOS_ASISTENTE } from '../../dominio/controles';
import { leerFuente } from '../../dominio/fuentes';
import { ERROR } from '../../dominio/errores';
import { conAsignacion } from '../../dominio/mapeo';
import { CONTROLES } from '../../dominio/tipos';
import type {
  Control, EstadoCrudo, EstadoMapeo, IdMando, InfoMando, Instantanea, MapeoMando, VistaAsistente,
} from '../../dominio/tipos';
import type { Backend } from '../backend';
import { aplicar } from './aplicar';
import { estadoAnimado, MANDOS_SIMULADOS, mapeoAutomatico, reposo } from './mandos';

/**
 * Backend simulado para `pnpm dev` en el navegador: dos mandos que se mueven solos y un asistente
 * que «pulsa» cada control por ti. Los mapeos guardados van a localStorage.
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
    return t ? (JSON.parse(t) as MapeoMando) : null;
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

export function crearBackendSimulado(): Backend {
  const mapeos = new Map<IdMando, EstadoMapeo>();
  for (const info of MANDOS_SIMULADOS) {
    const guardado = leerGuardado(info.guid);
    mapeos.set(info.id, guardado
      ? { mapeo: guardado, origen: 'guardado', sin_guardar: false }
      : { mapeo: mapeoAutomatico(info), origen: 'basedatos', sin_guardar: false });
  }
  const asistentes = new Map<IdMando, Asistente>();
  let entradasBase = 369;

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
    mapeos.set(id, { mapeo: { ...structuredClone(mapeo), guid: info.guid, nombre: info.nombre }, origen, sin_guardar: sinGuardar });
    return estadoMapeo(id);
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
    info: async () => ({ version: '0.1.0', carpeta_mapeos: '~/.config/gamepad-mapper-pluton/mandos', entradas_base_datos: entradasBase }),
    listarMandos: async () => structuredClone([...MANDOS_SIMULADOS]),
    alCambiarMandos: () => () => undefined,
    suscribirEntrada(id, cb) {
      const info = buscar(id);
      const temporizador = setInterval(() => {
        const ahora = performance.now();
        const crudo = crudoCon(info, ahora);
        const a = asistentes.get(id);
        const instantanea: Instantanea = {
          id, crudo, estandar: aplicar(estadoMapeo(id).mapeo, crudo), asistente: a ? vistaAsistente(a, ahora) : null,
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
    autoMapear: async (id) => poner(id, { ...mapeoAutomatico(buscar(id)), stick_izquierdo: estadoMapeo(id).mapeo.stick_izquierdo, stick_derecho: estadoMapeo(id).mapeo.stick_derecho }, 'basedatos'),
    async exportarSdl(id) {
      const m = estadoMapeo(id).mapeo;
      const pares = Object.entries(m.asignaciones).map(([c, f]) => `${NOMBRE_SDL[c as Control]}:${f}`).join(',');
      return `${m.guid},${m.nombre},${pares},platform:Linux,`;
    },
    async importarSdl(id, linea) {
      const asignaciones: MapeoMando['asignaciones'] = {};
      for (const par of linea.split(',').slice(2)) {
        const [salida, entrada] = par.split(':');
        const control = CONTROLES.find((c) => NOMBRE_SDL[c] === salida);
        if (control && entrada && leerFuente(entrada)) asignaciones[control] = entrada;
      }
      return poner(id, { ...estadoMapeo(id).mapeo, asignaciones }, 'manual');
    },
    async cargarBaseDatos(texto) {
      const n = texto.split('\n').filter((l) => /^[0-9a-f]{32},/i.test(l.trim())).length;
      entradasBase += n;
      return n;
    },
    probarVibracion: async (id) => {
      if (!buscar(id).vibracion) throw new Error(ERROR.sinVibracion);
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
  };
}
