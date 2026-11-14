//! Mandos en Linux con evdev (`/dev/input/event*`).
//!
//! - Solo se abren los dispositivos que parecen mandos (misma regla que `gpm_evdev_es_mando` del
//!   motor en C): al menos 4 botones de mando o joystick, ABS_X y ABS_Y, y sin BTN_TOUCH.
//! - Los botones, ejes y hats se numeran como SDL en Linux (botones desde BTN_JOYSTICK hasta el
//!   final y luego los de antes; ejes por codigo saltando los hats), asi las lineas `platform:Linux`
//!   de SDL GameControllerDB sirven sin cambios.
//! - Conexion en caliente: cada segundo se mira la lista de `/dev/input`. Es mas sencillo y robusto
//!   que inotify: udev cambia los permisos del nodo un poco despues de crearlo, y con un reintento
//!   periodico no hace falta tratar esa carrera aparte. Las desconexiones se detectan al leer
//!   (ENODEV / POLLHUP) al instante.

use super::{
    hat, normalizar, Cambio, Conexion, DescEntrada, ErrorMandos, EstadoCrudo, Evento, FuenteMandos, IdMando, InfoMando,
    Plataforma,
};
use crate::mapeo::sdl::guid_sdl;
use evdev::{
    AbsoluteAxisCode, Device, EventSummary, FFEffect, FFEffectCode, FFEffectData, FFEffectKind, FFReplay, FFTrigger,
    KeyCode,
};
use std::collections::{HashMap, HashSet};
use std::io;
use std::os::fd::AsRawFd;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const BTN_JOYSTICK: u16 = 0x120;
const BTN_THUMBR: u16 = 0x13e;
const BTN_TOUCH: u16 = 0x14a;
const BTN_TRIGGER_HAPPY: u16 = 0x2c0;
const KEY_MAX: u16 = 0x2ff;
const ABS_HAT0X: u16 = 0x10;
const ABS_HAT3Y: u16 = 0x17;
const ABS_CNT: u16 = 0x40;
const BUS_USB: u16 = 0x03;
const BUS_BLUETOOTH: u16 = 0x05;
const BUS_VIRTUAL: u16 = 0x06;

const INTERVALO_ESCANEO: Duration = Duration::from_secs(1);

/// ¿Parece un mando? (igual que `gpm_evdev_es_mando` en `mapper/src/linux/gpm_evdev.c`).
pub fn es_mando(dev: &Device) -> bool {
    let Some(teclas) = dev.supported_keys() else { return false };
    if teclas.contains(KeyCode(BTN_TOUCH)) {
        return false;
    }
    let botones = teclas
        .iter()
        .filter(|k| {
            (BTN_JOYSTICK..=BTN_THUMBR).contains(&k.0) || (BTN_TRIGGER_HAPPY..BTN_TRIGGER_HAPPY + 40).contains(&k.0)
        })
        .count();
    let ejes = dev.supported_absolute_axes();
    botones >= 4 && ejes.is_some_and(|e| e.contains(AbsoluteAxisCode::ABS_X) && e.contains(AbsoluteAxisCode::ABS_Y))
}

struct Abierto {
    info: InfoMando,
    dev: Device,
    /// codigo evdev -> indice SDL
    botones: HashMap<u16, u16>,
    /// codigo evdev -> (indice SDL, minimo, maximo)
    ejes: HashMap<u16, (u16, i32, i32)>,
    /// codigo ABS_HATnX/Y -> indice de hat
    hats: HashMap<u16, u8>,
    hat_xy: Vec<(i32, i32)>,
    estado: EstadoCrudo,
    efecto: Option<FFEffect>,
}

pub struct FuenteEvdev {
    dir: PathBuf,
    abiertos: Vec<Abierto>,
    /// Nodos que no son mandos: no se vuelven a abrir mientras existan.
    descartados: HashSet<PathBuf>,
    siguiente_id: u32,
    ultimo_escaneo: Option<Instant>,
}

impl Default for FuenteEvdev {
    fn default() -> Self {
        Self::nueva()
    }
}

impl FuenteEvdev {
    pub fn nueva() -> Self {
        Self::en(Path::new("/dev/input"))
    }

    /// Fuente sobre otra carpeta de dispositivos (pruebas).
    pub fn en(dir: &Path) -> Self {
        Self {
            dir: dir.to_owned(),
            abiertos: Vec::new(),
            descartados: HashSet::new(),
            siguiente_id: 0,
            ultimo_escaneo: None,
        }
    }

