//! Comandos que llama la interfaz (`ui/src/backend/tauri.ts`). Los errores llegan como texto.

use crate::estado::{bloquear, Compartido};
use nucleo::asistente::VistaAsistente;
use nucleo::dispositivos::{IdMando, InfoMando};
use nucleo::juegos::{Juego, Ventana};
use nucleo::mapeo::acciones::PasoMacro;
use nucleo::mapeo::almacen::carpeta_config;
use nucleo::mapeo::basedatos::{fusionar, version_incluida, BaseDatosSdl};
use nucleo::mapeo::validar::{ErrorValidacion, MAX_BYTES_PRESET};
use nucleo::mapeo::MapeoMando;
use nucleo::opciones::Opciones;
use nucleo::salida::Disponibilidad;
use nucleo::servicio::{EstadoMapeo, Instantanea, VistaSalida};
use serde::Serialize;
use std::sync::atomic::Ordering;
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
/// Mandos que envia la comunidad en la web y aprueba la moderacion (solo lectura publica, la misma
/// clave publica que usa la web; la tabla solo deja ver los aprobados).
const URL_COMUNIDAD: &str = "https://gshyhrthaksriamjqdtf.supabase.co/rest/v1/controller_mappings";
const CLAVE_PUBLICA: &str = "sb_publishable_QTPm_6jVyWGcvWILpDqJoA_skWLqjeD";
const MAX_BYTES_COMUNIDAD: u64 = 4 * 1024 * 1024;

/// Tamano maximo de lo que el usuario anade a mano (igual que MAX_ARCHIVO en la interfaz).
const MAX_ANADIR: usize = 4 * 1024 * 1024;

/// Capa 2: la base oficial descargada con «Buscar actualizaciones».
fn ruta_base_actualizada() -> Option<std::path::PathBuf> {
    carpeta_config().map(|d| d.join("gamecontrollerdb-actualizada.txt"))
}

/// Capa 3: los mandos aprobados de la comunidad (los descarga «Buscar actualizaciones»).
fn ruta_base_comunidad() -> Option<std::path::PathBuf> {
    carpeta_config().map(|d| d.join("gamecontrollerdb-comunidad.txt"))
}

/// Capa 4: los mandos que anade el usuario. Las versiones anteriores guardaban aqui
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

/// Base de datos completa: incluida < actualizada < comunidad < del usuario (cada capa manda
/// sobre la anterior para el mismo mando).
pub fn construir_base() -> BaseDatosSdl {
    let mut base = BaseDatosSdl::incluida();
    let capas = [ruta_base_actualizada(), ruta_base_comunidad(), ruta_base_usuario()];
    for ruta in capas.into_iter().flatten().filter(|r| r.exists()) {
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
    /// Sistema: «linux» o «windows» (para los textos de ayuda).
    plataforma: &'static str,
    /// Mandos virtuales en pausa.
    pausado: bool,
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
        plataforma: if cfg!(windows) { "windows" } else { "linux" },
        pausado: s.pausado(),
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

/// Pagina de la web para enviar un mando a la comunidad (la moderacion lo revisa antes de publicarlo).
const URL_ENVIAR_MANDO: &str = "https://hades0413.github.io/GamePadMapperPluton/mandos#linea=";

/// Abre en el navegador la pagina de envio con el mapeo de este mando ya rellenado. La direccion
/// se construye aqui (base fija + linea SDL codificada): la interfaz no puede abrir otra.
#[tauri::command]
pub fn enviar_a_comunidad(app: tauri::AppHandle, estado: Estado, id: IdMando) -> Resultado<()> {
    use tauri_plugin_opener::OpenerExt;
    let linea = estado.servicio().exportar_sdl(id).map_err(texto)?;
    let url = format!("{URL_ENVIAR_MANDO}{}", codificar_url(&linea));
    app.opener().open_url(url, None::<&str>).map_err(texto)
}

/// Codificacion de URL (RFC 3986): solo se dejan tal cual los caracteres no reservados.
fn codificar_url(texto: &str) -> String {
    let mut salida = String::with_capacity(texto.len() * 3);
    for b in texto.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            salida.push(b as char);
        } else {
            salida.push_str(&format!("%{b:02X}"));
        }
    }
    salida
}

#[cfg(test)]
mod pruebas {
    use super::codificar_url;

    #[test]
    fn codifica_la_linea_sdl_sin_romper_la_url() {
        assert_eq!(
            codificar_url("0300,Mi Mando,a:b0,platform:Linux,"),
            "0300%2CMi%20Mando%2Ca%3Ab0%2Cplatform%3ALinux%2C"
        );
        assert_eq!(codificar_url("ñ#<>"), "%C3%B1%23%3C%3E");
    }
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
    /// Mandos aprobados de la comunidad descargados (None si no se pudo consultar).
    comunidad: Option<usize>,
}

