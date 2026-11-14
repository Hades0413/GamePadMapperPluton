//! Icono de la bandeja: mostrar la ventana, pausar o reanudar los mandos virtuales, el estado de
//! cada mando y salir. Los textos van en los dos idiomas (la bandeja no sigue el idioma de la
//! interfaz).

use crate::estado::Compartido;
use nucleo::salida::TipoSalida;
use nucleo::servicio::ResumenMando;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Wry};

const ID: &str = "principal";

fn nombre_salida(t: TipoSalida) -> &'static str {
    match t {
        TipoSalida::Ninguna => "—",
        TipoSalida::Xbox360 => "Xbox 360",
        TipoSalida::Dualshock4 => "DualShock 4",
        TipoSalida::Switchpro => "Switch Pro",
        TipoSalida::Toques => "Toques / Touch",
    }
}

fn menu(app: &AppHandle, mandos: &[ResumenMando], pausado: bool, juego: Option<&str>) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "mostrar", "Mostrar / Show", true, None::<&str>)?)?;
    let pausa = if pausado { "Reanudar / Resume" } else { "Pausar / Pause" };
    menu.append(&MenuItem::with_id(app, "pausar", pausa, true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    if mandos.is_empty() {
        menu.append(&MenuItem::new(app, "Sin mandos / No controllers", false, None::<&str>)?)?;
    }
    for m in mandos {
        let estado = match (&m.salida.tipo, m.salida.activa, &m.salida.error) {
            (TipoSalida::Ninguna, _, _) => String::new(),
            (t, true, _) => format!(" → {} ✓", nombre_salida(*t)),
            (t, false, Some(_)) => format!(" → {} ✗", nombre_salida(*t)),
            (t, false, None) => format!(" → {} ⏸", nombre_salida(*t)),
        };
        let mut texto: String = m.nombre.chars().take(40).collect();
        texto.push_str(&estado);
        menu.append(&MenuItem::new(app, texto, false, None::<&str>)?)?;
    }
    if let Some(j) = juego {
        menu.append(&MenuItem::new(app, format!("🎮 {j}"), false, None::<&str>)?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "salir", "Salir / Quit", true, None::<&str>)?)?;
    Ok(menu)
}

pub fn mostrar_ventana(app: &AppHandle) {
    if let Some(v) = app.get_webview_window("main") {
        let _ = v.unminimize();
        let _ = v.show();
        let _ = v.set_focus();
    }
}

/// Pausa o reanuda todos los mandos virtuales y avisa a la interfaz.
pub fn alternar_pausa(app: &AppHandle, estado: &Compartido) {
    let pausado = {
        let mut s = estado.servicio();
        let p = !s.pausado();
        s.pausar(p);
        p
    };
    let _ = app.emit("pausa-cambiada", pausado);
    estado.bandeja_sucia.store(true, Ordering::Release);
}

pub fn crear(app: &AppHandle, estado: Arc<Compartido>) -> tauri::Result<()> {
    let mut bandeja = TrayIconBuilder::with_id(ID)
        .tooltip("Gamepad Mapper Plutón")
        .menu(&menu(app, &[], false, None)?)
        .on_menu_event(move |app, evento| match evento.id().as_ref() {
            "mostrar" => mostrar_ventana(app),
            "pausar" => alternar_pausa(app, &estado),
            "salir" => app.exit(0),
            _ => {}
        });
    if let Some(icono) = app.default_window_icon() {
        bandeja = bandeja.icon(icono.clone());
    }
    bandeja.build(app)?;
    Ok(())
}

/// Redibuja el menu con el estado actual (desde cualquier hilo).
pub fn actualizar(app: &AppHandle, mandos: &[ResumenMando], pausado: bool, juego: Option<&str>) {
    let mandos = mandos.to_vec();
    let juego = juego.map(str::to_owned);
    let app2 = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(bandeja) = app2.tray_by_id(ID) else { return };
        match menu(&app2, &mandos, pausado, juego.as_deref()) {
            Ok(m) => {
                let _ = bandeja.set_menu(Some(m));
            }
            Err(e) => log::warn!("no se pudo actualizar la bandeja: {e}"),
        }
        let activos = mandos.iter().filter(|m| m.salida.activa).count();
        let consejo = if pausado {
            "Gamepad Mapper Plutón — en pausa".to_owned()
        } else {
            format!("Gamepad Mapper Plutón — {} mandos, {activos} virtuales", mandos.len())
        };
        let _ = bandeja.set_tooltip(Some(consejo));
    });
}