    fn escanear(&mut self, eventos: &mut Vec<Evento>) {
        self.ultimo_escaneo = Some(Instant::now());
        let Ok(entradas) = std::fs::read_dir(&self.dir) else { return };
        let mut presentes = HashSet::new();
        let mut rutas: Vec<PathBuf> = entradas
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("event")))
            .collect();
        rutas.sort_by_key(|p| numero_evento(p));
        for ruta in rutas {
            presentes.insert(ruta.clone());
            if self.descartados.contains(&ruta) || self.abiertos.iter().any(|a| a.info.ruta == ruta.to_string_lossy()) {
                continue;
            }
            match Device::open(&ruta) {
                Ok(dev) if es_mando(&dev) => match self.preparar(dev, &ruta) {
                    Ok(abierto) => {
                        log::info!("mando conectado: {} ({})", abierto.info.nombre, abierto.info.ruta);
                        eventos.push(Evento::Conectado { info: abierto.info.clone() });
                        self.abiertos.push(abierto);
                    }
                    Err(e) => log::warn!("no se pudo preparar {}: {e}", ruta.display()),
                },
                Ok(_) => {
                    self.descartados.insert(ruta);
                }
                // Sin permiso (aun): se reintenta en el siguiente escaneo.
                Err(_) => {}
            }
        }
        self.descartados.retain(|p| presentes.contains(p));
    }

    fn preparar(&mut self, dev: Device, ruta: &Path) -> io::Result<Abierto> {
        dev.set_nonblocking(true)?;
        let id = dev.input_id();
        let nombre = dev.name().unwrap_or("Mando sin nombre").trim().to_owned();

        // Botones en el orden de SDL: desde BTN_JOYSTICK hasta el final, luego los anteriores.
        let teclas: Vec<u16> = dev.supported_keys().map(|k| k.iter().map(|c| c.0).collect()).unwrap_or_default();
        let orden = teclas
            .iter()
            .filter(|c| (BTN_JOYSTICK..KEY_MAX).contains(*c))
            .chain(teclas.iter().filter(|c| **c < BTN_JOYSTICK));
        let mut botones = HashMap::new();
        let mut desc_botones = Vec::new();
        for (i, codigo) in orden.enumerate() {
            let i = i as u16;
            botones.insert(*codigo, i);
            desc_botones.push(DescEntrada { indice: i, codigo: *codigo, nombre: nombre_tecla(*codigo) });
        }

        let info_abs = dev.get_abs_state()?;
        let codigos_abs: Vec<u16> =
            dev.supported_absolute_axes().map(|a| a.iter().map(|c| c.0).collect()).unwrap_or_default();
        let mut ejes = HashMap::new();
        let mut desc_ejes = Vec::new();
        let mut hats = HashMap::new();
        let mut estado_ejes = Vec::new();
        for codigo in codigos_abs.iter().copied().filter(|c| *c < ABS_CNT && !(ABS_HAT0X..=ABS_HAT3Y).contains(c)) {
            let ai = info_abs[usize::from(codigo)];
            let i = desc_ejes.len() as u16;
            ejes.insert(codigo, (i, ai.minimum, ai.maximum));
            desc_ejes.push(DescEntrada { indice: i, codigo, nombre: format!("{:?}", AbsoluteAxisCode(codigo)) });
            estado_ejes.push(normalizar(ai.value, ai.minimum, ai.maximum));
        }
        let mut num_hats = 0u8;
        for base in (ABS_HAT0X..=ABS_HAT3Y).step_by(2) {
            if codigos_abs.contains(&base) || codigos_abs.contains(&(base + 1)) {
                hats.insert(base, num_hats);
                hats.insert(base + 1, num_hats);
                num_hats += 1;
            }
        }

        let vibracion = dev.supported_ff().is_some_and(|f| f.contains(FFEffectCode::FF_RUMBLE));
        let bus = id.bus_type().0;
        self.siguiente_id += 1;
        let info = InfoMando {
            id: IdMando(self.siguiente_id),
            guid: guid_sdl(bus, id.vendor(), id.product(), id.version(), &nombre),
            nombre,
            vendedor: id.vendor(),
            producto: id.product(),
            version: id.version(),
            conexion: match bus {
                BUS_USB => Conexion::Usb,
                BUS_BLUETOOTH => Conexion::Bluetooth,
                BUS_VIRTUAL => Conexion::Virtual,
                _ => Conexion::Otra,
            },
            plataforma: Plataforma::Evdev,
            ruta: ruta.to_string_lossy().into_owned(),
            botones: desc_botones,
            ejes: desc_ejes,
            hats: num_hats,
            vibracion,
        };
        let mut estado = EstadoCrudo::para(&info);
        estado.ejes = estado_ejes;
        if let Ok(pulsadas) = dev.get_key_state() {
            for k in pulsadas.iter() {
                if let Some(i) = botones.get(&k.0) {
                    estado.botones[usize::from(*i)] = true;
                }
            }
        }
        let mut hat_xy = vec![(0, 0); usize::from(num_hats)];
        for (codigo, h) in &hats {
            let v = info_abs[usize::from(*codigo)].value.signum();
            let par = &mut hat_xy[usize::from(*h)];
            if (codigo - ABS_HAT0X) % 2 == 0 {
                par.0 = v;
            } else {
                par.1 = v;
            }
        }
        for (h, (x, y)) in hat_xy.iter().enumerate() {
            estado.hats[h] = hat::desde_xy(*x, *y);
        }
        Ok(Abierto { info, dev, botones, ejes, hats, hat_xy, estado, efecto: None })
    }

    fn buscar(&mut self, id: IdMando) -> Option<&mut Abierto> {
        self.abiertos.iter_mut().find(|a| a.info.id == id)
    }
}