/// Descarga la ultima base oficial (HTTPS, con limites) y la guarda como capa «actualizada».
#[tauri::command]
pub async fn actualizar_base(estado: tauri::State<'_, Arc<Compartido>>) -> Resultado<Actualizacion> {
    let (oficial, comunidad) = tauri::async_runtime::spawn_blocking(|| (descargar_base(), descargar_comunidad()))
        .await
        .map_err(self::texto)?;
    let (solo_app, mandos) = fusionar("", &oficial?);
    if mandos < MIN_MANDOS {
        return Err("La base descargada no parece válida; se mantiene la actual.".into());
    }
    let ruta = ruta_base_actualizada().ok_or("No se encuentra la carpeta de configuración.")?;
    escribir(&ruta, &solo_app).map_err(self::texto)?;
    // La comunidad es un extra: si no responde, se conserva lo que ya habia descargado.
    let aprobados = match comunidad {
        Ok(texto) => {
            let (lineas, n) = fusionar("", &texto);
            if let Some(r) = ruta_base_comunidad() {
                escribir(&r, &lineas).map_err(self::texto)?;
            }
            Some(n)
        }
        Err(e) => {
            log::warn!("{e}");
            None
        }
    };
    let mut s = estado.servicio();
    let antes = s.entradas_base_datos();
    s.reemplazar_base_datos(construir_base());
    Ok(Actualizacion { antes, despues: s.entradas_base_datos(), comunidad: aprobados })
}

