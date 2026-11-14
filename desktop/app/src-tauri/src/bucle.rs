//! Hilos de fondo:
//! - «mandos»: lee los mandos y mueve los mandos virtuales sin pausa (espera como mucho 2 ms a
//!   que llegue algo: la entrada se procesa en cuanto llega). Avisa de conexiones y desconexiones
//!   (evento `mandos-cambiados`) y envia la entrada en vivo del mando suscrito como mucho ~60 veces
//!   por segundo y solo si cambia.
//! - «foco»: cada segundo mira la ventana activa y cambia a la configuracion de su juego; cada
//!   medio segundo sigue la ventana destino de los toques (posicion, tamano y foco).
//! - «android»: cada 2 s pregunta por adb que juego Android esta en primer plano (solo si un mando
//!   usa los toques o la interfaz los esta mirando), para usar su perfil de toques.

use crate::bandeja;
use crate::estado::{bloquear, Compartido};
use nucleo::dispositivos::Evento;
use nucleo::servicio::Instantanea;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const ESPERA_LECTURA: Duration = Duration::from_millis(2);
const INTERVALO_ENVIO: Duration = Duration::from_millis(16);
const INTERVALO_FOCO: Duration = Duration::from_secs(1);
const INTERVALO_VENTANA: Duration = Duration::from_millis(500);
const INTERVALO_ANDROID: Duration = Duration::from_secs(2);
/// Tiempo que se sigue consultando adb despues de que la interfaz mire los toques.
const MIRADA_MS: u64 = 6000;
const INTERVALO_RESUMEN: Duration = Duration::from_millis(500);

pub fn arrancar(app: AppHandle, estado: Arc<Compartido>) {
    let app_foco = app.clone();
    let estado_foco = Arc::clone(&estado);
    thread::Builder::new()
        .name("mandos".into())
        .spawn(move || {
            let mut ultimo_envio = Instant::now();
            // Ultimo envio: (canal, instantanea). Un canal nuevo siempre recibe la primera.
            let mut ultima: Option<(u32, Instantanea)> = None;
            let mut resumen = None;
            let mut ultimo_resumen = Instant::now();
            loop {
                let mandos = {
                    let mut s = estado.servicio_lectura();
                    let eventos = s.sondear(ESPERA_LECTURA);
                    eventos.iter().any(|e| !matches!(e, Evento::Entrada { .. })).then(|| s.mandos())
                };
                if let Some(mandos) = mandos {
                    if let Err(e) = app.emit("mandos-cambiados", mandos) {
                        log::warn!("no se pudo avisar a la ventana: {e}");
                    }
                    estado.bandeja_sucia.store(true, Ordering::Release);
                }
                // La bandeja muestra cada mando y su mando virtual: se redibuja si cambia algo.
                let sucia = estado.bandeja_sucia.swap(false, Ordering::AcqRel);
                if sucia || ultimo_resumen.elapsed() >= INTERVALO_RESUMEN {
                    ultimo_resumen = Instant::now();
                    let s = estado.servicio();
                    let nuevo = (s.resumen(), s.pausado(), s.juego_activo());
                    drop(s);
                    if sucia || resumen.as_ref() != Some(&nuevo) {
                        bandeja::actualizar(&app, &nuevo.0, nuevo.1, nuevo.2.as_ref().map(|j| j.1.as_str()));
                        resumen = Some(nuevo);
                    }
                }
                if ultimo_envio.elapsed() >= INTERVALO_ENVIO {
                    ultimo_envio = Instant::now();
                    enviar_instantanea(&estado, &mut ultima);
                }
            }
        })
        .expect("no se pudo crear el hilo de los mandos");

    let estado_android = Arc::clone(&estado_foco);
    thread::Builder::new()
        .name("android".into())
        .spawn(move || bucle_android(&estado_android))
        .expect("no se pudo crear el hilo de android");

    thread::Builder::new()
        .name("foco".into())
        .spawn(move || {
            let mut ultimo_foco = Instant::now();
            loop {
                thread::sleep(INTERVALO_VENTANA);
                seguir_ventana_toques(&estado_foco);
                if ultimo_foco.elapsed() < INTERVALO_FOCO {
                    continue;
                }
                ultimo_foco = Instant::now();
                let auto = bloquear(&estado_foco.opciones).cambio_automatico;
                // La consulta al servidor X se hace sin el candado del servicio.
                let ventana = if auto { nucleo::foco::ventana_activa() } else { None };
                let cambiado = estado_foco.servicio().poner_ventana(ventana.as_ref());
                if cambiado {
                    let activo = estado_foco.servicio().juego_activo();
                    let _ = app_foco.emit("juego-cambiado", activo);
                    estado_foco.bandeja_sucia.store(true, Ordering::Release);
                }
            }
        })
        .expect("no se pudo crear el hilo del foco");
}

/// Sigue la ventana destino de los toques (la consulta al servidor X va sin el candado).
fn seguir_ventana_toques(estado: &Compartido) {
    let Some((objetivo, previa)) = estado.servicio().objetivo_toques() else { return };
    let lista = nucleo::toques::ventanas::listar().unwrap_or_default();
    let elegida = objetivo.elegir(&lista, previa).cloned();
    estado.servicio().poner_ventana_toques(elegida);
}

/// Juego Android en primer plano por adb (adb va sin el candado del servicio).
fn bucle_android(estado: &Compartido) {
    use nucleo::toques::android;
    let mut adb: Option<std::path::PathBuf> = None;
    let mut ultima_busqueda: Option<Instant> = None;
    loop {
        thread::sleep(INTERVALO_ANDROID);
        let (config, en_uso) = {
            let s = estado.servicio();
            (s.config_toques(), s.estado_toques().mando.is_some())
        };
        let mirando = estado.ms().saturating_sub(estado.toques_mirados.load(Ordering::Acquire)) < MIRADA_MS;
        if !config.adb {
            estado.servicio().poner_deteccion(None);
            continue;
        }
        if !en_uso && !mirando {
            continue;
        }
        // adb puede instalarse con la app abierta: se vuelve a buscar cada 30 s.
        if adb.is_none() && ultima_busqueda.is_none_or(|t| t.elapsed() > Duration::from_secs(30)) {
            ultima_busqueda = Some(Instant::now());
            adb = android::buscar_adb();
            if let Some(a) = &adb {
                log::info!("adb: {}", a.display());
            }
        }
        let resultado = match &adb {
            Some(a) => android::detectar(a, config.dispositivo.as_deref()),
            None => Err(android::ErrorAdb::SinAdb),
        };
        if resultado == Err(android::ErrorAdb::SinAdb) {
            adb = None;
        }
        estado.servicio().poner_deteccion(Some(resultado));
    }
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
