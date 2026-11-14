//! Gamepad Mapper Pluton para escritorio: ventana Tauri sobre el nucleo (`nucleo`).
//!
//! `gamepad-mapper-pluton --listar-mandos` escribe los mandos detectados en JSON y sale (sin
//! ventana): sirve para diagnosticar permisos y para las pruebas.
//! Registro: variable `GPM_LOG` (error, warn, info, debug; por defecto info).

// Sin consola en Windows al abrir la app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bucle;
mod comandos;
mod estado;

use estado::Compartido;
use nucleo::dispositivos::fuente_nativa;
use nucleo::mapeo::almacen::AlmacenMapeos;
use nucleo::mapeo::basedatos::BaseDatosSdl;
use nucleo::servicio::Servicio;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

/// Registro minimo a stderr (sin dependencias).
struct Registro;

impl log::Log for Registro {
    fn enabled(&self, m: &log::Metadata) -> bool {
        m.level() <= log::max_level()
    }
    fn log(&self, r: &log::Record) {
        let nuestro = r.target().starts_with("nucleo") || r.target().starts_with("gamepad_mapper_pluton");
        if nuestro && self.enabled(r.metadata()) {
            eprintln!("[{}] {}", r.level(), r.args());
        }
    }
    fn flush(&self) {}
}

fn iniciar_registro() {
    let nivel = match std::env::var("GPM_LOG").unwrap_or_default().as_str() {
        "error" => log::LevelFilter::Error,
        "warn" => log::LevelFilter::Warn,
        "debug" => log::LevelFilter::Debug,
        _ => log::LevelFilter::Info,
    };
    if log::set_logger(&Registro).is_ok() {
        log::set_max_level(nivel);
    }
}

fn base_datos() -> BaseDatosSdl {
    let mut base = BaseDatosSdl::incluida();
    if let Some(ruta) = comandos::ruta_base_datos().filter(|r| r.exists()) {
        match base.cargar_archivo(&ruta) {
            Ok(n) => log::info!("base de datos SDL del usuario: {n} entradas ({})", ruta.display()),
            Err(e) => log::warn!("no se pudo leer {}: {e}", ruta.display()),
        }
    }
    base
}

/// `--listar-mandos`: espera un poco a que aparezcan y los escribe en JSON.
fn listar_mandos() {
    let mut servicio = Servicio::nuevo(fuente_nativa(), base_datos(), None);
    let fin = Instant::now() + Duration::from_millis(1500);
    while Instant::now() < fin {
        servicio.sondear(Duration::from_millis(50));
    }
    match serde_json::to_string_pretty(&servicio.mandos()) {
        Ok(json) => println!("{json}"),
        Err(e) => eprintln!("{e}"),
    }
}

fn main() {
    iniciar_registro();
    if std::env::args().any(|a| a == "--listar-mandos") {
        listar_mandos();
        return;
    }

    let servicio = Servicio::nuevo(fuente_nativa(), base_datos(), AlmacenMapeos::por_defecto());
    log::info!(
        "Gamepad Mapper Pluton {} — mapeos en {}",
        env!("CARGO_PKG_VERSION"),
        servicio.carpeta_mapeos().map_or_else(|| "(ninguna)".into(), |p| p.display().to_string())
    );
    let compartido = Arc::new(Compartido::nuevo(servicio));

    let resultado = tauri::Builder::default()
        .manage(Arc::clone(&compartido))
        .setup(move |app| {
            let mostrar = MenuItem::with_id(app, "mostrar", "Mostrar / Show", true, None::<&str>)?;
            let salir = MenuItem::with_id(app, "salir", "Salir / Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&mostrar, &salir])?;
            let mut bandeja = TrayIconBuilder::with_id("principal")
                .tooltip("Gamepad Mapper Plutón")
                .menu(&menu)
                .on_menu_event(|app, evento| match evento.id().as_ref() {
                    "mostrar" => {
                        if let Some(v) = app.get_webview_window("main") {
                            let _ = v.unminimize();
                            let _ = v.show();
                            let _ = v.set_focus();
                        }
                    }
                    "salir" => app.exit(0),
                    _ => {}
                });
            if let Some(icono) = app.default_window_icon() {
                bandeja = bandeja.icon(icono.clone());
            }
            bandeja.build(app)?;
            bucle::arrancar(app.handle().clone(), compartido);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            comandos::info_app,
            comandos::listar_mandos,
            comandos::suscribir_entrada,
            comandos::cancelar_suscripcion,
            comandos::obtener_mapeo,
            comandos::editar_mapeo,
            comandos::guardar_mapeo,
            comandos::restablecer_mapeo,
            comandos::auto_mapear,
            comandos::exportar_sdl,
            comandos::importar_sdl,
            comandos::cargar_base_datos,
            comandos::probar_vibracion,
            comandos::asistente_iniciar,
            comandos::asistente_saltar,
            comandos::asistente_atras,
            comandos::asistente_cancelar,
            comandos::asistente_aplicar,
        ])
        .run(tauri::generate_context!());
    if let Err(e) = resultado {
        log::error!("no se pudo abrir la app: {e}");
        std::process::exit(1);
    }
}
