//! Comandos que llama la interfaz (`ui/src/backend/tauri.ts`). Los errores llegan como texto.

use crate::estado::{bloquear, Compartido};
use nucleo::asistente::VistaAsistente;
use nucleo::dispositivos::{IdMando, InfoMando};
use nucleo::mapeo::almacen::carpeta_config;
use nucleo::mapeo::basedatos::{fusionar, version_incluida, BaseDatosSdl};
use nucleo::mapeo::MapeoMando;
use nucleo::servicio::{EstadoMapeo, Instantanea};
use serde::Serialize;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::State;

type Estado<'a> = State<'a, Arc<Compartido>>;
type Resultado<T> = Result<T, String>;

// ---------------------------------------------------------------- base de datos SDL por capas

/// Ultima version oficial de la base (la descarga «Buscar actualizaciones»).
const URL_BASE: &str = "https://raw.githubusercontent.com/mdqinc/SDL_GameControllerDB/master/gamecontrollerdb.txt";
/// Limites de la descarga: tamano maximo y minimo de mandos para darla por buena.
const MAX_BYTES: u64 = 8 * 1024 * 1024;
const MIN_MANDOS: usize = 500;
/// Tamano maximo de lo que el usuario anade a mano (igual que MAX_ARCHIVO en la interfaz).
const MAX_ANADIR: usize = 4 * 1024 * 1024;

/// Capa 2: la base oficial descargada con «Buscar actualizaciones».
fn ruta_base_actualizada() -> Option<std::path::PathBuf> {
    carpeta_config().map(|d| d.join("gamecontrollerdb-actualizada.txt"))
}

/// Capa 3: los mandos que anade el usuario. Las versiones anteriores guardaban aqui
/// (gamecontrollerdb.txt) la base que se cargaba a mano: se conserva como mandos anadidos.
fn ruta_base_usuario() -> Option<std::path::PathBuf> {
    let dir = carpeta_config()?;
    let nueva = dir.join("gamecontrollerdb-usuario.txt");
    let antigua = dir.join("gamecontrollerdb.txt");
    if !nueva.exists() && antigua.exists() {
        let _ = std::fs::rename(&antigua, &nueva);
    }
    Some(nueva)
}

/// Base de datos completa: incluida + actualizada + la del usuario (cada capa manda sobre la anterior).
pub fn construir_base() -> BaseDatosSdl {
    let mut base = BaseDatosSdl::incluida();
    for ruta in [ruta_base_actualizada(), ruta_base_usuario()].into_iter().flatten().filter(|r| r.exists()) {
        match base.cargar_archivo(&ruta) {
            Ok(n) => log::info!("base de datos SDL: {n} entradas de {}", ruta.display()),
            Err(e) => log::warn!("no se pudo leer {}: {e}", ruta.display()),
        }
    }
    base
}

/// Escritura atomica (temporal + renombrar): nunca queda un archivo a medias.
fn escribir(ruta: &std::path::Path, contenido: &str) -> std::io::Result<()> {
    if let Some(dir) = ruta.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = ruta.with_extension("tmp");
    std::fs::write(&tmp, contenido)?;
    std::fs::rename(&tmp, ruta)
}

fn segundos_mtime(ruta: Option<std::path::PathBuf>) -> Option<u64> {
    let m = std::fs::metadata(ruta?).ok()?.modified().ok()?;
    m.duration_since(std::time::UNIX_EPOCH).ok().map(|d| d.as_secs())
}

fn lineas_validas(ruta: Option<std::path::PathBuf>) -> usize {
    ruta.and_then(|r| std::fs::read_to_string(r).ok()).map(|t| fusionar("", &t).1).unwrap_or(0)
}

fn texto<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Serialize)]
pub struct InfoApp {
    version: &'static str,
    carpeta_mapeos: Option<String>,
    entradas_base_datos: usize,
    /// Fecha de la base incluida en la app (AAAA-MM-DD).
    base_incluida: &'static str,
    /// Cuando se actualizo por ultima vez (segundos Unix), si se ha actualizado.
    base_actualizada: Option<u64>,
    /// Mandos anadidos por el usuario.
    mandos_anadidos: usize,
}

#[tauri::command]
pub fn info_app(estado: Estado) -> InfoApp {
    let s = estado.servicio();
    InfoApp {
        version: env!("CARGO_PKG_VERSION"),
        carpeta_mapeos: s.carpeta_mapeos().map(|p| p.display().to_string()),
        entradas_base_datos: s.entradas_base_datos(),
        base_incluida: version_incluida(),
        base_actualizada: segundos_mtime(ruta_base_actualizada()),
        mandos_anadidos: lineas_validas(ruta_base_usuario()),
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

/// Anade mandos nuevos (un gamecontrollerdb.txt o lineas sueltas) a los del usuario, sin borrar
/// los que ya habia. Devuelve cuantos se anadieron o actualizaron.
#[tauri::command]
pub fn anadir_mandos(estado: Estado, texto: String) -> Resultado<usize> {
    if texto.len() > MAX_ANADIR {
        return Err("El archivo es demasiado grande (máximo 4 MB).".into());
    }
    let ruta = ruta_base_usuario().ok_or("No se encuentra la carpeta de configuración.")?;
    let existente = std::fs::read_to_string(&ruta).unwrap_or_default();
    let (fusionado, aportadas) = fusionar(&existente, &texto);
    if aportadas == 0 {
        return Err("No hay ningún mando válido de Windows o Linux en ese texto.".into());
    }
    escribir(&ruta, &fusionado).map_err(self::texto)?;
    estado.servicio().reemplazar_base_datos(construir_base());
    Ok(aportadas)
}

#[derive(Serialize)]
pub struct Actualizacion {
    /// Mandos conocidos antes y despues de actualizar.
    antes: usize,
    despues: usize,
}

/// Descarga la ultima base oficial (HTTPS, con limites) y la guarda como capa «actualizada».
#[tauri::command]
pub async fn actualizar_base(estado: tauri::State<'_, Arc<Compartido>>) -> Resultado<Actualizacion> {
    let texto = tauri::async_runtime::spawn_blocking(descargar_base).await.map_err(self::texto)??;
    let (solo_app, mandos) = fusionar("", &texto);
    if mandos < MIN_MANDOS {
        return Err("La base descargada no parece válida; se mantiene la actual.".into());
    }
    let ruta = ruta_base_actualizada().ok_or("No se encuentra la carpeta de configuración.")?;
    escribir(&ruta, &solo_app).map_err(self::texto)?;
    let mut s = estado.servicio();
    let antes = s.entradas_base_datos();
    s.reemplazar_base_datos(construir_base());
    Ok(Actualizacion { antes, despues: s.entradas_base_datos() })
}

fn descargar_base() -> Resultado<String> {
    use std::io::Read;
    let respuesta = ureq::get(URL_BASE)
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|e| format!("No se pudo descargar la base de mandos: {e}"))?;
    let mut texto = String::new();
    respuesta
        .into_reader()
        .take(MAX_BYTES)
        .read_to_string(&mut texto)
        .map_err(|e| format!("No se pudo leer la base de mandos: {e}"))?;
    Ok(texto)
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