impl Abierto {
    /// Lee todo lo pendiente. Devuelve false si el dispositivo ya no existe.
    fn leer(&mut self, eventos: &mut Vec<Evento>) -> bool {
        let id = self.info.id;
        let crudos: Vec<EventSummary> = match self.dev.fetch_events() {
            Ok(it) => it.map(EventSummary::from).collect(),
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => return true,
            Err(e) => {
                log::info!("mando desconectado: {} ({e})", self.info.nombre);
                return false;
            }
        };
        for ev in crudos {
            let cambio = match ev {
                EventSummary::Key(_, KeyCode(codigo), valor) => {
                    self.botones.get(&codigo).map(|i| Cambio::Boton { indice: *i, pulsado: valor != 0 })
                }
                EventSummary::AbsoluteAxis(_, AbsoluteAxisCode(codigo), valor) => {
                    if let Some(h) = self.hats.get(&codigo).copied() {
                        let par = &mut self.hat_xy[usize::from(h)];
                        if (codigo - ABS_HAT0X) % 2 == 0 {
                            par.0 = valor.signum();
                        } else {
                            par.1 = valor.signum();
                        }
                        Some(Cambio::Hat { indice: h, valor: hat::desde_xy(par.0, par.1) })
                    } else {
                        self.ejes
                            .get(&codigo)
                            .map(|(i, min, max)| Cambio::Eje { indice: *i, valor: normalizar(valor, *min, *max) })
                    }
                }
                _ => None,
            };
            if let Some(cambio) = cambio {
                let antes = self.estado.clone();
                self.estado.aplicar(&cambio);
                if self.estado != antes {
                    eventos.push(Evento::Entrada { id, cambio });
                }
            }
        }
        true
    }
}

impl FuenteMandos for FuenteEvdev {
    fn mandos(&self) -> Vec<InfoMando> {
        self.abiertos.iter().map(|a| a.info.clone()).collect()
    }

    fn estado(&self, id: IdMando) -> Option<EstadoCrudo> {
        self.abiertos.iter().find(|a| a.info.id == id).map(|a| a.estado.clone())
    }

    fn sondear(&mut self, espera: Duration, eventos: &mut Vec<Evento>) {
        if self.ultimo_escaneo.is_none_or(|t| t.elapsed() >= INTERVALO_ESCANEO) {
            self.escanear(eventos);
        }
        let mut fds: Vec<libc::pollfd> = self
            .abiertos
            .iter()
            .map(|a| libc::pollfd { fd: a.dev.as_raw_fd(), events: libc::POLLIN, revents: 0 })
            .collect();
        let ms = espera.as_millis().min(1000) as libc::c_int;
        // SAFETY: `fds` es un vector valido de pollfd con su longitud real; los descriptores son de
        // dispositivos abiertos que viven mientras dura la llamada.
        let listos = unsafe { libc::poll(fds.as_mut_ptr(), fds.len() as libc::nfds_t, ms) };
        if listos <= 0 {
            return;
        }
        let mut perdidos = Vec::new();
        for (a, fd) in self.abiertos.iter_mut().zip(&fds) {
            let roto = fd.revents & (libc::POLLHUP | libc::POLLERR | libc::POLLNVAL) != 0;
            if (fd.revents & libc::POLLIN != 0 && !a.leer(eventos)) || roto {
                perdidos.push(a.info.id);
            }
        }
        for id in perdidos {
            self.abiertos.retain(|a| a.info.id != id);
            eventos.push(Evento::Desconectado { id });
        }
    }

    fn vibrar(&mut self, id: IdMando, fuerte: f32, debil: f32, duracion: Duration) -> Result<(), ErrorMandos> {
        let a = self.buscar(id).ok_or(ErrorMandos::NoEncontrado)?;
        if !a.info.vibracion {
            return Err(ErrorMandos::SinVibracion);
        }
        let magnitud = |v: f32| (v.clamp(0.0, 1.0) * f32::from(u16::MAX)) as u16;
        let datos = FFEffectData {
            direction: 0,
            trigger: FFTrigger::default(),
            replay: FFReplay { length: duracion.as_millis().min(u128::from(u16::MAX)) as u16, delay: 0 },
            kind: FFEffectKind::Rumble { strong_magnitude: magnitud(fuerte), weak_magnitude: magnitud(debil) },
        };
        // El efecto anterior se borra al soltarlo (Drop de FFEffect).
        a.efecto = None;
        let mut efecto = a.dev.upload_ff_effect(datos)?;
        efecto.play(1)?;
        a.efecto = Some(efecto);
        Ok(())
    }
}

fn numero_evento(ruta: &Path) -> u32 {
    ruta.file_name()
        .and_then(|n| n.to_str())
        .and_then(|n| n.strip_prefix("event"))
        .and_then(|n| n.parse().ok())
        .unwrap_or(u32::MAX)
}

fn nombre_tecla(codigo: u16) -> String {
    let nombre = format!("{:?}", KeyCode(codigo));
    if nombre.starts_with("unknown") {
        format!("BTN_0x{codigo:03x}")
    } else {
        nombre
    }
}
