//! Juego Android en primer plano (Waydroid o un emulador conectado por adb), para cambiar solo al
//! perfil de toques de ese juego.
//!
//! - `adb devices -l` -> dispositivos ([`leer_dispositivos`]).
//! - `adb -s SERIE shell dumpsys activity activities` -> la primera linea con `ResumedActivity`
//!   (`mResumedActivity`, `topResumedActivity`...) y, si no la hay, `dumpsys window` ->
//!   `mCurrentFocus` ([`paquete_actividad`], [`paquete_ventana`]).
//!
//! Seguridad: `adb` se busca por ruta absoluta (PATH y carpetas de platform-tools), se lanza con
//! `std::process::Command` y argumentos fijos (sin shell en el PC; en el dispositivo la orden es
//! una constante), la serie se valida antes de pasarla, la salida tiene un tope de tamano y cada
//! orden un tiempo maximo. El paquete se acepta solo si tiene la forma de un paquete de Android.

use super::perfiles::paquete_valido;
use serde::Serialize;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const MAX_SALIDA: usize = 4 * 1024 * 1024;
const LIMITE_DISPOSITIVOS: Duration = Duration::from_secs(8);
const LIMITE_DUMPSYS: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ErrorAdb {
    #[error("No se encontró adb (Android platform-tools): instálalo para detectar el juego.")]
    SinAdb,
    #[error("adb no respondió a tiempo.")]
    Tiempo,
    #[error("adb falló al consultar el dispositivo.")]
    Fallo,
    #[error("No hay ningún dispositivo Android conectado por adb.")]
    SinDispositivo,
}

/// Un dispositivo de `adb devices -l`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DispositivoAdb {
    pub serie: String,
    /// device, unauthorized, offline...
    pub estado: String,
    pub modelo: Option<String>,
}

/// Serie de adb (`emulator-5554`, `192.168.240.112:5555`, `R58M12345AB`).
pub fn serie_valida(s: &str) -> bool {
    (1..=64).contains(&s.len())
        && s.as_bytes()[0].is_ascii_alphanumeric()
        && s.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b':' | b'_' | b'-'))
}

