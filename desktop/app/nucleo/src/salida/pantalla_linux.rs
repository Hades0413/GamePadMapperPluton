//! Pantalla tactil multitactil virtual (uinput) que cubre todo el escritorio, como la de
//! gpm-escritorio: el servidor X (libinput) la asocia a la pantalla entera, asi que un toque en el
//! pixel (x, y) del escritorio cae en ese pixel. Protocolo multitactil tipo B (slots), con
//! `INPUT_PROP_DIRECT` para que se trate como pantalla tactil y no como panel.
//!
//! Solo escribe cuando hay cambios de dedos (nunca un informe vacio al crearla), asi las pruebas
//! pueden capturarla (EVIOCGRAB) antes del primer toque.

use super::linux::{error_creacion, registrar, Registro};
use super::{ErrorSalida, PantallaToques, ToquePixel};
use evdev::uinput::VirtualDevice;
use evdev::{
    AbsInfo, AbsoluteAxisCode as A, AttributeSet, BusType, EventType, InputEvent, InputId, KeyCode as K, PropType,
    UinputAbsSetup,
};
use std::io;
use std::path::PathBuf;

/// Nombre del dispositivo (la fuente de mandos no lo lee: no es un mando y esta en el registro).
pub const NOMBRE: &str = "Gamepad Mapper Pluton - toques";
const DEDOS: i32 = 10;

pub struct PantallaUinput {
    dev: VirtualDevice,
    _registro: Registro,
    nodo: Option<PathBuf>,
    escritorio: (u32, u32),
    pendientes: Vec<InputEvent>,
    tocando: bool,
    seguimiento: i32,
}

fn abs(eje: A, v: i32) -> InputEvent {
    InputEvent::new(EventType::ABSOLUTE.0, eje.0, v)
}

impl PantallaUinput {
    /// Crea la pantalla con coordenadas 0..ancho-1, 0..alto-1.
    pub fn crear(nombre: &str, ancho: u32, alto: u32) -> Result<Self, ErrorSalida> {
        let (ancho, alto) = (ancho.clamp(2, 32768), alto.clamp(2, 32768));
        let mut teclas = AttributeSet::<K>::new();
        teclas.insert(K::BTN_TOUCH);
        let mut props = AttributeSet::<PropType>::new();
        props.insert(PropType::DIRECT);
        let ejes = [
            (A::ABS_MT_SLOT, AbsInfo::new(0, 0, DEDOS - 1, 0, 0, 0)),
            (A::ABS_MT_TRACKING_ID, AbsInfo::new(0, 0, 65535, 0, 0, 0)),
            (A::ABS_MT_POSITION_X, AbsInfo::new(0, 0, ancho as i32 - 1, 0, 0, 0)),
            (A::ABS_MT_POSITION_Y, AbsInfo::new(0, 0, alto as i32 - 1, 0, 0, 0)),
            (A::ABS_MT_TOUCH_MAJOR, AbsInfo::new(0, 0, 255, 0, 0, 0)),
            (A::ABS_MT_PRESSURE, AbsInfo::new(0, 0, 255, 0, 0, 0)),
        ];
        let mut b = VirtualDevice::builder()
            .map_err(error_creacion)?
            .name(nombre)
            .input_id(InputId::new(BusType::BUS_VIRTUAL, 0x1949, 0x7a04, 1))
            .with_keys(&teclas)?
            .with_properties(&props)?;
        for (eje, info) in ejes {
            b = b.with_absolute_axis(&UinputAbsSetup::new(eje, info))?;
        }
        let mut dev = b.build().map_err(error_creacion)?;
        let registro = Registro(registrar(&mut dev));
        let nodo = dev
            .enumerate_dev_nodes_blocking()
            .ok()
            .and_then(|mut it| it.find_map(|p| p.ok().filter(|p| p.to_string_lossy().contains("event"))));
        log::info!(
            "pantalla de toques {ancho}x{alto} creada en {}",
            nodo.as_ref().map_or("?".into(), |p| p.display().to_string())
        );
        Ok(Self {
            dev,
            _registro: registro,
            nodo,
            escritorio: (ancho, alto),
            pendientes: Vec::new(),
            tocando: false,
            seguimiento: 0,
        })
    }

    pub fn nodo(&self) -> Option<&PathBuf> {
        self.nodo.as_ref()
    }
}

impl PantallaToques for PantallaUinput {
    fn enviar(&mut self, ops: &[ToquePixel]) -> io::Result<()> {
        let (w, h) = (self.escritorio.0 as i32 - 1, self.escritorio.1 as i32 - 1);
        for op in ops {
            match *op {
                ToquePixel::Abajo { slot, x, y } => {
                    self.seguimiento = if self.seguimiento >= 65535 { 1 } else { self.seguimiento + 1 };
                    self.pendientes.extend([
                        abs(A::ABS_MT_SLOT, slot as i32),
                        abs(A::ABS_MT_TRACKING_ID, self.seguimiento),
                        abs(A::ABS_MT_POSITION_X, x.clamp(0, w)),
                        abs(A::ABS_MT_POSITION_Y, y.clamp(0, h)),
                        abs(A::ABS_MT_TOUCH_MAJOR, 6),
                        abs(A::ABS_MT_PRESSURE, 60),
                    ]);
                }
                ToquePixel::Mover { slot, x, y } => self.pendientes.extend([
                    abs(A::ABS_MT_SLOT, slot as i32),
                    abs(A::ABS_MT_POSITION_X, x.clamp(0, w)),
                    abs(A::ABS_MT_POSITION_Y, y.clamp(0, h)),
                ]),
                ToquePixel::Arriba { slot } => {
                    self.pendientes.extend([abs(A::ABS_MT_SLOT, slot as i32), abs(A::ABS_MT_TRACKING_ID, -1)])
                }
                ToquePixel::Sync { tocando } => {
                    if tocando != self.tocando {
                        self.pendientes.push(InputEvent::new(EventType::KEY.0, K::BTN_TOUCH.0, i32::from(tocando)));
                        self.tocando = tocando;
                    }
                    if !self.pendientes.is_empty() {
                        let lote = std::mem::take(&mut self.pendientes);
                        self.dev.emit(&lote)?;
                    }
                }
            }
        }
        Ok(())
    }

    fn escritorio(&self) -> (u32, u32) {
        self.escritorio
    }

    fn descripcion(&self) -> String {
        self.nodo.as_ref().map_or_else(|| "uinput".into(), |p| p.display().to_string())
    }
}
