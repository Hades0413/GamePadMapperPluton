//! Estado compartido entre los comandos y el hilo que lee los mandos.

use nucleo::dispositivos::IdMando;
use nucleo::servicio::{Instantanea, Servicio};
use std::sync::{Mutex, MutexGuard};
use tauri::ipc::Channel;

pub struct Compartido {
    pub servicio: Mutex<Servicio>,
    /// Mando cuya entrada en vivo se envia a la interfaz y canal por el que se envia.
    pub suscripcion: Mutex<Option<(IdMando, Channel<Instantanea>)>>,
}

/// Bloquea aunque otro hilo haya entrado en panico con el candado tomado: el estado sigue siendo
/// valido (cada operacion del servicio deja el estado coherente).
pub fn bloquear<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Compartido {
    pub fn nuevo(servicio: Servicio) -> Self {
        Self { servicio: Mutex::new(servicio), suscripcion: Mutex::new(None) }
    }

    pub fn servicio(&self) -> MutexGuard<'_, Servicio> {
        bloquear(&self.servicio)
    }
}
