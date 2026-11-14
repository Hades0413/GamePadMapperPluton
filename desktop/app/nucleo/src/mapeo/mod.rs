//! Mapeo de un mando: que entrada cruda alimenta cada control estandar.
//!
//! Las fuentes se escriben como en SDL GameControllerDB (`b0`, `a2`, `+a2`, `-a2`, `a2~`, `h0.4`)
//! tanto en el JSON guardado como en la interfaz.

pub mod ajustes;
pub mod almacen;
pub mod auto;
pub mod basedatos;
pub mod sdl;

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;
use std::str::FromStr;

/// Controles estandar. En JSON llevan el nombre de los perfiles (A, L1, DPAD_UP...); los ejes de
/// los sticks son LS_X/LS_Y/RS_X/RS_Y (en los perfiles el stick entero es LS o RS).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Control {
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
    LsX,
    LsY,
    RsX,
    RsY,
}

impl Control {
    pub const TODOS: [Control; 21] = [
        Control::A,
        Control::B,
        Control::X,
        Control::Y,
        Control::L1,
        Control::R1,
        Control::L2,
        Control::R2,
        Control::L3,
        Control::R3,
        Control::Select,
        Control::Start,
        Control::Home,
        Control::DpadUp,
        Control::DpadDown,
        Control::DpadLeft,
        Control::DpadRight,
        Control::LsX,
        Control::LsY,
        Control::RsX,
        Control::RsY,
    ];

    /// Nombre en los perfiles (`.conf`): los dos ejes de un stick son el control LS o RS.
    pub fn nombre_perfil(self) -> &'static str {
        match self {
            Control::A => "A",
            Control::B => "B",
            Control::X => "X",
            Control::Y => "Y",
            Control::L1 => "L1",
            Control::R1 => "R1",
            Control::L2 => "L2",
            Control::R2 => "R2",
            Control::L3 => "L3",
            Control::R3 => "R3",
            Control::Select => "SELECT",
            Control::Start => "START",
            Control::Home => "HOME",
            Control::DpadUp => "DPAD_UP",
            Control::DpadDown => "DPAD_DOWN",
            Control::DpadLeft => "DPAD_LEFT",
            Control::DpadRight => "DPAD_RIGHT",
            Control::LsX | Control::LsY => "LS",
            Control::RsX | Control::RsY => "RS",
        }
    }

    /// Nombre de la salida en SDL GameControllerDB.
    pub fn nombre_sdl(self) -> &'static str {
        match self {
            Control::A => "a",
            Control::B => "b",
            Control::X => "x",
            Control::Y => "y",
            Control::L1 => "leftshoulder",
            Control::R1 => "rightshoulder",
            Control::L2 => "lefttrigger",
            Control::R2 => "righttrigger",
            Control::L3 => "leftstick",
            Control::R3 => "rightstick",
            Control::Select => "back",
            Control::Start => "start",
            Control::Home => "guide",
            Control::DpadUp => "dpup",
            Control::DpadDown => "dpdown",
            Control::DpadLeft => "dpleft",
            Control::DpadRight => "dpright",
            Control::LsX => "leftx",
            Control::LsY => "lefty",
            Control::RsX => "rightx",
            Control::RsY => "righty",
        }
    }

    pub fn desde_sdl(nombre: &str) -> Option<Control> {
        Control::TODOS.into_iter().find(|c| c.nombre_sdl() == nombre)
    }

    /// Ejes de stick (valor -1..1); el resto son botones o gatillos.
    pub fn es_eje(self) -> bool {
        matches!(self, Control::LsX | Control::LsY | Control::RsX | Control::RsY)
    }

    pub fn es_gatillo(self) -> bool {
        matches!(self, Control::L2 | Control::R2)
    }
}

/// Parte de un eje que se usa.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Mitad {
    #[default]
    Completa,
    Positiva,
    Negativa,
}

