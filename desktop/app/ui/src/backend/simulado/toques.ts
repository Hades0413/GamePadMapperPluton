import { paqueteValido } from '../../dominio/configuracion';
import { ERROR } from '../../dominio/errores';
import type {
  BotonVista, ConfigToques, DispositivoAdb, IdMando, MapeoMando, PerfilComunidad, PerfilLocal, Rect, VentanaAbierta,
  VistaPerfil, VistaToques,
} from '../../dominio/tipos';
import type { Backend } from '../backend';

/**
 * Toques del backend simulado: dos perfiles de ejemplo, un Waydroid «conectado por adb» con
 * Clash Royale en primer plano, ventanas abiertas de mentira y una comunidad que siempre responde.
 */

const ESCRITORIO: [number, number] = [1920, 1080];

const EJEMPLOS: Record<string, string> = {
  'com-supercell-clashroyale-cartas': `package = com.supercell.clashroyale
name = Cartas
screen = 2340x1080
A = tap 1210 960
B = tap 1460 960
X = tap 1710 960
Y = tap 1960 960
L1 = tap 110 70
R1 = swipe 1170 860 1170 420 180
L2+A = quick 2200 80
LS = stick 330 780 140 dpad`,
  'com-mojang-minecraftpe-supervivencia': `package = com.mojang.minecraftpe
name = Supervivencia
screen = 2400x1080
A = tap 2150 880
B = tap 1950 960
X = tap 2210 640
Y = toggle 1990 470
R2 = turbo 1900 700 12
L2+A = tap 1000 300
R3 = macro 1980 895 0 40; 1705 398 60 40; 1600 300 20 60
LS = stick 360 800 150 dpad
RS = look 1500 500 14`,
};

const VENTANAS: VentanaAbierta[] = [
  { id: 0x3a00007, titulo: 'Waydroid', clase: 'Waydroid', rect: { x: 320, y: 140, ancho: 1280, alto: 720 }, activa: true },
  { id: 0x4c00003, titulo: 'Pixel 7', clase: 'scrcpy', rect: { x: 60, y: 80, ancho: 1040, alto: 480 }, activa: false },
  { id: 0x1e00012, titulo: 'Terminal', clase: 'Gnome-terminal', rect: { x: 900, y: 500, ancho: 900, alto: 520 }, activa: false },
];

/** Lectura minima de un .conf para el simulador (el de verdad valida en Rust). */
function leer(id: string, texto: string): VistaPerfil {
  const ajustes: Record<string, string> = {};
  const lista: BotonVista[] = [];
  for (const cruda of texto.split('\n')) {
    const linea = (cruda.split('#')[0] ?? '').trim();
    const igual = linea.indexOf('=');
    if (igual < 0) continue;
    const clave = linea.slice(0, igual).trim();
    const valor = linea.slice(igual + 1).trim();
    if (/^[a-z_]+$/.test(clave)) {
      ajustes[clave] = valor;
      continue;
    }
    const [tipo = '', ...resto] = valor.split(/\s+/);
    const n = resto.map(Number);
    const mas = clave.indexOf('+', 1);
    const capa = mas > 0 && mas < clave.length - 1;
    const pasos: [number, number][] = tipo === 'macro'
      ? valor.slice(5).split(';').map((p) => p.trim().split(/\s+/).map(Number)).map(([x = 0, y = 0]) => [x, y])
      : [];
    const [x, y] = pasos[0] ?? [n[0] ?? 0, n[1] ?? 0];
    lista.push({
      tecla: clave, boton: capa ? clave.slice(mas + 1) : clave, modificador: capa ? clave.slice(0, mas) : null, tipo, x, y,
      hasta: tipo === 'swipe' ? [n[2] ?? 0, n[3] ?? 0] : null, radio: tipo === 'stick' || tipo === 'look' ? n[2] ?? 0 : null, pasos,
    });
  }
  const [w = 2340, h = 1080] = (ajustes.screen ?? '').split('x').map(Number);
  return { id, paquete: ajustes.package ?? '', nombre: ajustes.name ?? null, pantalla: [w, h], botones: lista.length, lista };
}

const local = (v: VistaPerfil): PerfilLocal => ({ id: v.id, paquete: v.paquete, nombre: v.nombre, pantalla: v.pantalla, botones: v.botones });
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

type MetodosToques = Pick<Backend,
  'listarVentanas' | 'estadoToques' | 'pausarToques' | 'configToques' | 'guardarConfigToques' | 'perfilesToques'
  | 'verPerfilToques' | 'importarPerfilToques' | 'borrarPerfilToques' | 'buscarComunidadToques' | 'dispositivosAdb'>;

