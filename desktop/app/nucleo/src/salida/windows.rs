//! Mandos virtuales en Windows con ViGEmBus (Nefarius).
//!
//! ViGEmBus es un driver de terceros que la app NO incluye: si esta instalado, la app carga en
//! tiempo de ejecucion su cliente (`ViGEmClient.dll`, x64) solo desde la carpeta de la app o
//! System32 (nunca del directorio actual, para evitar el secuestro de DLL). Sin el driver o sin el
//! cliente, la interfaz explica que falta y enlaza a las versiones oficiales. ViGEmBus esta
//! retirado por su autor (sin soporte), pero sigue funcionando en Windows 10 y 11.
//!
//! Tipos: Xbox 360 (XUSB) y DualShock 4. Switch Pro no existe en ViGEm.
//! Las ranuras XInput de nuestros Xbox 360 se marcan en
//! [`crate::dispositivos::windows::RANURAS_VIRTUALES`] para no leerlos como mandos fisicos.

use super::{Disponibilidad, ErrorSalida, EstadoPad, FabricaSalidas, SalidaVirtual, Teclado, TipoSalida};
use crate::dispositivos::windows::RANURAS_VIRTUALES;
use crate::mapeo::acciones::{SalidaPad, TECLAS};
use std::ffi::c_void;
use std::io;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use windows_sys::Win32::System::LibraryLoader::{
    GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_APPLICATION_DIR, LOAD_LIBRARY_SEARCH_SYSTEM32,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
};

const VIGEM_ERROR_NONE: u32 = 0x2000_0000;
const VIGEM_ERROR_BUS_NOT_FOUND: u32 = 0xE000_0001;

