//! «Toques»: jugar con mando a juegos Android que se ven en el PC (Waydroid, un emulador, scrcpy)
//! con los perfiles de la comunidad, igual que en el movil.
//!
//! - [`motor`]: el nucleo en C de gpmapper (`mapper/src/core`, compilado por `build.rs`) por FFI:
//!   perfil + estado del mando -> toques en coordenadas 0..1 del destino.
//! - La salida (pantalla tactil virtual uinput en Linux, `InjectTouchInput` en Windows) esta en
//!   [`crate::salida`] y la sesion (destino, foco, captura del mando) en [`crate::servicio`].

mod ffi;
pub mod motor;

pub use motor::{adaptar, ErrorToques, MotorToques, OpToque, Peticiones};
