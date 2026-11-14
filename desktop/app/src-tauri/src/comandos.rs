//! Comandos que llama la interfaz (`ui/src/backend/tauri.ts`). Los errores llegan como texto.

use crate::estado::{bloquear, Compartido};
use nucleo::asistente::VistaAsistente;
use nucleo::dispositivos::{IdMando, InfoMando};
use nucleo::mapeo::almacen::carpeta_config;
use nucleo::mapeo::MapeoMando;
use nucleo::servicio::{EstadoMapeo, Instantanea};
use serde::Serialize;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::State;

type Estado<'a> = State<'a, Arc<Compartido>>;
type Resultado<T> = Result<T, String>;

/// Archivo donde se recuerda la base de datos SDL completa que cargue el usuario.
pub fn ruta_base_datos() -> Option<std::path::PathBuf> {
    carpeta_config().map(|d| d.join("gamecontrollerdb.txt"))
}

fn texto<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Serialize)]
pub struct InfoApp {
    version: &'static str,
    carpeta_mapeos: Option<String>,
    entradas_base_datos: usize,
}

#[tauri::command]
pub fn info_app(estado: Estado) -> InfoApp {
    let s = estado.servicio();
    InfoApp {
        version: env!("CARGO_PKG_VERSION"),
        carpeta_mapeos: s.carpeta_mapeos().map(|p| p.display().to_string()),
        entradas_base_datos: s.entradas_base_datos(),
    }
}

#[tauri::command]
pub fn listar_mandos(estado: Estado) -> Vec<InfoMando> {
    estado.servicio().mandos()
}

#[tauri::command]
pub fn suscribir_entrada(estado: Estado, id: IdMando, canal: Channel<Instantanea>) {
    *bloquear(&estado.suscripcion) = Some((id, canal));
}

#[tauri::command]
/// Cancela por canal (no por mando): asi una suscripcion nueva al mismo mando no se pierde si la
/// cancelacion de la anterior llega despues.
pub fn cancelar_suscripcion(estado: Estado, canal: u32) {
    let mut s = bloquear(&estado.suscripcion);
    if s.as_ref().is_some_and(|(_, actual)| actual.id() == canal) {
        *s = None;
    }
}

#[tauri::command]
pub fn obtener_mapeo(estado: Estado, id: IdMando) -> Resultado<EstadoMapeo> {
    estado.servicio().mapeo(id).map_err(texto)
}

#[tauri::command]
pub fn editar_mapeo(estado: Estado, id: IdMando, mapeo: MapeoMando) -> Resultado<EstadoMapeo> {
    estado.servicio().editar_mapeo(id, mapeo).map_err(texto)
}

#[derive(Serialize)]
pub struct Guardado {
    estado: EstadoMapeo,
    ruta: String,
}

#[tauri::command]
pub fn guardar_mapeo(estado: Estado, id: IdMando) -> Resultado<Guardado> {
    let (estado, ruta) = estado.servicio().guardar(id).map_err(texto)?;
    Ok(Guardado { estado, ruta: ruta.display().to_string() })
}

#[tauri::command]
pub fn restablecer_mapeo(estado: Estado, id: IdMando) -> Resultado<EstadoMapeo> {
    estado.servicio().restablecer(id).map_err(texto)
}

#[tauri::command]
pub fn auto_mapear(estado: Estado, id: IdMando) -> Resultado<EstadoMapeo> {
    estado.servicio().auto_mapear(id).map_err(texto)
}

#[tauri::command]
pub fn exportar_sdl(estado: Estado, id: IdMando) -> Resultado<String> {
    estado.servicio().exportar_sdl(id).map_err(texto)
}

#[tauri::command]
pub fn importar_sdl(estado: Estado, id: IdMando, linea: String) -> Resultado<EstadoMapeo> {
    estado.servicio().importar_sdl(id, &linea).map_err(texto)
}

/// Anade el texto de un gamecontrollerdb.txt y lo guarda para los siguientes arranques.
#[tauri::command]
pub fn cargar_base_datos(estado: Estado, texto: String) -> Resultado<usize> {
    let n = estado.servicio().anadir_base_datos(&texto);
    if n > 0 {
        if let Some(ruta) = ruta_base_datos() {
            if let Some(dir) = ruta.parent() {
                std::fs::create_dir_all(dir).map_err(self::texto)?;
            }
            std::fs::write(&ruta, &texto).map_err(self::texto)?;
        }
    }
    Ok(n)
}

#[tauri::command]
pub fn probar_vibracion(estado: Estado, id: IdMando) -> Resultado<()> {
    estado.servicio().probar_vibracion(id).map_err(texto)
}

#[tauri::command]
pub fn asistente_iniciar(estado: Estado, id: IdMando) -> Resultado<VistaAsistente> {
    estado.servicio().asistente_iniciar(id).map_err(texto)
}

#[tauri::command]
pub fn asistente_saltar(estado: Estado, id: IdMando) -> Resultado<VistaAsistente> {
    estado.servicio().asistente_saltar(id).map_err(texto)
}

#[tauri::command]
pub fn asistente_atras(estado: Estado, id: IdMando) -> Resultado<VistaAsistente> {
    estado.servicio().asistente_atras(id).map_err(texto)
}

#[tauri::command]
pub fn asistente_cancelar(estado: Estado, id: IdMando) -> Resultado<()> {
    estado.servicio().asistente_cancelar(id).map_err(texto)
}

#[tauri::command]
pub fn asistente_aplicar(estado: Estado, id: IdMando) -> Resultado<EstadoMapeo> {
    estado.servicio().asistente_aplicar(id).map_err(texto)
}
