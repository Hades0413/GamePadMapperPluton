//! Estado compartido entre los comandos, el hilo que lee los mandos y el de la ventana activa.

use nucleo::dispositivos::IdMando;
use nucleo::opciones::Opciones;
use nucleo::servicio::{Instantanea, Servicio};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};
use tauri::ipc::Channel;

pub struct Compartido {
    pub servicio: Mutex<Servicio>,
    /// Mando cuya entrada en vivo se envia a la interfaz y canal por el que se envia.
    pub suscripcion: Mutex<Option<(IdMando, Channel<Instantanea>)>>,
    pub opciones: Mutex<Opciones>,
    /// La bandeja tiene que volver a dibujar su menu (cambio de mandos, pausa...).
    pub bandeja_sucia: AtomicBool,
    /// Ultima vez (ms desde el arranque) que la interfaz pregunto por los toques: mientras mira,
    /// se consulta el juego Android aunque ningun mando use los toques.
    pub toques_mirados: AtomicU64,
    pub arranque: std::time::Instant,
    esperando: AtomicUsize,
}

/// Bloquea aunque otro hilo haya entrado en panico con el candado tomado: el estado sigue siendo
/// valido (cada operacion del servicio deja el estado coherente).
pub fn bloquear<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Compartido {
    pub fn nuevo(servicio: Servicio, opciones: Opciones) -> Self {
        Self {
            servicio: Mutex::new(servicio),
            suscripcion: Mutex::new(None),
            opciones: Mutex::new(opciones),
            bandeja_sucia: AtomicBool::new(true),
            toques_mirados: AtomicU64::new(0),
            arranque: std::time::Instant::now(),
            esperando: AtomicUsize::new(0),
        }
    }

    /// Candado del servicio para los comandos y los otros hilos: avisa al hilo de lectura (que lo
    /// toma sin parar) para que ceda el turno.
    pub fn servicio(&self) -> MutexGuard<'_, Servicio> {
        self.esperando.fetch_add(1, Ordering::AcqRel);
        let g = bloquear(&self.servicio);
        self.esperando.fetch_sub(1, Ordering::AcqRel);
        g
    }

    /// Candado para el hilo de lectura: si alguien espera, le deja pasar antes.
    pub fn servicio_lectura(&self) -> MutexGuard<'_, Servicio> {
        while self.esperando.load(Ordering::Acquire) > 0 {
            std::thread::sleep(std::time::Duration::from_micros(200));
        }
        bloquear(&self.servicio)
    }

    /// Milisegundos desde el arranque.
    pub fn ms(&self) -> u64 {
        self.arranque.elapsed().as_millis() as u64
    }

    pub fn opciones(&self) -> Opciones {
        bloquear(&self.opciones).clone()
    }
}
