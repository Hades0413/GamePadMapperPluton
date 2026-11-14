//! Mandos virtuales en Linux con uinput.
//!
//! Cada tipo copia lo que expone el driver del kernel del mando de verdad (nombre, bus USB,
//! vendedor, producto, version, botones, ejes y rangos), asi SDL lo identifica por su GUID y usa
//! la misma linea de GameControllerDB que con el mando real:
//!
//! | tipo        | driver          | ids         | version | sticks           | gatillos      |
//! |-------------|-----------------|-------------|---------|------------------|---------------|
//! | Xbox 360    | xpad            | 045e:028e   | 0x0114  | -32768..32767    | ABS_Z/RZ 0..255 |
//! | DualShock 4 | hid-playstation | 054c:09cc   | 0x8111  | 0..255 (128)     | ABS_Z/RZ 0..255 + BTN_TL2/TR2 |
//! | Switch Pro  | hid-nintendo    | 057e:2009   | 0x8111  | -32767..32767    | BTN_TL2/TR2 (digitales) |
//!
//! Todos llevan la marca [`MARCA_PHYS`] en `phys`: la fuente de mandos la usa para no leer
//! nuestros propios mandos virtuales. La vibracion que el juego sube al mando virtual (FF_RUMBLE)
//! se recoge en [`SalidaVirtual::vibracion`] para reenviarla al mando fisico.

use super::{
    a_rango, Disponibilidad, ErrorSalida, EstadoPad, FabricaSalidas, SalidaVirtual, Teclado, TipoSalida,
};
use crate::mapeo::acciones::{SalidaPad, TECLAS};
use evdev::uinput::VirtualDevice;
use evdev::{
    AbsInfo, AbsoluteAxisCode as A, AttributeSet, BusType, EventSummary, EventType, FFEffectCode, FFEffectKind,
    InputEvent, InputId, KeyCode as K, UInputCode, UinputAbsSetup,
};
use std::collections::HashMap;
use std::ffi::CString;
use std::io;
use std::os::fd::AsRawFd;
use std::path::PathBuf;
use std::time::{Duration, Instant};

/// Prefijo de `phys` de todos los dispositivos que crea la app.
pub const MARCA_PHYS: &str = "gamepad-mapper-pluton/virtual";

struct Disposicion {
    nombre: &'static str,
    vendedor: u16,
    producto: u16,
    version: u16,
    botones: &'static [(SalidaPad, K)],
    /// (minimo, centro, maximo, fuzz, flat) de los sticks.
    stick: (i32, i32, i32, i32, i32),
    /// Gatillos analogicos en ABS_Z/ABS_RZ (0..255).
    gatillos_analogicos: bool,
    /// Gatillos tambien como botones BTN_TL2/BTN_TR2.
    gatillos_digitales: bool,
}

const XBOX360: Disposicion = Disposicion {
    nombre: "Microsoft X-Box 360 pad",
    vendedor: 0x045e,
    producto: 0x028e,
    version: 0x0114,
    // xpad: el boton X (izquierda) es BTN_X (= BTN_NORTH) y el Y (arriba) BTN_Y (= BTN_WEST).
    botones: &[
        (SalidaPad::A, K::BTN_SOUTH),
        (SalidaPad::B, K::BTN_EAST),
        (SalidaPad::X, K::BTN_NORTH),
        (SalidaPad::Y, K::BTN_WEST),
        (SalidaPad::L1, K::BTN_TL),
        (SalidaPad::R1, K::BTN_TR),
        (SalidaPad::Select, K::BTN_SELECT),
        (SalidaPad::Start, K::BTN_START),
        (SalidaPad::Home, K::BTN_MODE),
        (SalidaPad::L3, K::BTN_THUMBL),
        (SalidaPad::R3, K::BTN_THUMBR),
    ],
    stick: (-32768, 0, 32767, 16, 128),
    gatillos_analogicos: true,
    gatillos_digitales: false,
};

const DUALSHOCK4: Disposicion = Disposicion {
    nombre: "Sony Interactive Entertainment Wireless Controller",
    vendedor: 0x054c,
    producto: 0x09cc,
    version: 0x8111,
    // hid-playstation: cruz abajo (SOUTH), circulo (EAST), triangulo (NORTH), cuadrado (WEST).
    botones: &[
        (SalidaPad::A, K::BTN_SOUTH),
        (SalidaPad::B, K::BTN_EAST),
        (SalidaPad::Y, K::BTN_NORTH),
        (SalidaPad::X, K::BTN_WEST),
        (SalidaPad::L1, K::BTN_TL),
        (SalidaPad::R1, K::BTN_TR),
        (SalidaPad::Select, K::BTN_SELECT),
        (SalidaPad::Start, K::BTN_START),
        (SalidaPad::Home, K::BTN_MODE),
        (SalidaPad::L3, K::BTN_THUMBL),
        (SalidaPad::R3, K::BTN_THUMBR),
    ],
    stick: (0, 128, 255, 0, 0),
    gatillos_analogicos: true,
    gatillos_digitales: true,
};

