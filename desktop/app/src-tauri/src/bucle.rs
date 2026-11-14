//! Hilo que lee los mandos: avisa de conexiones y desconexiones (evento `mandos-cambiados`) y
//! envia la entrada en vivo del mando suscrito como mucho ~60 veces por segundo y solo si cambia.

use crate::estado::{bloquear, Compartido};
use nucleo::dispositivos::Evento;
use nucleo::servicio::Instantanea;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Lectura a 250 Hz: el candado del servicio se suelta entre lecturas para no hacer esperar a los
/// comandos.
const PAUSA: Duration = Duration::from_millis(4);
const INTERVALO_ENVIO: Duration = Duration::from_millis(16);

pub fn arrancar(app: AppHandle, estado: Arc<Compartido>) {
    thread::Builder::new()
        .name("mandos".into())
        .spawn(move || {
            let mut ultimo_envio = Instant::now();
            // Ultimo envio: (canal, instantanea). Un canal nuevo siempre recibe la primera.
            let mut ultima: Option<(u32, Instantanea)> = None;
            loop {
                // La lista de mandos solo si alguno se ha conectado o desconectado.
                let mandos = {
                    let mut s = estado.servicio();
                    let eventos = s.sondear(Duration::ZERO);
                    eventos.iter().any(|e| !matches!(e, Evento::Entrada { .. })).then(|| s.mandos())
                };
                if let Some(mandos) = mandos {
                    if let Err(e) = app.emit("mandos-cambiados", mandos) {
                        log::warn!("no se pudo avisar a la ventana: {e}");
                    }
                }
                if ultimo_envio.elapsed() >= INTERVALO_ENVIO {
                    ultimo_envio = Instant::now();
                    enviar_instantanea(&estado, &mut ultima);
                }
                thread::sleep(PAUSA);
            }
        })
        .expect("no se pudo crear el hilo de los mandos");
}

fn enviar_instantanea(estado: &Compartido, ultima: &mut Option<(u32, Instantanea)>) {
    let mut suscripcion = bloquear(&estado.suscripcion);
    let Some((id, canal)) = suscripcion.as_ref() else { return };
    let Some(ahora) = estado.servicio().instantanea(*id) else { return };
    if ultima.as_ref().is_some_and(|(c, i)| *c == canal.id() && *i == ahora) {
        return;
    }
    if canal.send(ahora.clone()).is_err() {
        // La ventana se cerro o se recargo: deja de enviar hasta la siguiente suscripcion.
        *suscripcion = None;
        *ultima = None;
        return;
    }
    *ultima = Some((canal.id(), ahora));
}