type Puntero = *mut c_void;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct XusbReport {
    w_buttons: u16,
    b_left_trigger: u8,
    b_right_trigger: u8,
    s_thumb_lx: i16,
    s_thumb_ly: i16,
    s_thumb_rx: i16,
    s_thumb_ry: i16,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct Ds4Report {
    b_thumb_lx: u8,
    b_thumb_ly: u8,
    b_thumb_rx: u8,
    b_thumb_ry: u8,
    w_buttons: u16,
    b_special: u8,
    b_trigger_l: u8,
    b_trigger_r: u8,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct ColorDs4 {
    rojo: u8,
    verde: u8,
    azul: u8,
}

type NotificacionX360 = unsafe extern "system" fn(Puntero, Puntero, u8, u8, u8, Puntero);
type NotificacionDs4 = unsafe extern "system" fn(Puntero, Puntero, u8, u8, ColorDs4, Puntero);

/// Funciones del cliente de ViGEm (ViGEmClient.h).
struct Api {
    alloc: unsafe extern "C" fn() -> Puntero,
    free: unsafe extern "C" fn(Puntero),
    connect: unsafe extern "C" fn(Puntero) -> u32,
    disconnect: unsafe extern "C" fn(Puntero),
    x360_alloc: unsafe extern "C" fn() -> Puntero,
    ds4_alloc: unsafe extern "C" fn() -> Puntero,
    target_free: unsafe extern "C" fn(Puntero),
    target_add: unsafe extern "C" fn(Puntero, Puntero) -> u32,
    target_remove: unsafe extern "C" fn(Puntero, Puntero) -> u32,
    x360_update: unsafe extern "C" fn(Puntero, Puntero, XusbReport) -> u32,
    ds4_update: unsafe extern "C" fn(Puntero, Puntero, Ds4Report) -> u32,
    x360_get_user_index: unsafe extern "C" fn(Puntero, Puntero, *mut u32) -> u32,
    x360_register: unsafe extern "C" fn(Puntero, Puntero, NotificacionX360, Puntero) -> u32,
    x360_unregister: unsafe extern "C" fn(Puntero),
    ds4_register: unsafe extern "C" fn(Puntero, Puntero, NotificacionDs4, Puntero) -> u32,
    ds4_unregister: unsafe extern "C" fn(Puntero),
}

fn ancho(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

impl Api {
    /// Carga ViGEmClient.dll (carpeta de la app o System32) y busca sus funciones.
    fn cargar() -> Option<Api> {
        let nombre = ancho("ViGEmClient.dll");
        // SAFETY: nombre es una cadena UTF-16 terminada en 0 que vive durante la llamada.
        let modulo = unsafe {
            LoadLibraryExW(
                nombre.as_ptr(),
                std::ptr::null_mut(),
                LOAD_LIBRARY_SEARCH_APPLICATION_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32,
            )
        };
        if modulo.is_null() {
            return None;
        }
        /// Busca una funcion exportada y la convierte en el puntero de funcion `T`.
        ///
        /// SAFETY: `T` debe ser un puntero de funcion con la firma real de la exportacion.
        unsafe fn simbolo<T: Copy>(modulo: *mut c_void, nombre: &str) -> Option<T> {
            debug_assert!(nombre.ends_with('\0'));
            assert_eq!(std::mem::size_of::<T>(), std::mem::size_of::<usize>());
            // SAFETY: nombre termina en 0; el modulo sigue cargado (no se libera nunca).
            let f = unsafe { GetProcAddress(modulo, nombre.as_ptr()) }?;
            // SAFETY: lo garantiza quien llama (misma firma que en ViGEmClient.h).
            Some(unsafe { std::mem::transmute_copy::<unsafe extern "system" fn() -> isize, T>(&f) })
        }
        macro_rules! funcion {
            ($nombre:literal) => {
                // SAFETY: el tipo del campo es la firma de ViGEmClient.h para esta exportacion.
                unsafe { simbolo(modulo, concat!($nombre, "\0"))? }
            };
        }
        Some(Api {
            alloc: funcion!("vigem_alloc"),
            free: funcion!("vigem_free"),
            connect: funcion!("vigem_connect"),
            disconnect: funcion!("vigem_disconnect"),
            x360_alloc: funcion!("vigem_target_x360_alloc"),
            ds4_alloc: funcion!("vigem_target_ds4_alloc"),
            target_free: funcion!("vigem_target_free"),
            target_add: funcion!("vigem_target_add"),
            target_remove: funcion!("vigem_target_remove"),
            x360_update: funcion!("vigem_target_x360_update"),
            ds4_update: funcion!("vigem_target_ds4_update"),
            x360_get_user_index: funcion!("vigem_target_x360_get_user_index"),
            x360_register: funcion!("vigem_target_x360_register_notification"),
            x360_unregister: funcion!("vigem_target_x360_unregister_notification"),
            ds4_register: funcion!("vigem_target_ds4_register_notification"),
            ds4_unregister: funcion!("vigem_target_ds4_unregister_notification"),
        })
    }
}

/// Cliente conectado al bus. ViGEmClient es seguro entre hilos.
struct Cliente {
    api: Api,
    cliente: Puntero,
}

// SAFETY: el cliente de ViGEm se puede usar desde cualquier hilo (lo documenta ViGEmClient).
unsafe impl Send for Cliente {}
// SAFETY: igual que arriba.
unsafe impl Sync for Cliente {}

impl Cliente {
    fn conectar() -> Result<Cliente, ErrorSalida> {
        let api = Api::cargar().ok_or(ErrorSalida::SinClienteVigem)?;
        // SAFETY: funciones del cliente cargado; el puntero se comprueba antes de usarlo.
        let cliente = unsafe { (api.alloc)() };
        if cliente.is_null() {
            return Err(ErrorSalida::Io(io::Error::other("vigem_alloc")));
        }
        // SAFETY: cliente valido recien creado.
        let r = unsafe { (api.connect)(cliente) };
        if r != VIGEM_ERROR_NONE {
            // SAFETY: se libera el cliente que no se pudo conectar.
            unsafe { (api.free)(cliente) };
            return Err(if r == VIGEM_ERROR_BUS_NOT_FOUND {
                ErrorSalida::SinVigem
            } else {
                ErrorSalida::Io(io::Error::other(format!("vigem_connect 0x{r:08x}")))
            });
        }
        Ok(Cliente { api, cliente })
    }
}

impl Drop for Cliente {
    fn drop(&mut self) {
        // SAFETY: el cliente esta conectado y ningun objetivo lo usa ya (cada objetivo guarda un Arc).
        unsafe {
            (self.api.disconnect)(self.cliente);
            (self.api.free)(self.cliente);
        }
    }
}

/// Vibracion pedida por el juego: fuerte << 8 | debil, mas el bit 16 si hay algo nuevo.
type Buzon = AtomicU32;
const NUEVO: u32 = 1 << 16;

unsafe extern "system" fn al_vibrar_x360(_: Puntero, _: Puntero, grande: u8, pequeno: u8, _: u8, datos: Puntero) {
    // SAFETY: `datos` es el Buzon de la salida, vivo hasta que se anula el registro.
    let buzon = unsafe { &*(datos as *const Buzon) };
    buzon.store(NUEVO | u32::from(grande) << 8 | u32::from(pequeno), Ordering::Release);
}

unsafe extern "system" fn al_vibrar_ds4(_: Puntero, _: Puntero, grande: u8, pequeno: u8, _: ColorDs4, datos: Puntero) {
    // SAFETY: igual que en al_vibrar_x360.
    let buzon = unsafe { &*(datos as *const Buzon) };
    buzon.store(NUEVO | u32::from(grande) << 8 | u32::from(pequeno), Ordering::Release);
}

pub struct SalidaVigem {
    tipo: TipoSalida,
    cliente: Arc<Cliente>,
    objetivo: Puntero,
    buzon: Box<Buzon>,
    ranura: Option<u32>,
}

// SAFETY: el objetivo solo se usa a traves del cliente, que es seguro entre hilos.
unsafe impl Send for SalidaVigem {}

impl SalidaVigem {
    fn crear(cliente: Arc<Cliente>, tipo: TipoSalida) -> Result<Self, ErrorSalida> {
        let api = &cliente.api;
        // SAFETY: funciones del cliente cargado.
        let objetivo = unsafe {
            match tipo {
                TipoSalida::Xbox360 => (api.x360_alloc)(),
                TipoSalida::Dualshock4 => (api.ds4_alloc)(),
                _ => return Err(ErrorSalida::NoDisponible),
            }
        };
        if objetivo.is_null() {
            return Err(ErrorSalida::Io(io::Error::other("vigem_target_alloc")));
        }
        // SAFETY: cliente y objetivo validos.
        let r = unsafe { (api.target_add)(cliente.cliente, objetivo) };
        if r != VIGEM_ERROR_NONE {
            // SAFETY: objetivo sin anadir: solo se libera.
            unsafe { (api.target_free)(objetivo) };
            return Err(ErrorSalida::Io(io::Error::other(format!("vigem_target_add 0x{r:08x}"))));
        }
        let buzon = Box::new(Buzon::new(0));
        let datos = &*buzon as *const Buzon as Puntero;
        // SAFETY: el buzon vive en el Box hasta que Drop anula el registro.
        unsafe {
            match tipo {
                TipoSalida::Xbox360 => (api.x360_register)(cliente.cliente, objetivo, al_vibrar_x360, datos),
                _ => (api.ds4_register)(cliente.cliente, objetivo, al_vibrar_ds4, datos),
            };
        }
        let mut ranura = None;
        if tipo == TipoSalida::Xbox360 {
            let mut n = 0u32;
            // SAFETY: puntero valido a un u32 local.
            if unsafe { (api.x360_get_user_index)(cliente.cliente, objetivo, &mut n) } == VIGEM_ERROR_NONE && n < 4 {
                RANURAS_VIRTUALES.fetch_or(1 << n, Ordering::Relaxed);
                ranura = Some(n);
            }
        }
        log::info!("mando virtual {tipo:?} creado con ViGEm (ranura XInput {ranura:?})");
        Ok(Self { tipo, cliente, objetivo, buzon, ranura })
    }
}

impl Drop for SalidaVigem {
    fn drop(&mut self) {
        let api = &self.cliente.api;
        // SAFETY: objetivo anadido a este cliente; se anula el registro antes de soltar el buzon.
        unsafe {
            match self.tipo {
                TipoSalida::Xbox360 => (api.x360_unregister)(self.objetivo),
                _ => (api.ds4_unregister)(self.objetivo),
            }
            (api.target_remove)(self.cliente.cliente, self.objetivo);
            (api.target_free)(self.objetivo);
        }
        if let Some(n) = self.ranura {
            RANURAS_VIRTUALES.fetch_and(!(1 << n), Ordering::Relaxed);
        }
    }
}

fn informe_x360(p: &EstadoPad) -> XusbReport {
    const BOTONES: [(SalidaPad, u16); 14] = [
        (SalidaPad::DpadUp, 0x0001),
        (SalidaPad::DpadDown, 0x0002),
        (SalidaPad::DpadLeft, 0x0004),
        (SalidaPad::DpadRight, 0x0008),
        (SalidaPad::Start, 0x0010),
        (SalidaPad::Select, 0x0020),
        (SalidaPad::L3, 0x0040),
        (SalidaPad::R3, 0x0080),
        (SalidaPad::L1, 0x0100),
        (SalidaPad::R1, 0x0200),
        (SalidaPad::Home, 0x0400),
        (SalidaPad::A, 0x1000),
        (SalidaPad::B, 0x2000),
        (SalidaPad::X, 0x4000),
    ];
    let mut w = BOTONES.iter().filter(|(s, _)| p.pulsado(*s)).fold(0u16, |w, (_, b)| w | b);
    if p.pulsado(SalidaPad::Y) {
        w |= 0x8000;
    }
    let eje = |v: f32| super::a_rango(v, -32768, 0, 32767) as i16;
    let gatillo = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    // XInput: Y positivo hacia arriba.
    XusbReport {
        w_buttons: w,
        b_left_trigger: gatillo(p.l2),
        b_right_trigger: gatillo(p.r2),
        s_thumb_lx: eje(p.ls[0]),
        s_thumb_ly: eje(-p.ls[1]),
        s_thumb_rx: eje(p.rs[0]),
        s_thumb_ry: eje(-p.rs[1]),
    }
}

fn informe_ds4(p: &EstadoPad) -> Ds4Report {
    const BOTONES: [(SalidaPad, u16); 10] = [
        (SalidaPad::X, 1 << 4),
        (SalidaPad::A, 1 << 5),
        (SalidaPad::B, 1 << 6),
        (SalidaPad::Y, 1 << 7),
        (SalidaPad::L1, 1 << 8),
        (SalidaPad::R1, 1 << 9),
        (SalidaPad::Select, 1 << 12),
        (SalidaPad::Start, 1 << 13),
        (SalidaPad::L3, 1 << 14),
        (SalidaPad::R3, 1 << 15),
    ];
    let mut w = BOTONES.iter().filter(|(s, _)| p.pulsado(*s)).fold(0u16, |w, (_, b)| w | b);
    if p.l2 > crate::mapeo::ajustes::UMBRAL_PULSADO {
        w |= 1 << 10;
    }
    if p.r2 > crate::mapeo::ajustes::UMBRAL_PULSADO {
        w |= 1 << 11;
    }
    // Cruceta: 0 = norte, en el sentido de las agujas del reloj; 8 = nada.
    w |= match p.cruceta_xy() {
        (0, -1) => 0,
        (1, -1) => 1,
        (1, 0) => 2,
        (1, 1) => 3,
        (0, 1) => 4,
        (-1, 1) => 5,
        (-1, 0) => 6,
        (-1, -1) => 7,
        _ => 8,
    };
    let mut especial = 0u8;
    if p.pulsado(SalidaPad::Home) {
        especial |= 1;
    }
    if p.pulsado(SalidaPad::Touchpad) {
        especial |= 2;
    }
    let eje = |v: f32| super::a_rango(v, 0, 128, 255) as u8;
    let gatillo = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    Ds4Report {
        b_thumb_lx: eje(p.ls[0]),
        b_thumb_ly: eje(p.ls[1]),
        b_thumb_rx: eje(p.rs[0]),
        b_thumb_ry: eje(p.rs[1]),
        w_buttons: w,
        b_special: especial,
        b_trigger_l: gatillo(p.l2),
        b_trigger_r: gatillo(p.r2),
    }
}

impl SalidaVirtual for SalidaVigem {
    fn tipo(&self) -> TipoSalida {
        self.tipo
    }

    fn enviar(&mut self, pad: &EstadoPad) -> io::Result<()> {
        let api = &self.cliente.api;
        // SAFETY: cliente y objetivo validos; los informes se pasan por valor.
        let r = unsafe {
            match self.tipo {
                TipoSalida::Xbox360 => (api.x360_update)(self.cliente.cliente, self.objetivo, informe_x360(pad)),
                _ => (api.ds4_update)(self.cliente.cliente, self.objetivo, informe_ds4(pad)),
            }
        };
        if r == VIGEM_ERROR_NONE {
            Ok(())
        } else {
            Err(io::Error::other(format!("ViGEm 0x{r:08x}")))
        }
    }

    fn vibracion(&mut self) -> Option<(f32, f32)> {
        let v = self.buzon.swap(0, Ordering::Acquire);
        (v & NUEVO != 0).then(|| (((v >> 8) & 0xff) as f32 / 255.0, (v & 0xff) as f32 / 255.0))
    }

    fn descripcion(&self) -> String {
        match self.ranura {
            Some(n) => format!("ViGEm XInput {}", n + 1),
            None => "ViGEm".into(),
        }
    }
}

/// Teclas con SendInput (codigos virtuales de [`TECLAS`]).
pub struct TecladoWindows;

impl Teclado for TecladoWindows {
    fn tecla(&mut self, indice: usize, pulsada: bool) -> io::Result<()> {
        let Some((_, _, vk)) = TECLAS.get(indice) else { return Ok(()) };
        let entrada = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: *vk as VIRTUAL_KEY,
                    wScan: 0,
                    dwFlags: if pulsada { 0 } else { KEYEVENTF_KEYUP },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        // SAFETY: un INPUT valido y su tamano real.
        let n = unsafe { SendInput(1, &entrada, std::mem::size_of::<INPUT>() as i32) };
        if n == 1 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }
}

/// ¿Esta instalado el driver ViGEmBus?
pub fn bus_instalado() -> bool {
    std::env::var_os("SystemRoot")
        .map(|r| std::path::PathBuf::from(r).join("System32").join("drivers").join("ViGEmBus.sys"))
        .is_some_and(|p| p.exists())
}

#[derive(Default)]
pub struct FabricaVigem {
    cliente: Mutex<Option<Arc<Cliente>>>,
}

impl FabricaVigem {
    fn cliente(&self) -> Result<Arc<Cliente>, ErrorSalida> {
        let mut c = self.cliente.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(c) = c.as_ref() {
            return Ok(Arc::clone(c));
        }
        let nuevo = Arc::new(Cliente::conectar()?);
        *c = Some(Arc::clone(&nuevo));
        Ok(nuevo)
    }
}

impl FabricaSalidas for FabricaVigem {
    fn disponibilidad(&self) -> Vec<Disponibilidad> {
        let fallo = if !bus_instalado() {
            Some(ErrorSalida::SinVigem)
        } else {
            self.cliente().err()
        };
        TipoSalida::VIRTUALES
            .into_iter()
            .map(|tipo| {
                let motivo = if tipo == TipoSalida::Switchpro {
                    Some(ErrorSalida::NoDisponible.to_string())
                } else {
                    fallo.as_ref().map(ToString::to_string)
                };
                Disponibilidad { tipo, disponible: motivo.is_none(), motivo }
            })
            .collect()
    }

    fn crear(&mut self, tipo: TipoSalida) -> Result<Box<dyn SalidaVirtual>, ErrorSalida> {
        if !matches!(tipo, TipoSalida::Xbox360 | TipoSalida::Dualshock4) {
            return Err(ErrorSalida::NoDisponible);
        }
        Ok(Box::new(SalidaVigem::crear(self.cliente()?, tipo)?))
    }

    fn teclado(&mut self) -> Result<Box<dyn Teclado>, ErrorSalida> {
        Ok(Box::new(TecladoWindows))
    }
}
