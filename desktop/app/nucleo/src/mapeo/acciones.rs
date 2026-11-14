//! Configuracion avanzada de un mando: que hace cada entrada (botones estandar y botones extra),
//! macros, capas (shift) y teclas.
//!
//! - Una [`Entrada`] es un control estandar (`A`, `DPAD_UP`, `L2`...) o una entrada cruda que no
//!   esta en el mapeo estandar (`b12`, `+a7`, `h1.2`): asi los botones extra (paletas, «misc»,
//!   clic del panel tactil...) se configuran igual que los demas.
//! - Una [`Accion`] dice que produce: un control del mando virtual (normal, turbo o alterno), una
//!   macro, una tecla o nada.
//! - Las salidas del mando virtual son [`SalidaPad`]: botones, gatillos y direcciones de stick.

use super::{Control, Fuente};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;
use std::str::FromStr;

/// Controles del mando virtual que puede producir una accion.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SalidaPad {
    A,
    B,
    X,
    Y,
    L1,
    R1,
    L2,
    R2,
    L3,
    R3,
    Select,
    Start,
    Home,
    DpadUp,
    DpadDown,
    DpadLeft,
    DpadRight,
    /// Clic del panel tactil (DualShock 4).
    Touchpad,
    /// Boton de captura (Switch Pro) o «misc».
    Captura,
    LsUp,
    LsDown,
    LsLeft,
    LsRight,
    RsUp,
    RsDown,
    RsLeft,
    RsRight,
}

impl SalidaPad {
    pub const TODAS: [SalidaPad; 27] = [
        SalidaPad::A,
        SalidaPad::B,
        SalidaPad::X,
        SalidaPad::Y,
        SalidaPad::L1,
        SalidaPad::R1,
        SalidaPad::L2,
        SalidaPad::R2,
        SalidaPad::L3,
        SalidaPad::R3,
        SalidaPad::Select,
        SalidaPad::Start,
        SalidaPad::Home,
        SalidaPad::DpadUp,
        SalidaPad::DpadDown,
        SalidaPad::DpadLeft,
        SalidaPad::DpadRight,
        SalidaPad::Touchpad,
        SalidaPad::Captura,
        SalidaPad::LsUp,
        SalidaPad::LsDown,
        SalidaPad::LsLeft,
        SalidaPad::LsRight,
        SalidaPad::RsUp,
        SalidaPad::RsDown,
        SalidaPad::RsLeft,
        SalidaPad::RsRight,
    ];

    /// Bit de esta salida en un conjunto (`u32`).
    pub fn bit(self) -> u32 {
        1 << (self as u32)
    }

    /// La salida que corresponde a un control estandar (los ejes de stick no tienen una sola).
    pub fn de_control(c: Control) -> Option<SalidaPad> {
        Some(match c {
            Control::A => SalidaPad::A,
            Control::B => SalidaPad::B,
            Control::X => SalidaPad::X,
            Control::Y => SalidaPad::Y,
            Control::L1 => SalidaPad::L1,
            Control::R1 => SalidaPad::R1,
            Control::L2 => SalidaPad::L2,
            Control::R2 => SalidaPad::R2,
            Control::L3 => SalidaPad::L3,
            Control::R3 => SalidaPad::R3,
            Control::Select => SalidaPad::Select,
            Control::Start => SalidaPad::Start,
            Control::Home => SalidaPad::Home,
            Control::DpadUp => SalidaPad::DpadUp,
            Control::DpadDown => SalidaPad::DpadDown,
            Control::DpadLeft => SalidaPad::DpadLeft,
            Control::DpadRight => SalidaPad::DpadRight,
            Control::LsX | Control::LsY | Control::RsX | Control::RsY => return None,
        })
    }
}

/// Como se aplica una accion de tipo «pad».
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Modo {
    /// Igual que la entrada (analogico si la salida es un gatillo o un stick).
    #[default]
    Normal,
    /// Pulsa y suelta solo mientras se mantiene, a `turbo_hz` veces por segundo.
    Turbo,
    /// Cada pulsacion cambia entre pulsado y suelto.
    Alternar,
}