/// Mandos aprobados de la comunidad para este sistema, una linea SDL por mando. La base de datos
/// ya los valida y normaliza al enviarlos; aqui `fusionar` los vuelve a filtrar igualmente.
fn descargar_comunidad() -> Resultado<String> {
    use std::io::Read;
    #[derive(serde::Deserialize)]
    struct Fila {
        mapping: String,
    }
    // Supabase devuelve como mucho 100 filas por peticion: se pide por paginas (orden fijo por
    // id) hasta que una venga incompleta, con un tope de paginas y de bytes en total.
    const POR_PAGINA: usize = 100;
    const MAX_PAGINAS: usize = 200;
    let plataforma = if cfg!(windows) { "Windows" } else { "Linux" };
    let mut lineas = Vec::new();
    let mut leidos: u64 = 0;
    for pagina in 0..MAX_PAGINAS {
        let respuesta = ureq::get(URL_COMUNIDAD)
            .query("select", "mapping")
            .query("status", "eq.approved")
            .query("platform", &format!("eq.{plataforma}"))
            .query("order", "id")
            .query("limit", &POR_PAGINA.to_string())
            .query("offset", &(pagina * POR_PAGINA).to_string())
            .set("apikey", CLAVE_PUBLICA)
            .timeout(std::time::Duration::from_secs(15))
            .call()
            .map_err(|e| format!("No se pudieron consultar los mandos de la comunidad: {e}"))?;
        let mut json = String::new();
        respuesta
            .into_reader()
            .take(MAX_BYTES_COMUNIDAD.saturating_sub(leidos))
            .read_to_string(&mut json)
            .map_err(|e| format!("No se pudieron leer los mandos de la comunidad: {e}"))?;
        leidos += json.len() as u64;
        let filas: Vec<Fila> =
            serde_json::from_str(&json).map_err(|e| format!("Respuesta no válida de la comunidad: {e}"))?;
        let completa = filas.len() == POR_PAGINA;
        lineas.extend(filas.into_iter().map(|f| f.mapping));
        if !completa || leidos >= MAX_BYTES_COMUNIDAD {
            break;
        }
    }
    Ok(lineas.join("\n"))
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

// ---------------------------------------------------------------- mandos virtuales y configuracion

#[tauri::command]
pub fn disponibilidad_salidas(estado: Estado) -> Vec<Disponibilidad> {
    estado.servicio().disponibilidad()
}

/// Pausa (true) o reanuda (false) todos los mandos virtuales. Devuelve el estado nuevo.
#[tauri::command]
pub fn pausar(app: tauri::AppHandle, estado: Estado, pausado: bool) -> bool {
    estado.servicio().pausar(pausado);
    estado.bandeja_sucia.store(true, Ordering::Release);
    let _ = tauri::Emitter::emit(&app, "pausa-cambiada", pausado);
    pausado
}

#[tauri::command]
pub fn reintentar_salida(estado: Estado, id: IdMando) -> Resultado<VistaSalida> {
    estado.servicio().reintentar_salida(id).map_err(texto)
}

#[tauri::command]
pub fn grabar_macro_iniciar(estado: Estado, id: IdMando) -> Resultado<()> {
    estado.servicio().grabar_macro_iniciar(id).map_err(texto)
}

#[tauri::command]
pub fn grabar_macro_terminar(estado: Estado, id: IdMando) -> Resultado<Vec<PasoMacro>> {
    estado.servicio().grabar_macro_terminar(id).map_err(texto)
}

#[tauri::command]
pub fn exportar_config(estado: Estado, id: IdMando) -> Resultado<String> {
    estado.servicio().exportar_config(id).map_err(texto)
}

/// Aplica un preset (JSON) al mando. El tamano se limita antes de leerlo (1 MB).
#[tauri::command]
pub fn importar_config(estado: Estado, id: IdMando, texto: String) -> Resultado<EstadoMapeo> {
    if texto.len() > MAX_BYTES_PRESET {
        return Err(ErrorValidacion::Grande.to_string());
    }
    estado.servicio().importar_config(id, &texto).map_err(self::texto)
}

#[tauri::command]
pub fn probar_motores(estado: Estado, id: IdMando, fuerte: f32, debil: f32) -> Resultado<()> {
    if !fuerte.is_finite() || !debil.is_finite() {
        return Err(ErrorValidacion::Indice.to_string());
    }
    estado.servicio().probar_motores(id, fuerte, debil).map_err(texto)
}

// ---------------------------------------------------------------- juegos

#[tauri::command]
pub fn listar_juegos(estado: Estado) -> Vec<Juego> {
    estado.servicio().juegos().to_vec()
}

#[derive(Serialize)]
pub struct JuegoActivo {
    id: String,
    nombre: String,
}

#[tauri::command]
pub fn juego_activo(estado: Estado) -> Option<JuegoActivo> {
    estado.servicio().juego_activo().map(|(id, nombre)| JuegoActivo { id, nombre })
}

#[tauri::command]
pub fn guardar_juego(estado: Estado, juego: Juego) -> Resultado<Vec<Juego>> {
    estado.servicio().guardar_juego(juego).map_err(texto)
}

#[tauri::command]
pub fn borrar_juego(estado: Estado, juego: String) -> Resultado<Vec<Juego>> {
    estado.servicio().borrar_juego(&juego).map_err(texto)
}

#[tauri::command]
pub fn copiar_a_juego(estado: Estado, juego: String, id: IdMando) -> Resultado<Vec<Juego>> {
    estado.servicio().copiar_a_juego(&juego, id).map_err(texto)
}

#[tauri::command]
pub fn quitar_de_juego(estado: Estado, juego: String, guid: String) -> Resultado<Vec<Juego>> {
    estado.servicio().quitar_de_juego(&juego, &guid).map_err(texto)
}

/// Ventana con el foco ahora (para anadir un juego desde la ventana activa).
#[tauri::command]
pub async fn ventana_activa() -> Option<Ventana> {
    tauri::async_runtime::spawn_blocking(nucleo::foco::ventana_activa).await.ok().flatten()
}

// ---------------------------------------------------------------- opciones

#[derive(Serialize)]
pub struct OpcionesApp {
    #[serde(flatten)]
    opciones: Opciones,
    /// Donde se guarda el registro si se activa.
    ruta_registro: Option<String>,
}

fn con_extras(mut o: Opciones) -> OpcionesApp {
    // Lo que manda es el sistema (el usuario puede haber quitado la entrada a mano).
    o.iniciar_con_sistema = nucleo::sistema::autoarranque_activo();
    OpcionesApp { opciones: o, ruta_registro: crate::registro::ruta_archivo().map(|p| p.display().to_string()) }
}

#[tauri::command]
pub fn obtener_opciones(estado: Estado) -> OpcionesApp {
    con_extras(estado.opciones())
}

/// Guarda las opciones y las aplica (inicio con el sistema, atajo, registro).
#[tauri::command]
pub fn guardar_opciones(app: tauri::AppHandle, estado: Estado, opciones: Opciones) -> Resultado<OpcionesApp> {
    opciones.validar().map_err(texto)?;
    let antes = estado.opciones();
    if opciones.iniciar_con_sistema != nucleo::sistema::autoarranque_activo() {
        nucleo::sistema::poner_autoarranque(opciones.iniciar_con_sistema).map_err(texto)?;
    }
    if opciones.atajo_pausa != antes.atajo_pausa {
        crate::atajo::registrar(&app, &estado, &opciones.atajo_pausa);
    }
    crate::registro::en_archivo(opciones.registro);
    opciones.guardar().map_err(texto)?;
    *bloquear(&estado.opciones) = opciones.clone();
    Ok(con_extras(opciones))
}

#[tauri::command]
pub fn leer_registro() -> Vec<String> {
    crate::registro::ultimas()
}

/// Enlaces que la interfaz puede abrir: solo estos (la direccion nunca viene de la interfaz).
#[tauri::command]
pub fn abrir_enlace(app: tauri::AppHandle, cual: String) -> Resultado<()> {
    use tauri_plugin_opener::OpenerExt;
    let url = match cual.as_str() {
        "vigembus" => "https://github.com/nefarius/ViGEmBus/releases",
        "vigemclient" => "https://github.com/nefarius/ViGEmClient",
        "web" => "https://hades0413.github.io/GamePadMapperPluton/",
        "repositorio" => "https://github.com/Hades0413/GamePadMapperPluton",
        "versiones" => "https://github.com/Hades0413/GamePadMapperPluton/releases/tag/escritorio-latest",
        "licencia" => "https://polyformproject.org/licenses/noncommercial/1.0.0/",
        _ => return Err(ErrorValidacion::Nombre.to_string()),
    };
    app.opener().open_url(url, None::<&str>).map_err(texto)
}