/// Entrada cruda que alimenta un control (sintaxis SDL al serializar).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub enum Fuente {
    Boton { indice: u16 },
    Eje { indice: u16, mitad: Mitad, invertido: bool },
    Hat { indice: u8, mascara: u8 },
}

impl Fuente {
    pub fn eje(indice: u16) -> Self {
        Fuente::Eje { indice, mitad: Mitad::Completa, invertido: false }
    }

    /// ¿Leen las dos la misma entrada fisica (aunque sea con otro sentido)?
    pub fn se_solapa(&self, otra: &Fuente) -> bool {
        match (self, otra) {
            (Fuente::Boton { indice: a }, Fuente::Boton { indice: b }) => a == b,
            (Fuente::Hat { indice: a, mascara: ma }, Fuente::Hat { indice: b, mascara: mb }) => a == b && ma & mb != 0,
            (Fuente::Eje { indice: a, mitad: ma, .. }, Fuente::Eje { indice: b, mitad: mb, .. }) => {
                a == b && (*ma == Mitad::Completa || *mb == Mitad::Completa || ma == mb)
            }
            _ => false,
        }
    }
}

impl fmt::Display for Fuente {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Fuente::Boton { indice } => write!(f, "b{indice}"),
            Fuente::Hat { indice, mascara } => write!(f, "h{indice}.{mascara}"),
            Fuente::Eje { indice, mitad, invertido } => {
                let signo = match mitad {
                    Mitad::Completa => "",
                    Mitad::Positiva => "+",
                    Mitad::Negativa => "-",
                };
                write!(f, "{signo}a{indice}{}", if *invertido { "~" } else { "" })
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("fuente no valida: «{0}» (se espera b0, a1, +a2, -a2, a3~ o h0.4)")]
pub struct FuenteNoValida(pub String);

impl FromStr for Fuente {
    type Err = FuenteNoValida;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let error = || FuenteNoValida(s.to_owned());
        let numero = |t: &str| -> Result<u16, FuenteNoValida> {
            if t.is_empty() || !t.bytes().all(|b| b.is_ascii_digit()) {
                return Err(error());
            }
            t.parse().map_err(|_| error())
        };
        if let Some(resto) = s.strip_prefix('b') {
            return Ok(Fuente::Boton { indice: numero(resto)? });
        }
        if let Some(resto) = s.strip_prefix('h') {
            let (h, m) = resto.split_once('.').ok_or_else(error)?;
            let indice = u8::try_from(numero(h)?).map_err(|_| error())?;
            let mascara = u8::try_from(numero(m)?).map_err(|_| error())?;
            if mascara == 0 || mascara > 15 {
                return Err(error());
            }
            return Ok(Fuente::Hat { indice, mascara });
        }
        let (mitad, resto) = match s.as_bytes().first() {
            Some(b'+') => (Mitad::Positiva, &s[1..]),
            Some(b'-') => (Mitad::Negativa, &s[1..]),
            _ => (Mitad::Completa, s),
        };
        let resto = resto.strip_prefix('a').ok_or_else(error)?;
        let (num, invertido) = match resto.strip_suffix('~') {
            Some(n) => (n, true),
            None => (resto, false),
        };
        Ok(Fuente::Eje { indice: numero(num)?, mitad, invertido })
    }
}

impl TryFrom<String> for Fuente {
    type Error = FuenteNoValida;
    fn try_from(s: String) -> Result<Self, Self::Error> {
        s.parse()
    }
}

impl From<Fuente> for String {
    fn from(f: Fuente) -> Self {
        f.to_string()
    }
}

/// Zona muerta, curva e inversion de un stick.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AjusteStick {
    /// 0..0.9: por debajo de este radio el stick vale 0.
    pub zona_muerta: f32,
    /// Exponente de la respuesta (1 = lineal, >1 = mas fino en el centro).
    pub curva: f32,
    pub invertir_x: bool,
    pub invertir_y: bool,
}