pub const TURBO_HZ_MIN: f32 = 1.0;
pub const TURBO_HZ_MAX: f32 = 30.0;
const TURBO_HZ_DEFECTO: f32 = 10.0;

fn turbo_defecto() -> f32 {
    TURBO_HZ_DEFECTO
}

/// Lo que produce una entrada.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Accion {
    /// Un control del mando virtual.
    Pad {
        salida: SalidaPad,
        #[serde(default)]
        modo: Modo,
        #[serde(default = "turbo_defecto")]
        turbo_hz: f32,
    },
    /// Lanza una macro al pulsar (y la repite mientras se mantiene si la macro lo pide).
    Macro { macro_id: u32 },
    /// Una tecla del teclado mientras se mantiene (nombres de [`TECLAS`]).
    Tecla { tecla: String },
    /// No hace nada.
    Ignorar,
}

impl Accion {
    pub fn pad(salida: SalidaPad) -> Self {
        Accion::Pad { salida, modo: Modo::Normal, turbo_hz: TURBO_HZ_DEFECTO }
    }
}

/// Una entrada con accion: un control estandar o una entrada cruda (los botones extra).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub enum Entrada {
    Control(Control),
    Cruda(Fuente),
}

impl Entrada {
    /// Controles estandar que admiten accion (todos menos los ejes de los sticks).
    pub fn estandar() -> impl Iterator<Item = Entrada> {
        Control::TODOS.into_iter().filter(|c| !c.es_eje()).map(Entrada::Control)
    }

    /// Accion por defecto: un control estandar produce el mismo control; una entrada cruda, nada.
    pub fn accion_por_defecto(&self) -> Accion {
        match self {
            Entrada::Control(c) => SalidaPad::de_control(*c).map_or(Accion::Ignorar, Accion::pad),
            Entrada::Cruda(_) => Accion::Ignorar,
        }
    }
}

impl fmt::Display for Entrada {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Entrada::Control(c) => f.write_str(c.nombre_json()),
            Entrada::Cruda(fuente) => write!(f, "{fuente}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("entrada no valida: «{0}»")]
pub struct EntradaNoValida(pub String);

impl FromStr for Entrada {
    type Err = EntradaNoValida;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if let Some(c) = Control::desde_json(s) {
            return Ok(Entrada::Control(c));
        }
        s.parse::<Fuente>().map(Entrada::Cruda).map_err(|_| EntradaNoValida(s.to_owned()))
    }
}

impl TryFrom<String> for Entrada {
    type Error = EntradaNoValida;
    fn try_from(s: String) -> Result<Self, Self::Error> {
        s.parse()
    }
}

impl From<Entrada> for String {
    fn from(e: Entrada) -> Self {
        e.to_string()
    }
}

/// Un paso de una macro.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum PasoMacro {
    Pulsar {
        salida: SalidaPad,
    },
    Soltar {
        salida: SalidaPad,
    },
    /// Pulsa, mantiene `ms` y suelta.
    Toque {
        salida: SalidaPad,
        ms: u32,
    },
    Esperar {
        ms: u32,
    },
}

/// Secuencia de pulsaciones del mando virtual. Al terminar se suelta todo lo que siga pulsado.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Macro {
    pub id: u32,
    pub nombre: String,
    pub pasos: Vec<PasoMacro>,
    /// Vuelve a empezar mientras se mantiene la entrada que la lanzo.
    #[serde(default)]
    pub repetir: bool,
}

impl Macro {
    /// Duracion total en milisegundos.
    pub fn duracion_ms(&self) -> u64 {
        self.pasos
            .iter()
            .map(|p| match p {
                PasoMacro::Toque { ms, .. } | PasoMacro::Esperar { ms } => u64::from(*ms),
                _ => 0,
            })
            .sum()
    }

