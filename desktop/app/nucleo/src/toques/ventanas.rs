//! Ventanas abiertas, para elegir donde caen los toques y seguirla si se mueve o cambia de tamano.
//!
//! - Linux (X11 o XWayland) con x11rb: `_NET_CLIENT_LIST`, titulo (`_NET_WM_NAME` o `WM_NAME`),
//!   `WM_CLASS`, area de la ventana (sin el marco: geometria + `translate_coordinates` a la raiz) y
//!   `_NET_ACTIVE_WINDOW` para el foco. En Wayland puro no se pueden listar ventanas: queda el
//!   rectangulo manual (o la pantalla entera).
//! - Windows: `EnumWindows` con el area de cliente (`GetClientRect` + `ClientToScreen`) y
//!   `GetForegroundWindow`.
//!
//! Las ventanas de la propia app no se listan.

use serde::{Deserialize, Serialize};

/// Rectangulo en pixeles del escritorio.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub ancho: u32,
    pub alto: u32,
}

/// Tamano minimo de una ventana para tocar en ella.
pub const MIN_LADO: u32 = 50;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VentanaAbierta {
    /// Id del sistema (XID o HWND): sirve para seguirla mientras exista.
    pub id: u64,
    pub titulo: String,
    pub clase: String,
    pub rect: Rect,
    pub activa: bool,
}

/// Que ventana se busca (se guarda en la configuracion).
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ObjetivoVentana {
    pub titulo: String,
    pub clase: String,
}

impl ObjetivoVentana {
    /// Cuanto se parece una ventana a lo buscado (0 = nada). Gana la clase igual y el titulo
    /// igual; un titulo que lo contiene vale menos (los titulos cambian: scrcpy, Waydroid...).
    pub fn parecido(&self, v: &VentanaAbierta) -> u32 {
        let clase = !self.clase.is_empty() && self.clase.eq_ignore_ascii_case(&v.clase);
        let titulo = self.titulo.trim().to_lowercase();
        let suyo = v.titulo.to_lowercase();
        let igual = !titulo.is_empty() && titulo == suyo;
        let contiene = !titulo.is_empty() && suyo.contains(&titulo);
        match (clase, igual, contiene) {
            (true, true, _) => 4,
            (_, true, _) => 3,
            (true, false, true) => 3,
            (true, false, false) => 2,
            (false, false, true) => 1,
            _ => 0,
        }
    }

    /// La ventana que mas se parece (con preferencia por la que ya se seguia).
    pub fn elegir<'a>(&self, lista: &'a [VentanaAbierta], previa: Option<u64>) -> Option<&'a VentanaAbierta> {
        lista
            .iter()
            .map(|v| (self.parecido(v) * 2 + u32::from(Some(v.id) == previa), v))
            .filter(|(p, _)| *p >= 4)
            .max_by_key(|(p, _)| *p)
            .map(|(_, v)| v)
    }
}

/// Ventanas visibles (None si no se pueden listar en este escritorio).
pub fn listar() -> Option<Vec<VentanaAbierta>> {
    #[cfg(target_os = "linux")]
    return linux::listar();
    #[cfg(windows)]
    return Some(windows::listar());
    #[cfg(not(any(target_os = "linux", windows)))]
    return None;
}

/// Tamano del escritorio (Linux: la pantalla de X entera; Windows: el monitor principal).
pub fn escritorio() -> Option<(u32, u32)> {
    #[cfg(target_os = "linux")]
    return linux::escritorio();
    #[cfg(windows)]
    return windows::escritorio();
    #[cfg(not(any(target_os = "linux", windows)))]
    return None;
}

fn limpiar(s: &str) -> String {
    s.chars().filter(|c| !c.is_control()).take(256).collect()
}

