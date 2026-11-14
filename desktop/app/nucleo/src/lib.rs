//! Nucleo de Gamepad Mapper Pluton para escritorio (sin Tauri, sin interfaz).
//!
//! - [`dispositivos`]: enumera los mandos y lee su estado en crudo (evdev en Linux, XInput en
//!   Windows), con conexion y desconexion en caliente.
//! - [`mapeo`]: el modelo «entrada cruda -> control estandar», su formato SDL GameControllerDB,
//!   el mapeo automatico, los ajustes de stick y el guardado por mando.
//! - [`asistente`]: la maquina de estados de «Asignar todo».
//! - [`servicio`]: une todo lo anterior para una interfaz (la app Tauri o pruebas).
//!
//! Los nombres siguen los de los perfiles (A, B, L1, DPAD_UP, LS...) para que las fases
//! siguientes (toques en juegos Android, mando virtual) usen el mismo vocabulario.

pub mod asistente;
pub mod dispositivos;
pub mod mapeo;
pub mod servicio;
