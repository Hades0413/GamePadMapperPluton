//! Mandos conectados y su estado en crudo.
//!
//! Las entradas se numeran como en SDL (botones `b0..`, ejes `a0..`, hats `h0..`), asi las lineas
//! de SDL GameControllerDB valen tal cual. Los ejes se normalizan a -1..1 (el minimo del
//! dispositivo es -1: un gatillo en reposo vale -1, como en SDL). En los hats, cada direccion es un
//! bit: arriba 1, derecha 2, abajo 4, izquierda 8.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[cfg(target_os = "linux")]
pub mod linux;
pub mod simulado;
#[cfg(windows)]
pub mod windows;

/// Identificador de un mando mientras esta conectado (no se reutiliza en la misma sesion).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct IdMando(pub u32);

/// De donde se leen los datos del mando.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Plataforma {
    Evdev,
    Xinput,
    Simulado,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Conexion {
    Usb,
    Bluetooth,
    Virtual,
    Otra,
}

/// Un boton o eje del mando: su indice SDL y el codigo del sistema (evdev o bit XInput).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DescEntrada {
    pub indice: u16,
    pub codigo: u16,
    pub nombre: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InfoMando {
    pub id: IdMando,
    pub nombre: String,
    /// GUID al estilo SDL (32 caracteres hexadecimales): identifica el modelo y da nombre al
    /// archivo de su mapeo.
    pub guid: String,
    pub vendedor: u16,
    pub producto: u16,
    pub version: u16,
    pub conexion: Conexion,
    pub plataforma: Plataforma,
    /// Ruta del dispositivo (`/dev/input/eventN`) o la ranura (`XInput 1`).
    pub ruta: String,
    pub botones: Vec<DescEntrada>,
    pub ejes: Vec<DescEntrada>,
    pub hats: u8,
    pub vibracion: bool,
}

/// Un cambio de una entrada en crudo.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Cambio {
    Boton { indice: u16, pulsado: bool },
    Eje { indice: u16, valor: f32 },
    Hat { indice: u8, valor: u8 },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Evento {
    Conectado { info: InfoMando },
    Desconectado { id: IdMando },
    Entrada { id: IdMando, cambio: Cambio },
}

/// Estado completo de las entradas de un mando.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct EstadoCrudo {
    pub botones: Vec<bool>,
    pub ejes: Vec<f32>,
    pub hats: Vec<u8>,
}

impl EstadoCrudo {
    pub fn para(info: &InfoMando) -> Self {
        Self {
            botones: vec![false; info.botones.len()],
            ejes: vec![0.0; info.ejes.len()],
            hats: vec![0; usize::from(info.hats)],
        }
    }

    pub fn aplicar(&mut self, cambio: &Cambio) {
        match *cambio {
            Cambio::Boton { indice, pulsado } => {
                if let Some(b) = self.botones.get_mut(usize::from(indice)) {
                    *b = pulsado;
                }
            }
            Cambio::Eje { indice, valor } => {
                if let Some(e) = self.ejes.get_mut(usize::from(indice)) {
                    *e = valor;
                }
            }
            Cambio::Hat { indice, valor } => {
                if let Some(h) = self.hats.get_mut(usize::from(indice)) {
                    *h = valor;
                }
            }
        }
    }

    pub fn boton(&self, indice: u16) -> bool {
        self.botones.get(usize::from(indice)).copied().unwrap_or(false)
    }

    pub fn eje(&self, indice: u16) -> f32 {
        self.ejes.get(usize::from(indice)).copied().unwrap_or(0.0)
    }

    pub fn hat(&self, indice: u8) -> u8 {
        self.hats.get(usize::from(indice)).copied().unwrap_or(0)
    }
}

/// Bits de direccion de un hat (como SDL).
pub mod hat {
    pub const ARRIBA: u8 = 1;
    pub const DERECHA: u8 = 2;
    pub const ABAJO: u8 = 4;
    pub const IZQUIERDA: u8 = 8;

    /// Combina los dos ejes de un hat (-1, 0, 1; y positivo hacia abajo) en sus bits.
    pub fn desde_xy(x: i32, y: i32) -> u8 {
        let mut v = 0;
        if y < 0 {
            v |= ARRIBA;
        }
        if y > 0 {
            v |= ABAJO;
        }
        if x > 0 {
            v |= DERECHA;
        }
        if x < 0 {
            v |= IZQUIERDA;
        }
        v
    }
}

/// Lleva un valor del rango del dispositivo a -1..1.
pub fn normalizar(valor: i32, minimo: i32, maximo: i32) -> f32 {
    if maximo <= minimo {
        return 0.0;
    }
    let t = (f64::from(valor) - f64::from(minimo)) / (f64::from(maximo) - f64::from(minimo));
    (t * 2.0 - 1.0).clamp(-1.0, 1.0) as f32
}

#[derive(Debug, thiserror::Error)]
pub enum ErrorMandos {
    #[error("el mando ya no esta conectado")]
    NoEncontrado,
    #[error("este mando no tiene vibracion")]
    SinVibracion,
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

/// Origen de mandos de una plataforma. `sondear` espera como mucho `espera` a que llegue algo,
/// anade los eventos (entradas, conexiones y desconexiones) y vuelve.
pub trait FuenteMandos: Send {
    fn mandos(&self) -> Vec<InfoMando>;
    fn estado(&self, id: IdMando) -> Option<EstadoCrudo>;
    fn sondear(&mut self, espera: Duration, eventos: &mut Vec<Evento>);
    /// Vibracion de prueba: intensidades 0..1 de los motores grande y pequeno.
    fn vibrar(&mut self, id: IdMando, fuerte: f32, debil: f32, duracion: Duration) -> Result<(), ErrorMandos>;
}

/// La fuente de mandos del sistema en el que se compila.
pub fn fuente_nativa() -> Box<dyn FuenteMandos> {
    #[cfg(target_os = "linux")]
    return Box::new(linux::FuenteEvdev::nueva());
    #[cfg(windows)]
    return Box::new(windows::FuenteXinput::nueva());
    #[cfg(not(any(target_os = "linux", windows)))]
    return Box::new(simulado::FuenteSimulada::default());
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn normaliza_rangos() {
        assert_eq!(normalizar(0, 0, 255), -1.0);
        assert_eq!(normalizar(255, 0, 255), 1.0);
        assert!(normalizar(0, -32768, 32767).abs() < 0.001);
        assert_eq!(normalizar(5, 3, 3), 0.0);
    }

    #[test]
    fn hat_desde_ejes() {
        assert_eq!(hat::desde_xy(0, -1), hat::ARRIBA);
        assert_eq!(hat::desde_xy(1, 1), hat::DERECHA | hat::ABAJO);
        assert_eq!(hat::desde_xy(0, 0), 0);
    }
}