#[cfg(target_os = "linux")]
mod linux {
    use super::{limpiar, Rect, VentanaAbierta, MIN_LADO};
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ConnectionExt, MapState, Window};
    use x11rb::rust_connection::RustConnection;

    struct X {
        con: RustConnection,
        raiz: Window,
        ancho: u16,
        alto: u16,
    }

    fn conectar() -> Option<X> {
        std::env::var_os("DISPLAY")?;
        let (con, pantalla) = x11rb::connect(None).ok()?;
        let s = con.setup().roots.get(pantalla)?;
        let (raiz, ancho, alto) = (s.root, s.width_in_pixels, s.height_in_pixels);
        Some(X { con, raiz, ancho, alto })
    }

    impl X {
        fn atomo(&self, nombre: &[u8]) -> Option<u32> {
            Some(self.con.intern_atom(false, nombre).ok()?.reply().ok()?.atom)
        }

        fn propiedad(&self, w: Window, prop: u32, tipo: u32, largo: u32) -> Option<Vec<u8>> {
            Some(self.con.get_property(false, w, prop, tipo, 0, largo).ok()?.reply().ok()?.value)
        }

        fn ventana(&self, w: Window, activa: Option<Window>, atomos: &Atomos) -> Option<VentanaAbierta> {
            let attrs = self.con.get_window_attributes(w).ok()?.reply().ok()?;
            if attrs.map_state != MapState::VIEWABLE {
                return None;
            }
            let g = self.con.get_geometry(w).ok()?.reply().ok()?;
            let t = self.con.translate_coordinates(w, self.raiz, 0, 0).ok()?.reply().ok()?;
            let rect = Rect {
                x: i32::from(t.dst_x),
                y: i32::from(t.dst_y),
                ancho: u32::from(g.width),
                alto: u32::from(g.height),
            };
            if rect.ancho < MIN_LADO || rect.alto < MIN_LADO {
                return None;
            }
            if let Some(pid) = atomos.pid.and_then(|a| self.propiedad(w, a, AtomEnum::CARDINAL.into(), 1)) {
                if pid.len() == 4 && u32::from_ne_bytes([pid[0], pid[1], pid[2], pid[3]]) == std::process::id() {
                    return None;
                }
            }
            let titulo = atomos
                .nombre
                .zip(atomos.utf8)
                .and_then(|(n, u)| self.propiedad(w, n, u, 256))
                .filter(|v| !v.is_empty())
                .or_else(|| self.propiedad(w, AtomEnum::WM_NAME.into(), AtomEnum::ANY.into(), 256))
                .map(|v| limpiar(&String::from_utf8_lossy(&v)))
                .unwrap_or_default();
            let clase = self
                .propiedad(w, AtomEnum::WM_CLASS.into(), AtomEnum::STRING.into(), 256)
                .map(|v| limpiar(&crate::foco::leer_wm_class(&v)))
                .unwrap_or_default();
            Some(VentanaAbierta { id: u64::from(w), titulo, clase, rect, activa: activa == Some(w) })
        }
    }

    struct Atomos {
        nombre: Option<u32>,
        utf8: Option<u32>,
        pid: Option<u32>,
    }

    pub fn listar() -> Option<Vec<VentanaAbierta>> {
        let x = conectar()?;
        let lista = x.atomo(b"_NET_CLIENT_LIST")?;
        let activa_a = x.atomo(b"_NET_ACTIVE_WINDOW");
        let atomos =
            Atomos { nombre: x.atomo(b"_NET_WM_NAME"), utf8: x.atomo(b"UTF8_STRING"), pid: x.atomo(b"_NET_WM_PID") };
        let activa = activa_a.and_then(|a| {
            x.con.get_property(false, x.raiz, a, AtomEnum::WINDOW, 0, 1).ok()?.reply().ok()?.value32()?.next()
        });
        let ventanas: Vec<Window> = x
            .con
            .get_property(false, x.raiz, lista, AtomEnum::WINDOW, 0, 1024)
            .ok()?
            .reply()
            .ok()?
            .value32()?
            .collect();
        Some(ventanas.into_iter().filter_map(|w| x.ventana(w, activa, &atomos)).collect())
    }

    pub fn escritorio() -> Option<(u32, u32)> {
        let x = conectar()?;
        (x.ancho > 0 && x.alto > 0).then(|| (u32::from(x.ancho), u32::from(x.alto)))
    }
}

