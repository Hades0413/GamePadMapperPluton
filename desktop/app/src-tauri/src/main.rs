//! Gamepad Mapper Pluton para escritorio: ventana Tauri sobre el nucleo (`nucleo`).
//!
//! - `--listar-mandos`: escribe los mandos detectados en JSON y sale (sin ventana): sirve para
//!   diagnosticar permisos y para las pruebas.
//! - `--minimizado`: arranca en la bandeja (lo usa el inicio con el sistema).
//!
//! Registro: variable `GPM_LOG` (error, warn, info, debug; por defecto info).

// Sin consola en Windows al abrir la app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod actualizar;
mod atajo;
mod bandeja;
mod bucle;
mod comandos;
mod estado;
mod registro;

use estado::Compartido;
use nucleo::dispositivos::fuente_nativa;
use nucleo::juegos::AlmacenJuegos;
use nucleo::mapeo::almacen::AlmacenMapeos;
use nucleo::opciones::Opciones;
use nucleo::salida::fabrica_nativa;
use nucleo::servicio::Servicio;
use nucleo::sistema::ARGUMENTO_MINIMIZADO;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{Manager, WindowEvent};

/// `--listar-mandos`: espera un poco a que aparezcan y los escribe en JSON.
fn listar_mandos() {
    let mut servicio = Servicio::nuevo(fuente_nativa(), comandos::construir_base(), None);
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
    registro::iniciar();
    if std::env::args().any(|a| a == "--listar-mandos") {
        listar_mandos();
        return;
    }
    let opciones = Opciones::cargar();
    registro::en_archivo(opciones.registro);
    let minimizado = opciones.iniciar_minimizado || std::env::args().any(|a| a == ARGUMENTO_MINIMIZADO);

    let mut servicio = Servicio::nuevo(fuente_nativa(), comandos::construir_base(), AlmacenMapeos::por_defecto())
        .con_salidas(fabrica_nativa());
    if let Some(juegos) = AlmacenJuegos::por_defecto() {
        servicio = servicio.con_juegos(juegos);
    }
    log::info!(
        "Gamepad Mapper Pluton {} — mapeos en {}",
        env!("CARGO_PKG_VERSION"),
        servicio.carpeta_mapeos().map_or_else(|| "(ninguna)".into(), |p| p.display().to_string())
    );
    let compartido = Arc::new(Compartido::nuevo(servicio, opciones));
    let para_ventana = Arc::clone(&compartido);

    let resultado = tauri::Builder::default()
        // Una sola copia: dos copias se pelearian por los mandos (captura y mandos virtuales).
        .plugin(tauri_plugin_single_instance::init(|app, _, _| bandeja::mostrar_ventana(app)))
        // Solo se usan desde Rust: la interfaz no tiene permisos de estos plugins.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Arc::clone(&compartido))
        .setup(move |app| {
            bandeja::crear(app.handle(), Arc::clone(&compartido))?;
            let atajo = compartido.opciones().atajo_pausa;
            atajo::registrar(app.handle(), &compartido, &atajo);
            if let Some(v) = app.get_webview_window("main") {
                if !minimizado {
                    let _ = v.show();
                }
            }
            bucle::arrancar(app.handle().clone(), compartido);
            Ok(())
        })
        .on_window_event(move |ventana, evento| {
            // Cerrar la ventana la esconde en la bandeja: los mandos virtuales siguen funcionando.
            if let WindowEvent::CloseRequested { api, .. } = evento {
                if para_ventana.opciones().minimizar_a_bandeja {
                    api.prevent_close();
                    let _ = ventana.hide();
                }
            }
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
            comandos::anadir_mandos,
            comandos::actualizar_base,
            comandos::enviar_a_comunidad,
            comandos::probar_vibracion,
            comandos::asistente_iniciar,
            comandos::asistente_saltar,
            comandos::asistente_atras,
            comandos::asistente_cancelar,
            comandos::asistente_aplicar,
            comandos::disponibilidad_salidas,
            comandos::pausar,
            comandos::reintentar_salida,
            comandos::grabar_macro_iniciar,
            comandos::grabar_macro_terminar,
            comandos::exportar_config,
            comandos::importar_config,
            comandos::probar_motores,
            comandos::listar_juegos,
            comandos::juego_activo,
            comandos::guardar_juego,
            comandos::borrar_juego,
            comandos::copiar_a_juego,
            comandos::quitar_de_juego,
            comandos::ventana_activa,
            comandos::obtener_opciones,
            comandos::guardar_opciones,
            comandos::leer_registro,
            comandos::abrir_enlace,
            actualizar::buscar_actualizacion,
            actualizar::instalar_actualizacion,
        ])
        .run(tauri::generate_context!());
    if let Err(e) = resultado {
        log::error!("no se pudo abrir la app: {e}");
        std::process::exit(1);
    }
}
