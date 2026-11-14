//! Arrancar con el sistema.
//!
//! - Linux: `~/.config/autostart/gamepad-mapper-pluton.desktop` (XDG autostart). Si la app corre
//!   como AppImage, se apunta al archivo AppImage (`$APPIMAGE`), no al montaje temporal.
//! - Windows: valor `GamepadMapperPluton` en `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
//!
//! La app se arranca con `--minimizado` (directamente en la bandeja).

use std::io;
use std::path::{Path, PathBuf};

pub const ARGUMENTO_MINIMIZADO: &str = "--minimizado";

/// Ejecutable que se debe arrancar (el AppImage si lo hay).
pub fn ejecutable_actual() -> io::Result<PathBuf> {
    if let Some(appimage) = std::env::var_os("APPIMAGE").filter(|a| !a.is_empty()) {
        return Ok(PathBuf::from(appimage));
    }
    std::env::current_exe()
}

/// Entrecomilla una ruta para la clave `Exec` de un `.desktop` (especificacion de freedesktop).
pub fn exec_desktop(ruta: &Path) -> String {
    let mut s = String::from("\"");
    for c in ruta.to_string_lossy().chars() {
        match c {
            '"' | '`' | '$' | '\\' => {
                s.push('\\');
                s.push(c);
            }
            '%' => s.push_str("%%"),
            '\n' | '\r' => {}
            c => s.push(c),
        }
    }
    s.push('"');
    s
}

/// Contenido del `.desktop` de inicio automatico.
pub fn contenido_desktop(ejecutable: &Path) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Gamepad Mapper Plutón\nComment=Mapea cualquier mando\n\
         Exec={} {ARGUMENTO_MINIMIZADO}\nIcon=gamepad-mapper-pluton\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
        exec_desktop(ejecutable)
    )
}

/// Carpeta de autostart de XDG.
pub fn carpeta_autostart() -> Option<PathBuf> {
    let no_vacia = |v: std::ffi::OsString| (!v.is_empty()).then(|| PathBuf::from(v));
    std::env::var_os("XDG_CONFIG_HOME")
        .and_then(no_vacia)
        .or_else(|| std::env::var_os("HOME").and_then(no_vacia).map(|h| h.join(".config")))
        .map(|d| d.join("autostart"))
}

const ARCHIVO_DESKTOP: &str = "gamepad-mapper-pluton.desktop";

/// Activa o desactiva el inicio automatico en una carpeta de autostart concreta (pruebas).
pub fn poner_autoarranque_en(carpeta: &Path, ejecutable: &Path, activar: bool) -> io::Result<()> {
    let ruta = carpeta.join(ARCHIVO_DESKTOP);
    if activar {
        std::fs::create_dir_all(carpeta)?;
        std::fs::write(ruta, contenido_desktop(ejecutable))
    } else {
        match std::fs::remove_file(ruta) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }
}

pub fn autoarranque_en(carpeta: &Path) -> bool {
    carpeta.join(ARCHIVO_DESKTOP).exists()
}

/// Activa o desactiva el inicio automatico con el sistema.
pub fn poner_autoarranque(activar: bool) -> io::Result<()> {
    #[cfg(windows)]
    return windows::poner(activar);
    #[cfg(not(windows))]
    {
        let carpeta = carpeta_autostart().ok_or_else(|| io::Error::other("sin carpeta de configuración"))?;
        poner_autoarranque_en(&carpeta, &ejecutable_actual()?, activar)
    }
}

pub fn autoarranque_activo() -> bool {
    #[cfg(windows)]
    return windows::activo();
    #[cfg(not(windows))]
    return carpeta_autostart().is_some_and(|c| autoarranque_en(&c));
}

#[cfg(windows)]
mod windows {
    use super::{ejecutable_actual, ARGUMENTO_MINIMIZADO};
    use std::io;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
        KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SZ,
    };

    const CLAVE: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    const VALOR: &str = "GamepadMapperPluton";

    fn ancho(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn abrir(acceso: u32) -> io::Result<HKEY> {
        let mut clave: HKEY = std::ptr::null_mut();
        let nombre = ancho(CLAVE);
        // La clave Run existe siempre en HKCU.
        // SAFETY: cadena terminada en 0 y puntero valido al handle de salida.
        let r = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, nombre.as_ptr(), 0, acceso, &mut clave) };
        if r == ERROR_SUCCESS {
            Ok(clave)
        } else {
            Err(io::Error::from_raw_os_error(r as i32))
        }
    }

    pub fn poner(activar: bool) -> io::Result<()> {
        let clave = abrir(KEY_SET_VALUE)?;
        let valor = ancho(VALOR);
        let r = if activar {
            let datos = ancho(&format!("\"{}\" {ARGUMENTO_MINIMIZADO}", ejecutable_actual()?.display()));
            // SAFETY: datos UTF-16 terminados en 0 con su tamano en bytes.
            unsafe { RegSetValueExW(clave, valor.as_ptr(), 0, REG_SZ, datos.as_ptr().cast(), (datos.len() * 2) as u32) }
        } else {
            // SAFETY: nombre terminado en 0.
            let r = unsafe { RegDeleteValueW(clave, valor.as_ptr()) };
            if r == 2 {
                ERROR_SUCCESS // ERROR_FILE_NOT_FOUND: ya no estaba
            } else {
                r
            }
        };
        // SAFETY: handle abierto arriba.
        unsafe { RegCloseKey(clave) };
        if r == ERROR_SUCCESS {
            Ok(())
        } else {
            Err(io::Error::from_raw_os_error(r as i32))
        }
    }

    pub fn activo() -> bool {
        let Ok(clave) = abrir(KEY_QUERY_VALUE) else { return false };
        let valor = ancho(VALOR);
        // SAFETY: solo se consulta si existe el valor (sin buffer).
        let r = unsafe {
            RegQueryValueExW(
                clave,
                valor.as_ptr(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        // SAFETY: handle abierto arriba.
        unsafe { RegCloseKey(clave) };
        r == ERROR_SUCCESS
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn exec_entrecomillado() {
        assert_eq!(exec_desktop(Path::new("/opt/app/gpm")), "\"/opt/app/gpm\"");
        assert_eq!(exec_desktop(Path::new("/home/a b/$x`\"%.AppImage")), "\"/home/a b/\\$x\\`\\\"%%.AppImage\"");
        let d = contenido_desktop(Path::new("/opt/gpm"));
        assert!(d.contains("Exec=\"/opt/gpm\" --minimizado\n"), "{d}");
    }

    #[test]
    fn crea_y_borra_el_desktop() {
        let dir = std::env::temp_dir().join(format!("gpm-autostart-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(!autoarranque_en(&dir));
        poner_autoarranque_en(&dir, Path::new("/opt/gpm"), true).unwrap();
        assert!(autoarranque_en(&dir));
        poner_autoarranque_en(&dir, Path::new("/opt/gpm"), false).unwrap();
        poner_autoarranque_en(&dir, Path::new("/opt/gpm"), false).unwrap();
        assert!(!autoarranque_en(&dir));
        let _ = std::fs::remove_dir_all(dir);
    }
}
