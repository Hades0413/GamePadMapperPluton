//! Ventana con el foco, para cambiar de configuracion al cambiar de juego.
//!
//! - Linux (X11 o XWayland): `_NET_ACTIVE_WINDOW` con x11rb; de ella `WM_CLASS`, `_NET_WM_NAME` y
//!   `_NET_WM_PID` (el ejecutable sale de `/proc/<pid>/exe`). Si no se puede hablar con el
//!   servidor X, se prueba con `xprop` (sin shell: argumentos fijos y el id de ventana ya validado).
//!   En Wayland puro (sin XWayland) los compositores no dicen que ventana tiene el foco.
//! - Windows: `GetForegroundWindow` y el ejecutable de su proceso.

use crate::juegos::Ventana;

/// Ventana con el foco ahora mismo, si se puede saber.
pub fn ventana_activa() -> Option<Ventana> {
    #[cfg(target_os = "linux")]
    return linux::ventana_activa();
    #[cfg(windows)]
    return windows::ventana_activa();
    #[cfg(not(any(target_os = "linux", windows)))]
    return None;
}

fn sin_ruta(ruta: &str) -> String {
    ruta.rsplit(['/', '\\']).next().unwrap_or(ruta).to_owned()
}

/// `WM_CLASS` son dos cadenas terminadas en 0 (instancia y clase): se usa la clase.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
pub(crate) fn leer_wm_class(bytes: &[u8]) -> String {
    let partes: Vec<&[u8]> = bytes.split(|b| *b == 0).filter(|p| !p.is_empty()).collect();
    partes.last().map(|p| String::from_utf8_lossy(p).into_owned()).unwrap_or_default()
}

#[cfg(target_os = "linux")]
mod linux {
    use super::{leer_wm_class, sin_ruta, Ventana};
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};

    fn ejecutable(pid: u32) -> String {
        std::fs::read_link(format!("/proc/{pid}/exe")).map(|r| sin_ruta(&r.to_string_lossy())).unwrap_or_default()
    }

    fn con_x11rb() -> Option<Ventana> {
        std::env::var_os("DISPLAY")?;
        let (con, pantalla) = x11rb::connect(None).ok()?;
        let raiz = con.setup().roots.get(pantalla)?.root;
        let atomo = |n: &[u8]| con.intern_atom(false, n).ok()?.reply().ok().map(|r| r.atom);
        let activa = atomo(b"_NET_ACTIVE_WINDOW")?;
        let ventana = con
            .get_property(false, raiz, activa, AtomEnum::WINDOW, 0, 1)
            .ok()?
            .reply()
            .ok()?
            .value32()?
            .next()
            .filter(|w| *w != 0)?;
        let clase = con
            .get_property(false, ventana, AtomEnum::WM_CLASS, AtomEnum::STRING, 0, 256)
            .ok()
            .and_then(|c| c.reply().ok())
            .map(|r| leer_wm_class(&r.value))
            .unwrap_or_default();
        let titulo = atomo(b"_NET_WM_NAME")
            .zip(atomo(b"UTF8_STRING"))
            .and_then(|(nombre, utf8)| con.get_property(false, ventana, nombre, utf8, 0, 256).ok())
            .and_then(|c| c.reply().ok())
            .map(|r| String::from_utf8_lossy(&r.value).into_owned())
            .unwrap_or_default();
        let pid = atomo(b"_NET_WM_PID")
            .and_then(|a| con.get_property(false, ventana, a, AtomEnum::CARDINAL, 0, 1).ok())
            .and_then(|c| c.reply().ok())
            .and_then(|r| r.value32().and_then(|mut v| v.next()));
        Some(Ventana { ejecutable: pid.map(ejecutable).unwrap_or_default(), clase, titulo })
    }

    /// Plan B con `xprop` (paquete x11-utils).
    fn con_xprop() -> Option<Ventana> {
        let salida = |args: &[&str]| -> Option<String> {
            let s = std::process::Command::new("xprop").args(args).output().ok()?;
            s.status.success().then(|| String::from_utf8_lossy(&s.stdout).into_owned())
        };
        let raiz = salida(&["-root", "_NET_ACTIVE_WINDOW"])?;
        let id = raiz.split_whitespace().last()?.trim_end_matches(',');
        let hex = id.strip_prefix("0x")?;
        if hex.is_empty() || hex.len() > 8 || !hex.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let datos = salida(&["-id", id, "WM_CLASS", "_NET_WM_PID"])?;
        let mut v = Ventana::default();
        for linea in datos.lines() {
            if let Some(resto) = linea.strip_prefix("WM_CLASS(STRING) = ") {
                v.clase = resto.rsplit(", ").next().unwrap_or("").trim_matches('"').to_owned();
            } else if let Some(resto) = linea.strip_prefix("_NET_WM_PID(CARDINAL) = ") {
                if let Ok(pid) = resto.trim().parse::<u32>() {
                    v.ejecutable = ejecutable(pid);
                }
            }
        }
        Some(v)
    }

    pub fn ventana_activa() -> Option<Ventana> {
        con_x11rb().or_else(con_xprop)
    }
}

#[cfg(windows)]
mod windows {
    use super::{sin_ruta, Ventana};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};

    pub fn ventana_activa() -> Option<Ventana> {
        // SAFETY: llamadas sin punteros de entrada; se comprueba el resultado.
        let ventana = unsafe { GetForegroundWindow() };
        if ventana.is_null() {
            return None;
        }
        let mut pid = 0u32;
        // SAFETY: puntero valido a un u32 local.
        unsafe { GetWindowThreadProcessId(ventana, &mut pid) };
        let mut titulo = [0u16; 256];
        // SAFETY: buffer local con su longitud real.
        let n = unsafe { GetWindowTextW(ventana, titulo.as_mut_ptr(), titulo.len() as i32) };
        let titulo = String::from_utf16_lossy(&titulo[..n.max(0) as usize]);
        let mut ejecutable = String::new();
        // SAFETY: solo permiso de consulta limitada; el handle se cierra abajo.
        let proceso = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if !proceso.is_null() {
            let mut ruta = [0u16; 1024];
            let mut largo = ruta.len() as u32;
            // SAFETY: buffer local y su longitud; el handle es valido.
            if unsafe { QueryFullProcessImageNameW(proceso, PROCESS_NAME_WIN32, ruta.as_mut_ptr(), &mut largo) } != 0 {
                ejecutable = sin_ruta(&String::from_utf16_lossy(&ruta[..largo as usize]));
            }
            // SAFETY: handle abierto arriba.
            unsafe { CloseHandle(proceso) };
        }
        Some(Ventana { ejecutable, clase: String::new(), titulo })
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn partes_de_la_ventana() {
        assert_eq!(leer_wm_class(b"steam_app_367520\0steam_app_367520\0"), "steam_app_367520");
        assert_eq!(leer_wm_class(b"navigator\0Firefox\0"), "Firefox");
        assert_eq!(leer_wm_class(b""), "");
        assert_eq!(sin_ruta("/usr/bin/juego"), "juego");
        assert_eq!(sin_ruta("C:\\Juegos\\juego.exe"), "juego.exe");
    }
}
