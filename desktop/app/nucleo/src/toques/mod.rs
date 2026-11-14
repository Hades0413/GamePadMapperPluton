//! «Toques»: jugar con mando a juegos Android que se ven en el PC (Waydroid, un emulador, scrcpy)
//! con los perfiles de la comunidad, igual que en el movil.
//!
//! - [`motor`]: el nucleo en C de gpmapper (`mapper/src/core`, compilado por `build.rs`) por FFI:
//!   perfil + estado del mando -> toques en coordenadas 0..1 del destino.
//! - [`perfiles`]: validacion de perfiles (.conf), carpeta local y perfiles de la comunidad.
//! - [`android`]: juego Android en primer plano por adb (Waydroid, emuladores).
//! - [`ventanas`]: ventanas abiertas (destino de los toques) y tamano del escritorio.
//! - [`config`]: destino por mando y configuracion de la app (`toques.json`).
//! - La salida (pantalla tactil virtual uinput en Linux, `InjectTouchInput` en Windows) esta en
//!   [`crate::salida`] y la sesion (destino, foco, captura del mando) en [`crate::servicio`].

pub mod android;
pub mod config;
mod ffi;
pub mod motor;
pub mod perfiles;
pub mod ventanas;

pub use motor::{adaptar, ErrorToques, MotorToques, OpToque, Peticiones};