const SWITCHPRO: Disposicion = Disposicion {
    nombre: "Nintendo Switch Pro Controller",
    vendedor: 0x057e,
    producto: 0x2009,
    version: 0x8111,
    // hid-nintendo (por posicion): B abajo (SOUTH), A derecha (EAST), X arriba (NORTH),
    // Y izquierda (WEST), captura BTN_Z.
    botones: &[
        (SalidaPad::A, K::BTN_SOUTH),
        (SalidaPad::B, K::BTN_EAST),
        (SalidaPad::Y, K::BTN_NORTH),
        (SalidaPad::X, K::BTN_WEST),
        (SalidaPad::Captura, K::BTN_Z),
        (SalidaPad::L1, K::BTN_TL),
        (SalidaPad::R1, K::BTN_TR),
        (SalidaPad::Select, K::BTN_SELECT),
        (SalidaPad::Start, K::BTN_START),
        (SalidaPad::Home, K::BTN_MODE),
        (SalidaPad::L3, K::BTN_THUMBL),
        (SalidaPad::R3, K::BTN_THUMBR),
    ],
    stick: (-32767, 0, 32767, 250, 500),
    gatillos_analogicos: false,
    gatillos_digitales: true,
};

fn disposicion(tipo: TipoSalida) -> Option<&'static Disposicion> {
    match tipo {
        TipoSalida::Xbox360 => Some(&XBOX360),
        TipoSalida::Dualshock4 => Some(&DUALSHOCK4),
        TipoSalida::Switchpro => Some(&SWITCHPRO),
        TipoSalida::Ninguna => None,
    }
}

