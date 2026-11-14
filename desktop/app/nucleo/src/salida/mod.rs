//! Mandos virtuales («convertir en distintos mandos»): cada mando fisico puede producir un mando
//! Xbox 360 (XInput), DualShock 4 o Switch Pro que los juegos ven como uno de verdad.
//!
//! - Linux: uinput ([`linux`]) con el nombre, los ids y las capacidades que dan los drivers del
//!   kernel (xpad, hid-playstation, hid-nintendo), asi SDL, Steam y los juegos los reconocen.
//! - Windows: ViGEmBus ([`windows`]) si esta instalado (Xbox 360 y DualShock 4).
//! - [`simulada`]: en memoria, para pruebas.
//!
//! En la fase 2B llegaran los «toques» (pantalla tactil para juegos Android) como otro destino de
//! la misma configuracion: por eso el tipo de salida es un enum abierto y la configuracion habla de
//! controles ([`SalidaPad`]) y no de un dispositivo concreto.

use crate::mapeo::acciones::SalidaPad;
use serde::{Deserialize, Serialize};
use std::io;

#[cfg(target_os = "linux")]
pub mod linux;
pub mod simulada;
#[cfg(windows)]
pub mod windows;

/// Mando virtual que produce un mando fisico.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TipoSalida {
    /// Sin mando virtual: solo se lee el mando (la configuracion se usa en la app).
    #[default]
    Ninguna,
    Xbox360,
    Dualshock4,
    Switchpro,
}

impl TipoSalida {
    pub const VIRTUALES: [TipoSalida; 3] = [TipoSalida::Xbox360, TipoSalida::Dualshock4, TipoSalida::Switchpro];
}

/// Estado del mando virtual: botones (bits de [`SalidaPad`]), sticks (-1..1, y positivo hacia
/// abajo) y gatillos (0..1).
#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
pub struct EstadoPad {
    pub botones: u32,
    pub ls: [f32; 2],
    pub rs: [f32; 2],
    pub l2: f32,
    pub r2: f32,
}

impl EstadoPad {
    pub fn pulsado(&self, s: SalidaPad) -> bool {
        self.botones & s.bit() != 0
    }

    /// Aplica una salida con intensidad `v` (0..1): botones por encima de la mitad, gatillos y
    /// direcciones de stick analogicos (se queda el mayor de lo que ya hubiera).
    pub fn aplicar(&mut self, s: SalidaPad, v: f32) {
        let v = v.clamp(0.0, 1.0);
        match s {
            SalidaPad::L2 => self.l2 = self.l2.max(v),
            SalidaPad::R2 => self.r2 = self.r2.max(v),
            SalidaPad::LsUp => self.ls[1] = self.ls[1].min(-v),
            SalidaPad::LsDown => self.ls[1] = self.ls[1].max(v),
            SalidaPad::LsLeft => self.ls[0] = self.ls[0].min(-v),
            SalidaPad::LsRight => self.ls[0] = self.ls[0].max(v),
            SalidaPad::RsUp => self.rs[1] = self.rs[1].min(-v),
            SalidaPad::RsDown => self.rs[1] = self.rs[1].max(v),
            SalidaPad::RsLeft => self.rs[0] = self.rs[0].min(-v),
            SalidaPad::RsRight => self.rs[0] = self.rs[0].max(v),
            boton => {
                if v > crate::mapeo::ajustes::UMBRAL_PULSADO {
                    self.botones |= boton.bit();
                }
            }
        }
    }

    /// Cruceta como bits de hat (arriba 1, derecha 2, abajo 4, izquierda 8) y como ejes -1/0/1.
    pub fn cruceta_xy(&self) -> (i32, i32) {
        let d = |s: SalidaPad| i32::from(self.pulsado(s));
        (d(SalidaPad::DpadRight) - d(SalidaPad::DpadLeft), d(SalidaPad::DpadDown) - d(SalidaPad::DpadUp))
    }
}