export function crearToquesSimulados(mapeos: () => Map<IdMando, { mapeo: MapeoMando }>, pausadoGlobal: () => boolean): MetodosToques {
  const perfiles = new Map<string, string>(Object.entries(EJEMPLOS));
  let config: ConfigToques = { adb: true, dispositivo: null, fijo: null, elegidos: {} };
  let pausa = false;
  const dispositivo: DispositivoAdb = { serie: '192.168.240.112:5555', estado: 'device', modelo: 'WayDroid_x86_64_Device' };

  const lista = (): PerfilLocal[] => [...perfiles.entries()].map(([id, texto]) => local(leer(id, texto)))
    .sort((a, b) => a.paquete.localeCompare(b.paquete) || (a.nombre ?? '').localeCompare(b.nombre ?? ''));

  const estado = (): VistaToques => {
    const mando = [...mapeos().entries()].find(([, e]) => e.mapeo.salida === 'toques');
    const paquete = config.adb ? 'com.supercell.clashroyale' : null;
    const todos = lista();
    const fijo = todos.find((p) => p.id === config.fijo);
    const elegido = paquete ? todos.find((p) => p.id === config.elegidos[paquete]) ?? todos.find((p) => p.paquete === paquete) : undefined;
    const perfil = fijo ?? elegido ?? null;
    let destino: Rect | null = null;
    let ventana: VentanaAbierta | undefined;
    const d = mando?.[1].mapeo.toques.destino;
    if (d?.tipo === 'pantalla_completa') destino = { x: 0, y: 0, ancho: ESCRITORIO[0], alto: ESCRITORIO[1] };
    else if (d?.tipo === 'rectangulo') destino = { x: d.x, y: d.y, ancho: d.ancho, alto: d.alto };
    else if (d?.tipo === 'ventana') {
      ventana = VENTANAS.find((v) => v.clase === d.clase && v.titulo === d.titulo) ?? VENTANAS.find((v) => v.clase === d.clase);
      destino = ventana?.rect ?? null;
    }
    const foco = ventana ? ventana.activa : null;
    const soloFoco = mando?.[1].mapeo.toques.solo_con_foco ?? true;
    const activo = !!mando && !pausa && !pausadoGlobal() && !!perfil && !!destino && (d?.tipo !== 'ventana' || !soloFoco || foco === true);
    return {
      mando: mando && !pausadoGlobal() ? mando[0] : null, perfil, origen: fijo ? 'fijo' : elegido ? 'detectado' : null, error_perfil: null,
      paquete, dispositivo: config.adb ? dispositivo : null, error_adb: null, destino, ventana: ventana?.titulo ?? null, foco,
      mapeando: activo, pausado: pausa, escritorio: mando ? ESCRITORIO : null,
    };
  };

  return {
    listarVentanas: async () => structuredClone(VENTANAS),
    estadoToques: async () => estado(),
    async pausarToques(p) {
      pausa = p;
      return estado();
    },
    configToques: async () => structuredClone(config),
    async guardarConfigToques(c) {
      if (c.fijo && !perfiles.has(c.fijo)) throw new Error(ERROR.toquesConfig);
      config = structuredClone(c);
      return structuredClone(config);
    },
    perfilesToques: async () => lista(),
    async verPerfilToques(id) {
      const texto = perfiles.get(id);
      if (!texto) throw new Error(ERROR.perfilNoExiste);
      return leer(id, texto);
    },
    async importarPerfilToques(texto) {
      const v = leer('', texto.trim());
      if (!v.paquete) throw new Error(ERROR.perfilSinPaquete);
      if (!paqueteValido(v.paquete)) throw new Error(ERROR.perfilPaquete);
      if (v.botones === 0) throw new Error(ERROR.perfilSinBotones);
      const base = `${v.paquete}-${v.nombre ?? 'perfil'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      let id = base;
      for (let n = 2; perfiles.has(id) && perfiles.get(id) !== texto.trim(); n++) id = `${base}-${n}`;
      perfiles.set(id, texto.trim());
      return local({ ...v, id });
    },
    async borrarPerfilToques(id) {
      if (!perfiles.delete(id)) throw new Error(ERROR.perfilNoExiste);
      if (config.fijo === id) config = { ...config, fijo: null };
      config = { ...config, elegidos: Object.fromEntries(Object.entries(config.elegidos).filter(([, v]) => v !== id)) };
      return lista();
    },
    async buscarComunidadToques(paquete) {
      if (!paqueteValido(paquete)) throw new Error(ERROR.perfilPaquete);
      await esperar(500);
      const base = paquete === 'com.mojang.minecraftpe' ? EJEMPLOS['com-mojang-minecraftpe-supervivencia'] ?? '' : EJEMPLOS['com-supercell-clashroyale-cartas'] ?? '';
      const conf = (nombre: string, extra: string) => `${base.replace(/^package = .*$/m, `package = ${paquete}`).replace(/^name = .*$/m, `name = ${nombre}`)}\n${extra}`;
      const resultados: [string, string, number, string][] = [
        ['5b3f1c2e-8a41-4d6b-9a0e-1c2d3e4f5a6b', 'Competitivo (comunidad)', 128, 'START = tap 2250 60'],
        ['0f8fad5b-d9cb-469f-a165-70867728950e', 'Una mano', 41, 'SELECT = tap 80 1000'],
      ];
      return resultados.map(([id, titulo, me_gusta, extra]): PerfilComunidad => {
        const v = leer(id, conf(titulo, extra));
        return { id, titulo, me_gusta, conf: conf(titulo, extra), paquete, pantalla: v.pantalla, lista: v.lista };
      });
    },
    async dispositivosAdb() {
      await esperar(300);
      return [dispositivo, { serie: 'emulator-5554', estado: 'offline', modelo: 'sdk_gphone64_x86_64' }];
    },
  };
}