    /// Salidas pulsadas `t` ms despues de empezar, o `None` si ya ha terminado.
    pub fn pulsadas_en(&self, t: u64) -> Option<u32> {
        let mut pulsadas = 0u32;
        let mut inicio = 0u64;
        for p in &self.pasos {
            match p {
                PasoMacro::Pulsar { salida } => pulsadas |= salida.bit(),
                PasoMacro::Soltar { salida } => pulsadas &= !salida.bit(),
                PasoMacro::Toque { salida, ms } => {
                    let fin = inicio + u64::from(*ms);
                    if t < fin {
                        return Some(pulsadas | salida.bit());
                    }
                    inicio = fin;
                }
                PasoMacro::Esperar { ms } => {
                    let fin = inicio + u64::from(*ms);
                    if t < fin {
                        return Some(pulsadas);
                    }
                    inicio = fin;
                }
            }
        }
        None
    }
}

/// Capa (shift): mientras se mantiene `modificador`, estas acciones sustituyen a las normales.
/// El modificador no produce nada por si mismo.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Capa {
    pub nombre: String,
    pub modificador: Entrada,
    #[serde(default)]
    pub acciones: BTreeMap<Entrada, Accion>,
}

/// Lado de un stick.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lado {
    Izquierdo,
    Derecho,
}

/// Cambios de direccion: cruceta <-> stick e intercambio de sticks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AjusteDireccion {
    pub intercambiar_sticks: bool,
    /// La cruceta mueve este stick (y deja de ser cruceta).
    pub cruceta_a_stick: Option<Lado>,
    /// Este stick hace de cruceta (y deja de ser stick).
    pub stick_a_cruceta: Option<Lado>,
}

/// Teclas que puede pulsar una accion: (nombre, codigo evdev en Linux, codigo virtual en Windows).
pub const TECLAS: &[(&str, u16, u16)] = &[
    ("ESC", 1, 0x1B),
    ("1", 2, 0x31),
    ("2", 3, 0x32),
    ("3", 4, 0x33),
    ("4", 5, 0x34),
    ("5", 6, 0x35),
    ("6", 7, 0x36),
    ("7", 8, 0x37),
    ("8", 9, 0x38),
    ("9", 10, 0x39),
    ("0", 11, 0x30),
    ("BACKSPACE", 14, 0x08),
    ("TAB", 15, 0x09),
    ("Q", 16, 0x51),
    ("W", 17, 0x57),
    ("E", 18, 0x45),
    ("R", 19, 0x52),
    ("T", 20, 0x54),
    ("Y", 21, 0x59),
    ("U", 22, 0x55),
    ("I", 23, 0x49),
    ("O", 24, 0x4F),
    ("P", 25, 0x50),
    ("ENTER", 28, 0x0D),
    ("LEFTCTRL", 29, 0xA2),
    ("A", 30, 0x41),
    ("S", 31, 0x53),
    ("D", 32, 0x44),
    ("F", 33, 0x46),
    ("G", 34, 0x47),
    ("H", 35, 0x48),
    ("J", 36, 0x4A),
    ("K", 37, 0x4B),
    ("L", 38, 0x4C),
    ("LEFTSHIFT", 42, 0xA0),
    ("Z", 44, 0x5A),
    ("X", 45, 0x58),
    ("C", 46, 0x43),
    ("V", 47, 0x56),
    ("B", 48, 0x42),
    ("N", 49, 0x4E),
    ("M", 50, 0x4D),
    ("RIGHTSHIFT", 54, 0xA1),
    ("LEFTALT", 56, 0xA4),
    ("SPACE", 57, 0x20),
    ("F1", 59, 0x70),
    ("F2", 60, 0x71),
    ("F3", 61, 0x72),
    ("F4", 62, 0x73),
    ("F5", 63, 0x74),
    ("F6", 64, 0x75),
    ("F7", 65, 0x76),
    ("F8", 66, 0x77),
    ("F9", 67, 0x78),
    ("F10", 68, 0x79),
    ("F11", 87, 0x7A),
    ("F12", 88, 0x7B),
    ("RIGHTCTRL", 97, 0xA3),
    ("RIGHTALT", 100, 0xA5),
    ("HOME", 102, 0x24),
    ("UP", 103, 0x26),
    ("PAGEUP", 104, 0x21),
    ("LEFT", 105, 0x25),
    ("RIGHT", 106, 0x27),
    ("END", 107, 0x23),
    ("DOWN", 108, 0x28),
    ("PAGEDOWN", 109, 0x22),
    ("INSERT", 110, 0x2D),
    ("DELETE", 111, 0x2E),
    ("VOLUMEDOWN", 114, 0xAE),
    ("VOLUMEUP", 115, 0xAF),
    ("PAUSE", 119, 0x13),
    ("PRINT", 99, 0x2C),
];

