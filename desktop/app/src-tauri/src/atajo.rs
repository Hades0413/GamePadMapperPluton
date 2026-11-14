//! Atajo de teclado global para pausar o reanudar todos los mandos virtuales (opcion «atajo de
//! pausa»). En Wayland puro los atajos globales dependen del compositor y pueden no funcionar.

use crate::bandeja;
use crate::estado::Compartido;
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// `Ctrl+Alt+P` de las opciones -> el formato del plugin (`Control+Alt+P`).
fn convertir(atajo: &str) -> String {
    atajo.split('+').map(|p| if p == "Ctrl" { "Control" } else { p }).collect::<Vec<_>>().join("+")
}

/// Cambia el atajo registrado (vacio = ninguno).
pub fn registrar(app: &AppHandle, estado: &Arc<Compartido>, atajo: &str) {
    let atajos = app.global_shortcut();
    if let Err(e) = atajos.unregister_all() {
        log::debug!("no se pudieron quitar los atajos: {e}");
    }
    if atajo.is_empty() {
        return;
    }
    let atajo_plugin: Shortcut = match convertir(atajo).parse() {
        Ok(a) => a,
        Err(e) => {
            log::warn!("atajo «{atajo}» no valido: {e}");
            return;
        }
    };
    let estado = Arc::clone(estado);
    let resultado = atajos.on_shortcut(atajo_plugin, move |app, _, evento| {
        if evento.state == ShortcutState::Pressed {
            bandeja::alternar_pausa(app, &estado);
        }
    });
    match resultado {
        Ok(()) => log::info!("atajo de pausa: {atajo}"),
        Err(e) => log::warn!("no se pudo registrar el atajo «{atajo}»: {e}"),
    }
}

#[cfg(test)]
mod pruebas {
    use super::convertir;

    #[test]
    fn formato_del_plugin() {
        assert_eq!(convertir("Ctrl+Alt+P"), "Control+Alt+P");
        assert!(convertir("Ctrl+Shift+F9").parse::<tauri_plugin_global_shortcut::Shortcut>().is_ok());
    }
}