/// Lee la salida de `adb devices -l`.
pub fn leer_dispositivos(salida: &str) -> Vec<DispositivoAdb> {
    let mut lista = Vec::new();
    for linea in salida.lines() {
        let mut partes = linea.split_whitespace();
        let (Some(serie), Some(estado)) = (partes.next(), partes.next()) else { continue };
        if !serie_valida(serie) || !estado.bytes().all(|b| b.is_ascii_lowercase()) || linea.starts_with("List ") {
            continue;
        }
        let modelo = partes
            .find_map(|p| p.strip_prefix("model:"))
            .map(|m| m.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').take(64).collect());
        lista.push(DispositivoAdb { serie: serie.to_owned(), estado: estado.to_owned(), modelo });
        if lista.len() >= 32 {
            break;
        }
    }
    lista
}

/// Primer `paquete/actividad` de una linea que sea un paquete valido.
fn paquete_en(linea: &str) -> Option<String> {
    linea.split(|c: char| c.is_whitespace() || c == '{' || c == '}').find_map(|t| {
        let (p, _) = t.split_once('/')?;
        paquete_valido(p).then(|| p.to_owned())
    })
}

/// Paquete de la actividad en primer plano (`dumpsys activity activities`).
pub fn paquete_actividad(salida: &str) -> Option<String> {
    salida.lines().find(|l| l.contains("ResumedActivity")).and_then(paquete_en)
}

/// Paquete de la ventana con el foco (`dumpsys window`).
pub fn paquete_ventana(salida: &str) -> Option<String> {
    salida.lines().find(|l| l.contains("mCurrentFocus=")).and_then(paquete_en)
}

/// Busca `adb` en el PATH y en las carpetas habituales de Android platform-tools.
pub fn buscar_adb() -> Option<PathBuf> {
    let nombre = if cfg!(windows) { "adb.exe" } else { "adb" };
    let mut carpetas: Vec<PathBuf> =
        std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    for var in ["ANDROID_HOME", "ANDROID_SDK_ROOT"] {
        if let Some(d) = std::env::var_os(var) {
            carpetas.push(PathBuf::from(d).join("platform-tools"));
        }
    }
    if cfg!(windows) {
        if let Some(d) = std::env::var_os("LOCALAPPDATA") {
            carpetas.push(PathBuf::from(d).join("Android").join("Sdk").join("platform-tools"));
        }
    } else if let Some(h) = std::env::var_os("HOME") {
        carpetas.push(PathBuf::from(h).join("Android").join("Sdk").join("platform-tools"));
    }
    // Solo rutas absolutas: nunca un adb del directorio actual.
    carpetas.into_iter().filter(|d| d.is_absolute()).map(|d| d.join(nombre)).find(|p| p.is_file())
}

/// Lanza adb con argumentos fijos, con tiempo maximo y tope de salida.
fn ejecutar(adb: &Path, args: &[&str], limite: Duration) -> Result<String, ErrorAdb> {
    let mut orden = Command::new(adb);
    orden.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        orden.creation_flags(CREATE_NO_WINDOW);
    }
    let mut hijo = orden.spawn().map_err(|_| ErrorAdb::SinAdb)?;
    let Some(mut salida) = hijo.stdout.take() else {
        let _ = hijo.kill();
        let _ = hijo.wait();
        return Err(ErrorAdb::Fallo);
    };
    let lector = std::thread::spawn(move || {
        let mut datos = Vec::new();
        let _ = (&mut salida).take(MAX_SALIDA as u64).read_to_end(&mut datos);
        // Lo que sobre se descarta para que adb pueda terminar.
        let _ = std::io::copy(&mut salida, &mut std::io::sink());
        datos
    });
    let inicio = Instant::now();
    let estado = loop {
        match hijo.try_wait() {
            Ok(Some(e)) => break Some(e),
            Ok(None) if inicio.elapsed() < limite => std::thread::sleep(Duration::from_millis(20)),
            _ => break None,
        }
    };
    let Some(estado) = estado else {
        let _ = hijo.kill();
        let _ = hijo.wait();
        let _ = lector.join();
        return Err(ErrorAdb::Tiempo);
    };
    let datos = lector.join().map_err(|_| ErrorAdb::Fallo)?;
    if !estado.success() {
        return Err(ErrorAdb::Fallo);
    }
    Ok(String::from_utf8_lossy(&datos).into_owned())
}

/// Dispositivos conectados por adb.
pub fn dispositivos(adb: &Path) -> Result<Vec<DispositivoAdb>, ErrorAdb> {
    ejecutar(adb, &["devices", "-l"], LIMITE_DISPOSITIVOS).map(|s| leer_dispositivos(&s))
}

/// Resultado de una consulta: el dispositivo usado y el paquete en primer plano (si se sabe).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Deteccion {
    pub dispositivo: DispositivoAdb,
    pub paquete: Option<String>,
}