/// Indice en [`TECLAS`] de una tecla por su nombre.
pub fn indice_tecla(nombre: &str) -> Option<usize> {
    TECLAS.iter().position(|(n, _, _)| *n == nombre)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn entradas_ida_y_vuelta() {
        for s in ["A", "DPAD_UP", "L2", "SELECT", "b12", "+a7", "h1.2", "a3~"] {
            let e: Entrada = s.parse().unwrap();
            assert_eq!(e.to_string(), s);
        }
        assert!("LS".parse::<Entrada>().is_err());
        assert!("zz".parse::<Entrada>().is_err());
        assert_eq!("A".parse::<Entrada>().unwrap(), Entrada::Control(Control::A));
    }

    #[test]
    fn json_de_acciones() {
        let mut m: BTreeMap<Entrada, Accion> = BTreeMap::new();
        m.insert("b12".parse().unwrap(), Accion::Macro { macro_id: 3 });
        m.insert("A".parse().unwrap(), Accion::Pad { salida: SalidaPad::B, modo: Modo::Turbo, turbo_hz: 12.0 });
        m.insert("+a7".parse().unwrap(), Accion::Tecla { tecla: "SPACE".into() });
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains(r#""A":{"tipo":"pad","salida":"B","modo":"turbo","turbo_hz":12.0}"#), "{json}");
        assert!(json.contains(r#""b12":{"tipo":"macro","macro_id":3}"#), "{json}");
        let vuelta: BTreeMap<Entrada, Accion> = serde_json::from_str(&json).unwrap();
        assert_eq!(vuelta, m);
        // Sin modo ni turbo: los valores por defecto.
        let a: Accion = serde_json::from_str(r#"{"tipo":"pad","salida":"LS_UP"}"#).unwrap();
        assert_eq!(a, Accion::pad(SalidaPad::LsUp));
    }

    #[test]
    fn macros_en_el_tiempo() {
        let m = Macro {
            id: 1,
            nombre: "hadoken".into(),
            pasos: vec![
                PasoMacro::Pulsar { salida: SalidaPad::DpadDown },
                PasoMacro::Esperar { ms: 50 },
                PasoMacro::Soltar { salida: SalidaPad::DpadDown },
                PasoMacro::Toque { salida: SalidaPad::DpadRight, ms: 50 },
                PasoMacro::Toque { salida: SalidaPad::X, ms: 30 },
            ],
            repetir: false,
        };
        assert_eq!(m.duracion_ms(), 130);
        assert_eq!(m.pulsadas_en(0), Some(SalidaPad::DpadDown.bit()));
        assert_eq!(m.pulsadas_en(60), Some(SalidaPad::DpadRight.bit()));
        assert_eq!(m.pulsadas_en(110), Some(SalidaPad::X.bit()));
        assert_eq!(m.pulsadas_en(130), None);
    }

    #[test]
    fn tabla_de_teclas_sin_repetidos() {
        for (i, (n, l, w)) in TECLAS.iter().enumerate() {
            assert_eq!(indice_tecla(n), Some(i));
            assert!(TECLAS.iter().filter(|(_, l2, _)| l2 == l).count() == 1, "{n}");
            assert!(TECLAS.iter().filter(|(_, _, w2)| w2 == w).count() == 1, "{n}");
        }
        assert!(TECLAS.len() <= 128);
    }

    #[test]
    fn acciones_por_defecto() {
        assert_eq!(Entrada::Control(Control::L2).accion_por_defecto(), Accion::pad(SalidaPad::L2));
        assert_eq!(Entrada::Cruda("b20".parse().unwrap()).accion_por_defecto(), Accion::Ignorar);
        assert_eq!(Entrada::estandar().count(), 17);
    }
}