/// Por que no se puede crear un mando virtual. Los textos estan tambien en
/// `ui/src/dominio/errores.ts` para traducirlos.
#[derive(Debug, thiserror::Error)]
pub enum ErrorSalida {
    #[error("Sin permiso para crear mandos virtuales: hace falta acceso a /dev/uinput (grupo «input»).")]
    SinPermisoUinput,
    #[error("ViGEmBus no está instalado: hace falta para crear mandos virtuales en Windows.")]
    SinVigem,
    #[error("Falta ViGEmClient.dll (el cliente de ViGEmBus) junto a la app.")]
    SinClienteVigem,
    #[error("Este tipo de mando virtual no está disponible en este sistema.")]
    NoDisponible,
    #[error("No se pudo crear el mando virtual: {0}")]
    Io(#[from] io::Error),
}

/// Si cada tipo de mando virtual se puede crear aqui (y si no, por que).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Disponibilidad {
    pub tipo: TipoSalida,
    pub disponible: bool,
    pub motivo: Option<String>,
}

/// Un mando virtual creado.
pub trait SalidaVirtual: Send {
    fn tipo(&self) -> TipoSalida;
    /// Envia el estado completo (solo se llama cuando cambia).
    fn enviar(&mut self, pad: &EstadoPad) -> io::Result<()>;
    /// Vibracion que pide el juego (fuerte, debil; 0..1), solo si ha cambiado desde la ultima vez.
    fn vibracion(&mut self) -> Option<(f32, f32)>;
    /// Donde esta (`/dev/input/event23`, `ViGEm XInput 2`...), para mostrarlo.
    fn descripcion(&self) -> String;
}

/// Teclado virtual para las acciones de tipo tecla (indices de [`crate::mapeo::acciones::TECLAS`]).
pub trait Teclado: Send {
    fn tecla(&mut self, indice: usize, pulsada: bool) -> io::Result<()>;
}

/// Crea mandos virtuales y el teclado virtual del sistema.
pub trait FabricaSalidas: Send {
    fn disponibilidad(&self) -> Vec<Disponibilidad>;
    fn crear(&mut self, tipo: TipoSalida) -> Result<Box<dyn SalidaVirtual>, ErrorSalida>;
    fn teclado(&mut self) -> Result<Box<dyn Teclado>, ErrorSalida>;
}

/// La fabrica del sistema en el que se compila.
pub fn fabrica_nativa() -> Box<dyn FabricaSalidas> {
    #[cfg(target_os = "linux")]
    return Box::new(linux::FabricaUinput);
    #[cfg(windows)]
    return Box::new(windows::FabricaVigem::default());
    #[cfg(not(any(target_os = "linux", windows)))]
    return Box::new(simulada::FabricaSimulada::default());
}

/// Valor -1..1 de un stick en el rango de un dispositivo con su centro.
pub fn a_rango(v: f32, minimo: i32, centro: i32, maximo: i32) -> i32 {
    let v = if v.is_finite() { v.clamp(-1.0, 1.0) } else { 0.0 };
    let r = if v >= 0.0 { f64::from(maximo - centro) } else { f64::from(centro - minimo) };
    (f64::from(centro) + f64::from(v) * r).round() as i32
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn rangos() {
        assert_eq!(a_rango(0.0, -32768, 0, 32767), 0);
        assert_eq!(a_rango(1.0, -32768, 0, 32767), 32767);
        assert_eq!(a_rango(-1.0, -32768, 0, 32767), -32768);
        assert_eq!(a_rango(0.0, 0, 128, 255), 128);
        assert_eq!(a_rango(-1.0, 0, 128, 255), 0);
        assert_eq!(a_rango(1.0, 0, 128, 255), 255);
        assert_eq!(a_rango(f32::NAN, 0, 128, 255), 128);
    }

    #[test]
    fn aplicar_salidas() {
        let mut p = EstadoPad::default();
        p.aplicar(SalidaPad::A, 1.0);
        p.aplicar(SalidaPad::B, 0.3);
        p.aplicar(SalidaPad::L2, 0.4);
        p.aplicar(SalidaPad::LsUp, 0.7);
        p.aplicar(SalidaPad::DpadLeft, 1.0);
        assert!(p.pulsado(SalidaPad::A) && !p.pulsado(SalidaPad::B));
        assert_eq!(p.l2, 0.4);
        assert_eq!(p.ls, [0.0, -0.7]);
        assert_eq!(p.cruceta_xy(), (-1, 0));
        let json = serde_json::to_string(&TipoSalida::Switchpro).unwrap();
        assert_eq!(json, "\"switchpro\"");
    }
}