impl Default for AjusteStick {
    fn default() -> Self {
        Self { zona_muerta: 0.1, curva: 1.0, invertir_x: false, invertir_y: false }
    }
}

impl AjusteStick {
    pub fn limitado(self) -> Self {
        Self {
            zona_muerta: if self.zona_muerta.is_finite() { self.zona_muerta.clamp(0.0, 0.9) } else { 0.1 },
            curva: if self.curva.is_finite() { self.curva.clamp(0.2, 4.0) } else { 1.0 },
            ..self
        }
    }
}

pub const VERSION_MAPEO: u32 = 1;

/// Mapeo de un modelo de mando (se guarda por GUID).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MapeoMando {
    pub version: u32,
    pub guid: String,
    pub nombre: String,
    pub asignaciones: BTreeMap<Control, Fuente>,
    #[serde(default)]
    pub stick_izquierdo: AjusteStick,
    #[serde(default)]
    pub stick_derecho: AjusteStick,
    /// Salidas SDL que aun no se usan (paddle1, misc1, touchpad, +leftx...): se conservan al
    /// importar y exportar.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub extras_sdl: BTreeMap<String, String>,
}

impl MapeoMando {
    pub fn vacio(guid: &str, nombre: &str) -> Self {
        Self {
            version: VERSION_MAPEO,
            guid: guid.to_owned(),
            nombre: nombre.to_owned(),
            asignaciones: BTreeMap::new(),
            stick_izquierdo: AjusteStick::default(),
            stick_derecho: AjusteStick::default(),
            extras_sdl: BTreeMap::new(),
        }
    }

    pub fn asignar(&mut self, control: Control, fuente: Option<Fuente>) {
        match fuente {
            Some(f) => {
                self.asignaciones.insert(control, f);
            }
            None => {
                self.asignaciones.remove(&control);
            }
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn fuentes_ida_y_vuelta() {
        for s in ["b0", "b15", "a2", "+a2", "-a7", "a3~", "-a1~", "h0.1", "h0.4", "h1.8"] {
            let f: Fuente = s.parse().unwrap();
            assert_eq!(f.to_string(), s);
        }
    }

    #[test]
    fn fuentes_no_validas() {
        for s in ["", "b", "bx", "c1", "a", "+b1", "h0", "h0.0", "h0.16", "a1~~", "b-1", "h300.1"] {
            assert!(s.parse::<Fuente>().is_err(), "{s} deberia fallar");
        }
    }

    #[test]
    fn solapes() {
        let a0: Fuente = "a0".parse().unwrap();
        assert!(a0.se_solapa(&"+a0".parse().unwrap()));
        assert!(!"+a6".parse::<Fuente>().unwrap().se_solapa(&"-a6".parse().unwrap()));
        assert!("h0.1".parse::<Fuente>().unwrap().se_solapa(&"h0.1".parse().unwrap()));
        assert!(!"h0.1".parse::<Fuente>().unwrap().se_solapa(&"h0.4".parse().unwrap()));
        assert!(!"b1".parse::<Fuente>().unwrap().se_solapa(&"a1".parse().unwrap()));
    }

    #[test]
    fn json_con_nombres_de_perfil() {
        let mut m = MapeoMando::vacio("03000000", "Prueba");
        m.asignar(Control::DpadUp, Some("h0.1".parse().unwrap()));
        m.asignar(Control::LsX, Some("a0".parse().unwrap()));
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"DPAD_UP\":\"h0.1\""), "{json}");
        assert!(json.contains("\"LS_X\":\"a0\""), "{json}");
        let vuelta: MapeoMando = serde_json::from_str(&json).unwrap();
        assert_eq!(vuelta, m);
    }

    #[test]
    fn nombres_coherentes() {
        for c in Control::TODOS {
            assert_eq!(Control::desde_sdl(c.nombre_sdl()), Some(c));
        }
        assert_eq!(Control::Home.nombre_perfil(), "HOME");
        assert_eq!(Control::RsY.nombre_perfil(), "RS");
    }
}
