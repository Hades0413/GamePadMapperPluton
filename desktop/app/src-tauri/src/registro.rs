//! Registro: a stderr siempre, las ultimas lineas en memoria (para verlas en «Opciones») y, si se
//! activa la opcion, a `<carpeta de configuracion>/registro.log` (1 MB como mucho; al llenarse se
//! guarda como `registro.log.1`). Variable `GPM_LOG`: error, warn, info (por defecto), debug.

use std::collections::VecDeque;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

const LINEAS_EN_MEMORIA: usize = 300;
const MAX_ARCHIVO: u64 = 1024 * 1024;

struct Interno {
    lineas: VecDeque<String>,
    archivo: Option<(PathBuf, File, u64)>,
}

static INTERNO: Mutex<Interno> = Mutex::new(Interno { lineas: VecDeque::new(), archivo: None });

fn bloquear() -> std::sync::MutexGuard<'static, Interno> {
    INTERNO.lock().unwrap_or_else(|e| e.into_inner())
}

struct Registro;

impl log::Log for Registro {
    fn enabled(&self, m: &log::Metadata) -> bool {
        m.level() <= log::max_level()
    }

    fn log(&self, r: &log::Record) {
        let nuestro = r.target().starts_with("nucleo") || r.target().starts_with("gamepad_mapper_pluton");
        if !nuestro || !self.enabled(r.metadata()) {
            return;
        }
        let segundos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let (h, m, s) = ((segundos / 3600) % 24, (segundos / 60) % 60, segundos % 60);
        let linea = format!("{h:02}:{m:02}:{s:02} UTC [{}] {}", r.level(), r.args());
        eprintln!("{linea}");
        let mut i = bloquear();
        if i.lineas.len() >= LINEAS_EN_MEMORIA {
            i.lineas.pop_front();
        }
        i.lineas.push_back(linea.clone());
        let mut rotar = None;
        if let Some((ruta, archivo, escrito)) = i.archivo.as_mut() {
            if writeln!(archivo, "{linea}").is_ok() {
                *escrito += linea.len() as u64 + 1;
            }
            if *escrito > MAX_ARCHIVO {
                rotar = Some(ruta.clone());
            }
        }
        if let Some(ruta) = rotar {
            i.archivo = None;
            let _ = std::fs::rename(&ruta, ruta.with_extension("log.1"));
            i.archivo = File::create(&ruta).ok().map(|f| (ruta, f, 0));
        }
    }

    fn flush(&self) {
        if let Some((_, f, _)) = bloquear().archivo.as_mut() {
            let _ = f.flush();
        }
    }
}

pub fn iniciar() {
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

/// Activa o desactiva el registro en archivo.
pub fn en_archivo(activar: bool) {
    let mut i = bloquear();
    if !activar {
        i.archivo = None;
        return;
    }
    if i.archivo.is_some() {
        return;
    }
    let Some(ruta) = nucleo::mapeo::almacen::carpeta_config().map(|d| d.join("registro.log")) else { return };
    if let Some(dir) = ruta.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let abierto = std::fs::OpenOptions::new().create(true).append(true).open(&ruta);
    if let Ok(f) = abierto {
        let escrito = f.metadata().map(|m| m.len()).unwrap_or(0);
        i.archivo = Some((ruta, f, escrito));
    }
}

/// Ruta del archivo de registro (aunque no este activo).
pub fn ruta_archivo() -> Option<PathBuf> {
    nucleo::mapeo::almacen::carpeta_config().map(|d| d.join("registro.log"))
}

/// Ultimas lineas (la mas reciente al final).
pub fn ultimas() -> Vec<String> {
    bloquear().lineas.iter().cloned().collect()
}