#[cfg(windows)]
mod windows {
    use super::{limpiar, Rect, VentanaAbierta, MIN_LADO};
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
    use windows_sys::Win32::Graphics::Gdi::ClientToScreen;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetClientRect, GetForegroundWindow, GetSystemMetrics, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible, SM_CXSCREEN, SM_CYSCREEN,
    };

    fn texto(f: impl FnOnce(*mut u16, i32) -> i32) -> String {
        let mut b = [0u16; 512];
        let n = f(b.as_mut_ptr(), b.len() as i32);
        limpiar(&String::from_utf16_lossy(&b[..n.clamp(0, b.len() as i32) as usize]))
    }

    fn ventana(h: HWND, activa: HWND) -> Option<VentanaAbierta> {
        // SAFETY: h viene de EnumWindows; las funciones toleran ventanas que ya no existen.
        unsafe {
            if IsWindowVisible(h) == 0 || IsIconic(h) != 0 {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(h, &mut pid);
            if pid == std::process::id() {
                return None;
            }
            let mut c = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            let mut p = POINT { x: 0, y: 0 };
            if GetClientRect(h, &mut c) == 0 || ClientToScreen(h, &mut p) == 0 {
                return None;
            }
            let rect = Rect {
                x: p.x,
                y: p.y,
                ancho: (c.right - c.left).max(0) as u32,
                alto: (c.bottom - c.top).max(0) as u32,
            };
            if rect.ancho < MIN_LADO || rect.alto < MIN_LADO {
                return None;
            }
            let titulo = texto(|b, n| GetWindowTextW(h, b, n));
            if titulo.is_empty() {
                return None;
            }
            let clase = texto(|b, n| GetClassNameW(h, b, n));
            Some(VentanaAbierta { id: h as usize as u64, titulo, clase, rect, activa: h == activa })
        }
    }

    unsafe extern "system" fn una(h: HWND, datos: LPARAM) -> BOOL {
        // SAFETY: datos es el puntero a la lista que pasa listar() y vive durante EnumWindows.
        let lista = unsafe { &mut *(datos as *mut Vec<HWND>) };
        lista.push(h);
        1
    }

    pub fn listar() -> Vec<VentanaAbierta> {
        let mut hs: Vec<HWND> = Vec::new();
        // SAFETY: la lista vive durante la llamada; el callback solo la amplia.
        unsafe { EnumWindows(Some(una), &mut hs as *mut Vec<HWND> as LPARAM) };
        // SAFETY: sin argumentos.
        let activa = unsafe { GetForegroundWindow() };
        hs.into_iter().take(1024).filter_map(|h| ventana(h, activa)).collect()
    }

    pub fn escritorio() -> Option<(u32, u32)> {
        // SAFETY: llamadas sin punteros.
        let (w, h) = unsafe { (GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)) };
        (w > 0 && h > 0).then_some((w as u32, h as u32))
    }
}

/// Nombre corto (8.3) de una ruta de Windows, para `fopen` del nucleo con rutas no ASCII.
#[cfg(windows)]
pub fn ruta_corta(ruta: &std::path::Path) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetShortPathNameW;
    let ancha: Vec<u16> = ruta.as_os_str().encode_wide().chain([0]).collect();
    let mut b = vec![0u16; 1024];
    // SAFETY: cadena terminada en 0 y buffer con su tamano.
    let n = unsafe { GetShortPathNameW(ancha.as_ptr(), b.as_mut_ptr(), b.len() as u32) } as usize;
    (n > 0 && n < b.len()).then(|| String::from_utf16_lossy(&b[..n]))
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn v(id: u64, titulo: &str, clase: &str) -> VentanaAbierta {
        VentanaAbierta {
            id,
            titulo: titulo.into(),
            clase: clase.into(),
            rect: Rect { x: 0, y: 0, ancho: 800, alto: 600 },
            activa: false,
        }
    }

    #[test]
    fn elige_la_ventana_que_mas_se_parece() {
        let lista = [v(1, "Terminal", "Gnome-terminal"), v(2, "Pixel 7", "scrcpy"), v(3, "Waydroid", "Waydroid")];
        let o = ObjetivoVentana { titulo: "Pixel 7".into(), clase: "scrcpy".into() };
        assert_eq!(o.elegir(&lista, None).map(|v| v.id), Some(2));
        // El titulo cambia (otro movil): la clase basta.
        let o = ObjetivoVentana { titulo: "Galaxy S21".into(), clase: "scrcpy".into() };
        assert_eq!(o.elegir(&lista, None).map(|v| v.id), Some(2));
        // Solo un trozo del titulo no basta.
        let o = ObjetivoVentana { titulo: "way".into(), clase: String::new() };
        assert_eq!(o.elegir(&lista, None), None);
        let o = ObjetivoVentana { titulo: "waydroid".into(), clase: String::new() };
        assert_eq!(o.elegir(&lista, None).map(|v| v.id), Some(3));
        // Dos iguales: la que ya se seguia.
        let dos = [v(5, "Juego", "x"), v(6, "Juego", "x")];
        let o = ObjetivoVentana { titulo: "Juego".into(), clase: "x".into() };
        assert_eq!(o.elegir(&dos, Some(6)).map(|v| v.id), Some(6));
    }
}