fn no_bloqueante(fd: i32) -> io::Result<()> {
    // SAFETY: fcntl sobre un descriptor abierto que pertenece al dispositivo; solo cambia flags.
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags < 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: igual que arriba.
    if unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

fn error_creacion(e: io::Error) -> ErrorSalida {
    if matches!(e.kind(), io::ErrorKind::PermissionDenied | io::ErrorKind::NotFound) {
        ErrorSalida::SinPermisoUinput
    } else {
        ErrorSalida::Io(e)
    }
}

/// Efecto de vibracion subido por el juego.
#[derive(Clone, Copy)]
struct Efecto {
    fuerte: u16,
    debil: u16,
    duracion: Duration,
}

pub struct SalidaUinput {
    tipo: TipoSalida,
    disp: &'static Disposicion,
    dev: VirtualDevice,
    nodo: Option<PathBuf>,
    efectos: HashMap<i16, Efecto>,
    /// Efecto sonando y hasta cuando (None = sin fin).
    sonando: Option<(i16, Option<Instant>)>,
    ganancia: f32,
    ultima_vibracion: (f32, f32),
    anterior: Option<EstadoPad>,
}

impl SalidaUinput {
    pub fn crear(tipo: TipoSalida, numero: u32) -> Result<Self, ErrorSalida> {
        let disp = disposicion(tipo).ok_or(ErrorSalida::NoDisponible)?;
        let mut teclas = AttributeSet::<K>::new();
        for (_, k) in disp.botones {
            teclas.insert(*k);
        }
        if disp.gatillos_digitales {
            teclas.insert(K::BTN_TL2);
            teclas.insert(K::BTN_TR2);
        }
        let mut ff = AttributeSet::<FFEffectCode>::new();
        ff.insert(FFEffectCode::FF_RUMBLE);
        ff.insert(FFEffectCode::FF_GAIN);
        let phys = CString::new(format!("{MARCA_PHYS}/{numero}")).map_err(|e| ErrorSalida::Io(io::Error::other(e)))?;
        let (min, centro, max, fuzz, flat) = disp.stick;
        let stick = AbsInfo::new(centro, min, max, fuzz, flat, 0);
        let gatillo = AbsInfo::new(0, 0, 255, 0, 0, 0);
        let hat = AbsInfo::new(0, -1, 1, 0, 0, 0);
        let mut b = VirtualDevice::builder()
            .map_err(error_creacion)?
            .name(disp.nombre)
            .input_id(InputId::new(BusType::BUS_USB, disp.vendedor, disp.producto, disp.version))
            .with_phys(&phys)?
            .with_keys(&teclas)?
            .with_ff(&ff)?
            .with_ff_effects_max(16);
        // Mismo orden de ejes que el driver (SDL los numera por codigo).
        let mut ejes = vec![(A::ABS_X, stick), (A::ABS_Y, stick)];
        if disp.gatillos_analogicos {
            ejes.push((A::ABS_Z, gatillo));
        }
        ejes.extend([(A::ABS_RX, stick), (A::ABS_RY, stick)]);
        if disp.gatillos_analogicos {
            ejes.push((A::ABS_RZ, gatillo));
        }
        ejes.extend([(A::ABS_HAT0X, hat), (A::ABS_HAT0Y, hat)]);
        for (eje, info) in ejes {
            b = b.with_absolute_axis(&UinputAbsSetup::new(eje, info))?;
        }
        let mut dev = b.build().map_err(error_creacion)?;
        no_bloqueante(dev.as_raw_fd())?;
        let nodo = dev
            .enumerate_dev_nodes_blocking()
            .ok()
            .and_then(|mut it| it.find_map(|p| p.ok().filter(|p| p.to_string_lossy().contains("event"))));
        log::info!("mando virtual {tipo:?} creado en {}", nodo.as_ref().map_or("?".into(), |p| p.display().to_string()));
        Ok(Self {
            tipo,
            disp,
            dev,
            nodo,
            efectos: HashMap::new(),
            sonando: None,
            ganancia: 1.0,
            ultima_vibracion: (0.0, 0.0),
            anterior: None,
        })
    }

    /// Nodo `/dev/input/eventN` del mando virtual.
    pub fn nodo(&self) -> Option<&PathBuf> {
        self.nodo.as_ref()
    }

    fn atender_vibracion(&mut self) {
        let eventos: Vec<InputEvent> = match self.dev.fetch_events() {
            Ok(it) => it.collect(),
            Err(_) => return,
        };
        for ev in eventos {
            match EventSummary::from(ev) {
                EventSummary::UInput(ev, UInputCode::UI_FF_UPLOAD, _) => {
                    if let Ok(mut subida) = self.dev.process_ff_upload(ev) {
                        let datos = subida.effect();
                        if let FFEffectKind::Rumble { strong_magnitude, weak_magnitude } = datos.kind {
                            let duracion = Duration::from_millis(u64::from(datos.replay.length));
                            let id = subida.effect_id();
                            self.efectos.insert(id, Efecto { fuerte: strong_magnitude, debil: weak_magnitude, duracion });
                            subida.set_retval(0);
                        } else {
                            subida.set_retval(-libc::EINVAL);
                        }
                    }
                }
                EventSummary::UInput(ev, UInputCode::UI_FF_ERASE, _) => {
                    if let Ok(borrado) = self.dev.process_ff_erase(ev) {
                        let id = borrado.effect_id() as i16;
                        self.efectos.remove(&id);
                        if self.sonando.is_some_and(|(s, _)| s == id) {
                            self.sonando = None;
                        }
                    }
                }
                EventSummary::ForceFeedback(_, FFEffectCode::FF_GAIN, valor) => {
                    self.ganancia = (valor as f32 / f32::from(u16::MAX)).clamp(0.0, 1.0);
                }
                EventSummary::ForceFeedback(_, FFEffectCode(id), valor) => {
                    let id = id as i16;
                    if valor > 0 {
                        if let Some(e) = self.efectos.get(&id) {
                            let fin = (!e.duracion.is_zero()).then(|| Instant::now() + e.duracion);
                            self.sonando = Some((id, fin));
                        }
                    } else if self.sonando.is_some_and(|(s, _)| s == id) {
                        self.sonando = None;
                    }
                }
                _ => {}
            }
        }
        if self.sonando.is_some_and(|(_, fin)| fin.is_some_and(|f| Instant::now() >= f)) {
            self.sonando = None;
        }
    }
}

impl SalidaVirtual for SalidaUinput {
    fn tipo(&self) -> TipoSalida {
        self.tipo
    }

    fn enviar(&mut self, pad: &EstadoPad) -> io::Result<()> {
        let antes = self.anterior.unwrap_or_default();
        let mut eventos = Vec::with_capacity(16);
        let tecla = |k: K, v: bool| InputEvent::new(EventType::KEY.0, k.0, i32::from(v));
        let abs = |a: A, v: i32| InputEvent::new(EventType::ABSOLUTE.0, a.0, v);
        let primero = self.anterior.is_none();
        for (s, k) in self.disp.botones {
            if primero || pad.pulsado(*s) != antes.pulsado(*s) {
                eventos.push(tecla(*k, pad.pulsado(*s)));
            }
        }
        let umbral = crate::mapeo::ajustes::UMBRAL_PULSADO;
        if self.disp.gatillos_digitales {
            if primero || (pad.l2 > umbral) != (antes.l2 > umbral) {
                eventos.push(tecla(K::BTN_TL2, pad.l2 > umbral));
            }
            if primero || (pad.r2 > umbral) != (antes.r2 > umbral) {
                eventos.push(tecla(K::BTN_TR2, pad.r2 > umbral));
            }
        }
        let (min, centro, max, _, _) = self.disp.stick;
        let ejes = [
            (A::ABS_X, pad.ls[0], antes.ls[0]),
            (A::ABS_Y, pad.ls[1], antes.ls[1]),
            (A::ABS_RX, pad.rs[0], antes.rs[0]),
            (A::ABS_RY, pad.rs[1], antes.rs[1]),
        ];
        for (eje, v, a) in ejes {
            let (v, a) = (a_rango(v, min, centro, max), a_rango(a, min, centro, max));
            if primero || v != a {
                eventos.push(abs(eje, v));
            }
        }
        if self.disp.gatillos_analogicos {
            let g = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as i32;
            if primero || g(pad.l2) != g(antes.l2) {
                eventos.push(abs(A::ABS_Z, g(pad.l2)));
            }
            if primero || g(pad.r2) != g(antes.r2) {
                eventos.push(abs(A::ABS_RZ, g(pad.r2)));
            }
        }
        let (x, y) = pad.cruceta_xy();
        let (ax, ay) = antes.cruceta_xy();
        if primero || x != ax {
            eventos.push(abs(A::ABS_HAT0X, x));
        }
        if primero || y != ay {
            eventos.push(abs(A::ABS_HAT0Y, y));
        }
        self.anterior = Some(*pad);
        if eventos.is_empty() {
            return Ok(());
        }
        self.dev.emit(&eventos)
    }

    fn vibracion(&mut self) -> Option<(f32, f32)> {
        self.atender_vibracion();
        let actual = match self.sonando.and_then(|(id, _)| self.efectos.get(&id)) {
            Some(e) => (
                f32::from(e.fuerte) / f32::from(u16::MAX) * self.ganancia,
                f32::from(e.debil) / f32::from(u16::MAX) * self.ganancia,
            ),
            None => (0.0, 0.0),
        };
        if actual == self.ultima_vibracion {
            return None;
        }
        self.ultima_vibracion = actual;
        Some(actual)
    }

    fn descripcion(&self) -> String {
        self.nodo.as_ref().map_or_else(|| "uinput".into(), |p| p.display().to_string())
    }
}

pub struct TecladoUinput {
    dev: VirtualDevice,
}

impl TecladoUinput {
    pub fn crear() -> Result<Self, ErrorSalida> {
        let mut teclas = AttributeSet::<K>::new();
        for (_, codigo, _) in TECLAS {
            teclas.insert(K(*codigo));
        }
        let phys = CString::new(format!("{MARCA_PHYS}/teclado")).map_err(|e| ErrorSalida::Io(io::Error::other(e)))?;
        let dev = VirtualDevice::builder()
            .map_err(error_creacion)?
            .name("Gamepad Mapper Pluton - teclado virtual")
            .input_id(InputId::new(BusType::BUS_VIRTUAL, 0x1209, 0x6771, 1))
            .with_phys(&phys)?
            .with_keys(&teclas)?
            .build()
            .map_err(error_creacion)?;
        Ok(Self { dev })
    }
}

impl Teclado for TecladoUinput {
    fn tecla(&mut self, indice: usize, pulsada: bool) -> io::Result<()> {
        let Some((_, codigo, _)) = TECLAS.get(indice) else { return Ok(()) };
        self.dev.emit(&[InputEvent::new(EventType::KEY.0, *codigo, i32::from(pulsada))])
    }
}

#[derive(Default)]
pub struct FabricaUinput {
    creados: u32,
}

/// ¿Se puede abrir /dev/uinput para escribir?
pub fn uinput_accesible() -> bool {
    std::fs::OpenOptions::new().write(true).open("/dev/uinput").is_ok()
}

impl FabricaSalidas for FabricaUinput {
    fn disponibilidad(&self) -> Vec<Disponibilidad> {
        let ok = uinput_accesible();
        TipoSalida::VIRTUALES
            .into_iter()
            .map(|tipo| Disponibilidad {
                tipo,
                disponible: ok,
                motivo: (!ok).then(|| ErrorSalida::SinPermisoUinput.to_string()),
            })
            .collect()
    }

    fn crear(&mut self, tipo: TipoSalida) -> Result<Box<dyn SalidaVirtual>, ErrorSalida> {
        self.creados += 1;
        Ok(Box::new(SalidaUinput::crear(tipo, self.creados)?))
    }

    fn teclado(&mut self) -> Result<Box<dyn Teclado>, ErrorSalida> {
        Ok(Box::new(TecladoUinput::crear()?))
    }
}
