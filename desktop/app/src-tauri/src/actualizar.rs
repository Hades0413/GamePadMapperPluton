//! Actualizaciones de la app con el plugin oficial de Tauri (paquetes firmados con minisign; la
//! clave publica esta en `tauri.conf.json`). Se consulta `latest.json` de la version
//! `escritorio-latest` de GitHub. Solo se puede actualizar sola la instalacion de Windows (NSIS o
//! MSI) y la AppImage de Linux; el `.deb` se actualiza descargando el paquete nuevo.
//! Todo se hace desde Rust: la interfaz no tiene permisos del plugin.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// Mismo texto que ERROR.sinActualizador en `ui/src/dominio/errores.ts`.
pub const SIN_ACTUALIZADOR: &str = "Las actualizaciones automáticas no están disponibles en esta instalación.";

#[derive(Debug, Clone, Serialize)]
pub struct InfoActualizacion {
    pub version: String,
    pub actual: String,
    pub notas: Option<String>,
    pub fecha: Option<String>,
}

fn admitida() -> bool {
    // En Linux solo la AppImage se puede sustituir (el .deb lo gestiona el sistema).
    !cfg!(target_os = "linux") || std::env::var_os("APPIMAGE").is_some()
}

/// ¿Hay una version nueva? `None` si ya es la ultima.
#[tauri::command]
pub async fn buscar_actualizacion(app: AppHandle) -> Result<Option<InfoActualizacion>, String> {
    if !admitida() {
        return Err(SIN_ACTUALIZADOR.into());
    }
    let actualizador = app.updater().map_err(|e| e.to_string())?;
    let nueva = actualizador.check().await.map_err(|e| e.to_string())?;
    Ok(nueva.map(|u| InfoActualizacion {
        version: u.version.clone(),
        actual: u.current_version.clone(),
        notas: u.body.clone(),
        fecha: u.date.map(|d| d.to_string()),
    }))
}

/// Descarga, comprueba la firma, instala y reinicia la app.
#[tauri::command]
pub async fn instalar_actualizacion(app: AppHandle) -> Result<(), String> {
    if !admitida() {
        return Err(SIN_ACTUALIZADOR.into());
    }
    let actualizador = app.updater().map_err(|e| e.to_string())?;
    let Some(nueva) = actualizador.check().await.map_err(|e| e.to_string())? else {
        return Ok(());
    };
    log::info!("instalando la version {}", nueva.version);
    nueva.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart();
}