/// Juego en primer plano del dispositivo `preferido` (o del primero listo).
pub fn detectar(adb: &Path, preferido: Option<&str>) -> Result<Deteccion, ErrorAdb> {
    let lista = dispositivos(adb)?;
    let listos = || lista.iter().filter(|d| d.estado == "device");
    let dispositivo = preferido
        .and_then(|p| listos().find(|d| d.serie == p))
        .or_else(|| listos().next())
        .cloned()
        .ok_or(ErrorAdb::SinDispositivo)?;
    let serie = dispositivo.serie.as_str();
    if !serie_valida(serie) {
        return Err(ErrorAdb::SinDispositivo);
    }
    let mut paquete = ejecutar(adb, &["-s", serie, "shell", "dumpsys", "activity", "activities"], LIMITE_DUMPSYS)
        .ok()
        .and_then(|s| paquete_actividad(&s));
    if paquete.is_none() {
        let s = ejecutar(adb, &["-s", serie, "shell", "dumpsys", "window"], LIMITE_DUMPSYS)?;
        paquete = paquete_ventana(&s);
    }
    Ok(Deteccion { dispositivo, paquete })
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Muestras de dispositivos de verdad (recortadas).
    const DEVICES: &str = "* daemon not running; starting now at tcp:5037\n* daemon started successfully\n\
        List of devices attached\n\
        emulator-5554          device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emu64xa transport_id:1\n\
        192.168.240.112:5555   device product:lineage_waydroid_x86_64 model:WayDroid_x86_64_Device device:waydroid_x86_64 transport_id:2\n\
        R58M12345AB            unauthorized usb:1-1 transport_id:3\n\
        bad;serie              device\n\n";

    /// Android 11 (emulador).
    const ACTIVIDAD_11: &str = "ACTIVITY MANAGER ACTIVITIES (dumpsys activity activities)\n\
        Display #0 (activities from top to bottom):\n  * Task{3c0e0b4 #23 visible=true type=standard A=10154:com.supercell.clashroyale U=0 StackId=23 sz=1}\n\
        \x20     * Hist #0: ActivityRecord{c3d1f2a u0 com.supercell.clashroyale/com.supercell.titan.GameApp t23}\n\
        \x20 mResumedActivity: ActivityRecord{c3d1f2a u0 com.supercell.clashroyale/com.supercell.titan.GameApp t23}\n\
        \x20 mLastPausedActivity: ActivityRecord{1b0d5ad u0 com.android.launcher3/.uioverrides.QuickstepLauncher t9}\n";

    /// Android 13 (Waydroid): sin mResumedActivity, con topResumedActivity.
    const ACTIVIDAD_13: &str = "Display #0 (activities from top to bottom):\n\
        \x20 * Task{b1e8 #31 type=standard A=10110:com.mojang.minecraftpe U=0 visible=true mode=fullscreen}\n\
        \x20   topResumedActivity=ActivityRecord{55a1c3e u0 com.mojang.minecraftpe/.MainActivity t31}\n\
        \x20 ResumedActivity: ActivityRecord{55a1c3e u0 com.mojang.minecraftpe/.MainActivity t31}\n";

    const VENTANA: &str = "WINDOW MANAGER WINDOWS (dumpsys window windows)\n\
        \x20 mCurrentFocus=Window{7d9b6e3 u0 org.ppsspp.ppsspp/org.ppsspp.ppsspp.PpssppActivity}\n\
        \x20 mFocusedApp=ActivityRecord{2a1 u0 org.ppsspp.ppsspp/.PpssppActivity t40}\n";

    #[test]
    fn dispositivos_de_adb() {
        let l = leer_dispositivos(DEVICES);
        assert_eq!(l.len(), 3);
        assert_eq!(l[0].serie, "emulator-5554");
        assert_eq!(l[1].modelo.as_deref(), Some("WayDroid_x86_64_Device"));
        assert_eq!(
            (l[2].serie.as_str(), l[2].estado.as_str(), l[2].modelo.as_deref()),
            ("R58M12345AB", "unauthorized", None)
        );
        assert!(leer_dispositivos("").is_empty());
    }

    #[test]
    fn juego_en_primer_plano() {
        assert_eq!(paquete_actividad(ACTIVIDAD_11).as_deref(), Some("com.supercell.clashroyale"));
        assert_eq!(paquete_actividad(ACTIVIDAD_13).as_deref(), Some("com.mojang.minecraftpe"));
        assert_eq!(paquete_ventana(VENTANA).as_deref(), Some("org.ppsspp.ppsspp"));
        // Sin foco o con ventanas del sistema: nada.
        assert_eq!(paquete_ventana("  mCurrentFocus=null\n"), None);
        assert_eq!(paquete_ventana("  mCurrentFocus=Window{1 u0 StatusBar}\n"), None);
        assert_eq!(paquete_actividad("nada que ver"), None);
        // Algo que no es un paquete no pasa (aunque tenga '/').
        assert_eq!(paquete_actividad("  mResumedActivity: ActivityRecord{1 u0 ../../x/y t1}\n"), None);
        assert_eq!(paquete_actividad("  mResumedActivity: ActivityRecord{1 u0 com.a;reboot/.M t1}\n"), None);
    }

    #[test]
    fn series_validas() {
        for s in ["emulator-5554", "192.168.240.112:5555", "R58M12345AB", "localhost:5555"] {
            assert!(serie_valida(s), "{s}");
        }
        for s in ["", "a b", "x;rm -rf", "-s", "$(id)", &"a".repeat(65)] {
            assert!(!serie_valida(s), "{s}");
        }
    }

    #[test]
    fn adb_que_no_existe() {
        assert_eq!(dispositivos(Path::new("/no/existe/adb")), Err(ErrorAdb::SinAdb));
    }
}
