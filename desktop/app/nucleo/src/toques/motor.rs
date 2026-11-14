//! Envoltorio seguro del nucleo en C: un perfil (.conf) + el estado del mando -> toques.
//!
//! El nucleo tiene estado global (es el mismo codigo que el motor root de Android, que maneja un
//! solo mando), asi que solo puede haber un [`MotorToques`] a la vez en el proceso: crearlo
//! reserva el nucleo y soltarlo lo libera ([`ErrorToques::Ocupado`] si ya hay otro).
//!
//! El mando le llega como el de un Xbox 360 en Linux (driver xpad): A/B/X/Y = BTN_SOUTH/EAST/
//! NORTH/WEST, sticks en ABS_X/Y y ABS_RX/RY (-32768..32767, Y hacia abajo), gatillos en ABS_Z/RZ
//! (0..255) y cruceta en ABS_HAT0X/Y, que es lo que entienden los perfiles de la app. Los toques
//! salen en coordenadas 0..1 del rectangulo de destino ([`OpToque`]).

use super::ffi;
use crate::mapeo::acciones::SalidaPad;
use crate::salida::{a_rango, EstadoPad};
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_double, c_int, c_longlong};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

/// Una operacion de toque que pide el nucleo (u, v: 0..1 del destino; slot: dedo 0..9).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum OpToque {
    Abajo {
        slot: usize,
        u: f64,
        v: f64,
    },
    Mover {
        slot: usize,
        u: f64,
        v: f64,
    },
    Arriba {
        slot: usize,
    },
    /// Fin de un grupo de cambios (`tocando`: queda algun dedo apoyado).
    Sync {
        tocando: bool,
    },
    /// Vibracion corta del mando (0..1), si el perfil la pide (`rumble`).
    Vibrar(f64),
}

/// Lo que pide el mando ademas de toques en una vuelta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Peticiones {
    /// SELECT+START mantenidos 1 s: pausar o reanudar los toques.
    pub pausa: bool,
    /// SELECT+R1 / SELECT+L1: siguiente (+1) o anterior (-1) perfil del mismo juego.
    pub cambio: i32,
}

#[derive(Debug, thiserror::Error)]
pub enum ErrorToques {
    #[error("Los toques ya los está usando otro mando.")]
    Ocupado,
    #[error("No se pudo cargar el perfil de toques.")]
    Perfil,
}

/// Reserva del nucleo (un solo usuario a la vez).
static OCUPADO: AtomicBool = AtomicBool::new(false);
/// Toques pendientes que dejan los callbacks del nucleo.
static OPERACIONES: Mutex<Vec<OpToque>> = Mutex::new(Vec::new());
/// Reloj virtual para las pruebas (microsegundos; negativo = el reloj de verdad).
static RELOJ_VIRTUAL: AtomicI64 = AtomicI64::new(-1);
static INICIO: OnceLock<Instant> = OnceLock::new();

fn operaciones() -> std::sync::MutexGuard<'static, Vec<OpToque>> {
    OPERACIONES.lock().unwrap_or_else(|e| e.into_inner())
}

/// Usa un reloj virtual (pruebas) o vuelve al de verdad (`None`).
pub fn poner_reloj_virtual(us: Option<i64>) {
    RELOJ_VIRTUAL.store(us.unwrap_or(-1), Ordering::Release);
}

extern "C" fn reloj_us() -> c_longlong {
    let v = RELOJ_VIRTUAL.load(Ordering::Acquire);
    if v >= 0 {
        return v;
    }
    // El nucleo usa 0 como «sin hora»: el reloj empieza en 1 s.
    1_000_000 + INICIO.get_or_init(Instant::now).elapsed().as_micros() as c_longlong
}

extern "C" fn registro(linea: *const c_char) {
    if linea.is_null() {
        return;
    }
    // SAFETY: el nucleo pasa una cadena terminada en 0 que vive durante la llamada.
    let texto = unsafe { CStr::from_ptr(linea) }.to_string_lossy();
    log::debug!("nucleo de toques: {texto}");
}

extern "C" fn depurar() -> c_int {
    c_int::from(log::log_enabled!(log::Level::Debug))
}

fn hueco(slot: c_int) -> Option<usize> {
    usize::try_from(slot).ok().filter(|s| *s < ffi::NSLOTS)
}

extern "C" fn abajo(slot: c_int, u: c_double, v: c_double) {
    if let Some(slot) = hueco(slot) {
        operaciones().push(OpToque::Abajo { slot, u, v });
    }
}

extern "C" fn mover(slot: c_int, u: c_double, v: c_double) {
    if let Some(slot) = hueco(slot) {
        operaciones().push(OpToque::Mover { slot, u, v });
    }
}

extern "C" fn arriba(slot: c_int) {
    if let Some(slot) = hueco(slot) {
        operaciones().push(OpToque::Arriba { slot });
    }
}

extern "C" fn sync(tocando: c_int) {
    operaciones().push(OpToque::Sync { tocando: tocando != 0 });
}

extern "C" fn vibrar(nivel: c_double) {
    operaciones().push(OpToque::Vibrar(nivel.clamp(0.0, 1.0)));
}

static PLATAFORMA: ffi::Plataforma = ffi::Plataforma {
    reloj_us,
    log: Some(registro),
    depurar: Some(depurar),
    abajo,
    mover,
    arriba,
    sync,
    vibrar: Some(vibrar),
    aprendido: None,
};

/// Reserva el nucleo; `None` si ya lo usa otro.
fn reservar() -> Option<Reserva> {
    OCUPADO.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire).ok().map(|_| Reserva)
}

struct Reserva;

impl Drop for Reserva {
    fn drop(&mut self) {
        OCUPADO.store(false, Ordering::Release);
    }
}

/// Ruta de un archivo para `fopen` del nucleo. En Windows `fopen` usa la pagina de codigos ANSI:
/// si la ruta tiene caracteres fuera de ASCII se usa su nombre corto (8.3).
fn ruta_c(ruta: &Path) -> Option<CString> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        CString::new(ruta.as_os_str().as_bytes()).ok()
    }
    #[cfg(windows)]
    {
        let texto = ruta.to_str()?;
        if texto.is_ascii() {
            return CString::new(texto).ok();
        }
        let corta = crate::toques::ventanas::ruta_corta(ruta)?;
        corta.is_ascii().then(|| CString::new(corta).ok()).flatten()
    }
    #[cfg(not(any(unix, windows)))]
    {
        CString::new(ruta.to_str()?).ok()
    }
}

/// Codigos de Linux de los botones del mando (como xpad).
const BOTONES: [(SalidaPad, c_int); 11] = [
    (SalidaPad::A, 0x130),      // BTN_SOUTH
    (SalidaPad::B, 0x131),      // BTN_EAST
    (SalidaPad::X, 0x133),      // BTN_NORTH (BTN_X)
    (SalidaPad::Y, 0x134),      // BTN_WEST (BTN_Y)
    (SalidaPad::L1, 0x136),     // BTN_TL
    (SalidaPad::R1, 0x137),     // BTN_TR
    (SalidaPad::Select, 0x13a), // BTN_SELECT
    (SalidaPad::Start, 0x13b),  // BTN_START
    (SalidaPad::Home, 0x13c),   // BTN_MODE
    (SalidaPad::L3, 0x13d),     // BTN_THUMBL
    (SalidaPad::R3, 0x13e),     // BTN_THUMBR
];

const ABS_X: usize = 0x00;
const ABS_Y: usize = 0x01;
const ABS_Z: usize = 0x02;
const ABS_RX: usize = 0x03;
const ABS_RY: usize = 0x04;
const ABS_RZ: usize = 0x05;
const ABS_HAT0X: usize = 0x10;
const ABS_HAT0Y: usize = 0x11;
const EJES: [usize; 8] = [ABS_X, ABS_Y, ABS_Z, ABS_RX, ABS_RY, ABS_RZ, ABS_HAT0X, ABS_HAT0Y];

/// El mando en codigos de Linux.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
struct Crudo {
    botones: [bool; BOTONES.len()],
    ejes: [i32; EJES.len()],
}

impl Crudo {
    fn de(pad: &EstadoPad) -> Self {
        let mut c = Crudo::default();
        for (i, (s, _)) in BOTONES.iter().enumerate() {
            c.botones[i] = pad.pulsado(*s);
        }
        let stick = |v: f32| a_rango(v, -32768, 0, 32767);
        let gatillo = |v: f32| if v.is_finite() { (v.clamp(0.0, 1.0) * 255.0).round() as i32 } else { 0 };
        let (hx, hy) = pad.cruceta_xy();
        c.ejes = [
            stick(pad.ls[0]),
            stick(pad.ls[1]),
            gatillo(pad.l2),
            stick(pad.rs[0]),
            stick(pad.rs[1]),
            gatillo(pad.r2),
            hx,
            hy,
        ];
        c
    }
}

/// Un perfil cargado en el nucleo. Ver el modulo.
pub struct MotorToques {
    perfil: *mut ffi::PerfilC,
    previo: Crudo,
    paquete: String,
    nombre: String,
    pantalla: (f64, f64),
    _reserva: Reserva,
}

// SAFETY: el perfil solo se toca a traves de &mut self y el nucleo global esta reservado por esta
// instancia (Reserva): nunca hay dos hilos dentro del nucleo a la vez.
unsafe impl Send for MotorToques {}

fn texto_c(p: *const c_char) -> String {
    if p.is_null() {
        return String::new();
    }
    // SAFETY: el puente devuelve punteros a cadenas terminadas en 0 dentro del perfil vivo.
    unsafe { CStr::from_ptr(p) }.to_string_lossy().into_owned()
}

impl MotorToques {
    /// Carga un perfil (.conf ya validado) y prepara el nucleo con un mando estandar.
    pub fn nuevo(ruta: &Path) -> Result<Self, ErrorToques> {
        let reserva = reservar().ok_or(ErrorToques::Ocupado)?;
        let ruta = ruta_c(ruta).ok_or(ErrorToques::Perfil)?;
        // SAFETY: PLATAFORMA es estatica (vive siempre); el nucleo esta reservado.
        unsafe { ffi::gpm_plataforma(&PLATAFORMA) };
        operaciones().clear();
        // SAFETY: reserva memoria en C; se comprueba el puntero.
        let perfil = unsafe { ffi::gpmr_perfil_nuevo() };
        if perfil.is_null() {
            return Err(ErrorToques::Perfil);
        }
        // SAFETY: ruta terminada en 0 y perfil recien reservado (gpm_cargar_perfil lo rellena y, si
        // falla, deja sus listas liberadas).
        if unsafe { ffi::gpm_cargar_perfil(ruta.as_ptr(), perfil) } != 0 {
            // SAFETY: perfil reservado arriba y no usado por el nucleo.
            unsafe { ffi::gpmr_perfil_borrar(perfil) };
            return Err(ErrorToques::Perfil);
        }
        // SAFETY: perfil cargado; se lee con el puente.
        let (paquete, nombre, pantalla) = unsafe {
            (
                texto_c(ffi::gpmr_perfil_paquete(perfil)),
                texto_c(ffi::gpmr_perfil_nombre(perfil)),
                (ffi::gpmr_perfil_ancho(perfil), ffi::gpmr_perfil_alto(perfil)),
            )
        };
        let mut ejes = [ffi::Eje::default(); ffi::ABS_CNT];
        for e in [ABS_X, ABS_Y, ABS_RX, ABS_RY] {
            ejes[e] = ffi::Eje { tiene: 1, minimo: -32768, maximo: 32767, valor: 0 };
        }
        for e in [ABS_Z, ABS_RZ] {
            ejes[e] = ffi::Eje { tiene: 1, minimo: 0, maximo: 255, valor: 0 };
        }
        for e in [ABS_HAT0X, ABS_HAT0Y] {
            ejes[e] = ffi::Eje { tiene: 1, minimo: -1, maximo: 1, valor: 0 };
        }
        // SAFETY: el perfil vive mientras viva el motor (se quita en Drop antes de liberarlo); los
        // ejes son un arreglo de ABS_CNT elementos como espera gpm_mando_nuevo.
        unsafe {
            ffi::gpm_usar_perfil(perfil);
            ffi::gpm_destino_fijo(0.0, 0.0);
            ffi::gpm_mando_nuevo(ejes.as_ptr());
            ffi::gpm_reiniciar_ticks();
        }
        Ok(Self { perfil, previo: Crudo::default(), paquete, nombre, pantalla, _reserva: reserva })
    }

    /// Paquete del juego (`package`).
    pub fn paquete(&self) -> &str {
        &self.paquete
    }

    /// Nombre visible del perfil (`name`), puede estar vacio.
    pub fn nombre(&self) -> &str {
        &self.nombre
    }

    /// Pantalla de referencia del perfil (`screen`).
    pub fn pantalla(&self) -> (f64, f64) {
        self.pantalla
    }

    fn sacar(&self) -> Vec<OpToque> {
        std::mem::take(&mut *operaciones())
    }

    /// Tamano del rectangulo de destino en pixeles (los toques se adaptan a el como en el movil).
    /// Suelta antes los dedos apoyados.
    pub fn destino(&mut self, ancho: u32, alto: u32) -> Vec<OpToque> {
        // SAFETY: nucleo reservado por esta instancia.
        unsafe {
            ffi::gpm_soltar_todo();
            ffi::gpm_destino_fijo(f64::from(ancho.max(2)), f64::from(alto.max(2)));
        }
        self.sacar()
    }

    /// Levanta todos los dedos (al pausar, perder el foco o cambiar de destino).
    pub fn soltar_todo(&mut self) -> Vec<OpToque> {
        // SAFETY: nucleo reservado por esta instancia.
        unsafe { ffi::gpm_soltar_todo() };
        self.sacar()
    }

    /// Estado nuevo del mando. Con `mapear` = false el nucleo solo sigue el estado (sin toques).
    pub fn mando(&mut self, pad: &EstadoPad, mapear: bool) -> Vec<OpToque> {
        let nuevo = Crudo::de(pad);
        if nuevo != self.previo {
            let m = c_int::from(mapear);
            // SAFETY: nucleo reservado; codigos dentro de los rangos del nucleo.
            unsafe {
                for (i, (_, codigo)) in BOTONES.iter().enumerate() {
                    if nuevo.botones[i] != self.previo.botones[i] {
                        ffi::gpm_evento(ffi::EV_KEY, *codigo, c_int::from(nuevo.botones[i]), m);
                    }
                }
                for (i, eje) in EJES.iter().enumerate() {
                    if nuevo.ejes[i] != self.previo.ejes[i] {
                        ffi::gpm_evento(ffi::EV_ABS, *eje as c_int, nuevo.ejes[i], m);
                    }
                }
                ffi::gpm_evento(ffi::EV_SYN, ffi::SYN_REPORT, 0, m);
            }
            self.previo = nuevo;
        }
        self.sacar()
    }

    /// Una vuelta del bucle: combos del mando, macros pendientes y lo que depende del tiempo
    /// (camara, turbo, deslizar). `activo`: se esta mapeando.
    pub fn vuelta(&mut self, activo: bool) -> (Vec<OpToque>, Peticiones) {
        // SAFETY: nucleo reservado por esta instancia.
        let peticiones = unsafe {
            let pausa = ffi::gpm_combo_pausa(1) != 0;
            let cambio = ffi::gpm_cambio_pedido();
            if activo {
                ffi::gpm_macros();
            }
            ffi::gpm_ticks(c_int::from(activo));
            Peticiones { pausa, cambio }
        };
        (self.sacar(), peticiones)
    }

    /// Cada cuantos ms hay trabajo periodico (0 = ninguno).
    pub fn intervalo_ms(&self) -> u32 {
        // SAFETY: solo lee estado del nucleo reservado.
        u32::try_from(unsafe { ffi::gpm_intervalo_ms() }).unwrap_or(0)
    }
}

impl Drop for MotorToques {
    fn drop(&mut self) {
        // SAFETY: el nucleo deja de apuntar al perfil antes de liberarlo.
        unsafe {
            ffi::gpm_soltar_todo();
            ffi::gpm_usar_perfil(std::ptr::null());
            ffi::gpm_destino_fijo(0.0, 0.0);
            ffi::gpmr_perfil_borrar(self.perfil);
        }
        operaciones().clear();
    }
}

/// Adapta un punto del perfil (pantalla `sw`x`sh`) a un destino `w`x`h`, con la misma formula que
/// la app de Android (`Profile.fitX/fitY`).
pub fn adaptar(x: f64, y: f64, sw: f64, sh: f64, w: f64, h: f64) -> (f64, f64) {
    // SAFETY: funciones puras del nucleo (sin estado).
    unsafe { (ffi::gpm_fit_x(x, sw, sh, w, h), ffi::gpm_fit_y(y, sw, sh, w, h)) }
}

/// Repite un guion de `tests/engine` como `gpmapper -r` y devuelve lo que escribe. Solo en
/// sistemas POSIX (redirige la salida estandar del proceso mientras dura). Espera a que el nucleo
/// quede libre.
#[cfg(unix)]
pub fn repetir(perfil: &Path, guion: &Path, salida: &Path) -> Result<String, ErrorToques> {
    let _reserva = loop {
        if let Some(r) = reservar() {
            break r;
        }
        std::thread::sleep(std::time::Duration::from_millis(5));
    };
    let (p, g, s) = (ruta_c(perfil), ruta_c(guion), ruta_c(salida));
    let (Some(p), Some(g), Some(s)) = (p, g, s) else { return Err(ErrorToques::Perfil) };
    // SAFETY: cadenas terminadas en 0; gpm_repetir instala su propia plataforma (se vuelve a poner
    // la nuestra al crear el siguiente motor).
    let r = unsafe { ffi::gpmr_repetir_a_archivo(p.as_ptr(), g.as_ptr(), s.as_ptr()) };
    if r != 0 {
        return Err(ErrorToques::Perfil);
    }
    std::fs::read_to_string(salida).map_err(|_| ErrorToques::Perfil)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn perfil_prueba(nombre: &str) -> std::path::PathBuf {
        let ruta = std::env::temp_dir().join(format!("gpm-toques-{nombre}-{}.conf", std::process::id()));
        std::fs::write(
            &ruta,
            "package = com.prueba.motor\nname = Motor\nscreen = 2400x1080\nA = tap 1932 960\nLS = stick 344 828 112\n",
        )
        .unwrap();
        ruta
    }

    #[test]
    fn toque_por_ffi_y_reserva() {
        let ruta = perfil_prueba("ffi");
        // Puede haber otra prueba usando el nucleo: se espera turno.
        let mut m = loop {
            match MotorToques::nuevo(&ruta) {
                Ok(m) => break m,
                Err(ErrorToques::Ocupado) => std::thread::sleep(std::time::Duration::from_millis(5)),
                Err(e) => panic!("{e}"),
            }
        };
        assert!(matches!(MotorToques::nuevo(&ruta), Err(ErrorToques::Ocupado)));
        assert_eq!(m.paquete(), "com.prueba.motor");
        assert_eq!(m.nombre(), "Motor");
        assert_eq!(m.pantalla(), (2400.0, 1080.0));
        assert!(m.destino(1200, 540).is_empty());
        let mut pad = EstadoPad::default();
        pad.aplicar(SalidaPad::A, 1.0);
        let ops = m.mando(&pad, true);
        let (u, v) = (966.0 / 1199.0, 480.0 / 539.0);
        match ops.as_slice() {
            [OpToque::Abajo { slot: 0, u: a, v: b }, OpToque::Sync { tocando: true }] => {
                assert!((a - u).abs() < 1e-3 && (b - v).abs() < 1e-3, "{a} {b}");
            }
            otro => panic!("{otro:?}"),
        }
        // Sin cambios no hay eventos; al soltar, el dedo se levanta.
        assert!(m.mando(&pad, true).is_empty());
        assert_eq!(
            m.mando(&EstadoPad::default(), true),
            vec![OpToque::Arriba { slot: 0 }, OpToque::Sync { tocando: false }]
        );
        // Sin mapear no hay toques.
        assert!(m.mando(&pad, false).is_empty());
        drop(m);
        let _ = std::fs::remove_file(ruta);
    }

    #[test]
    fn perfil_que_no_existe() {
        let r = MotorToques::nuevo(Path::new("/no/existe.conf"));
        assert!(matches!(r, Err(ErrorToques::Perfil) | Err(ErrorToques::Ocupado)));
    }

    #[test]
    fn adapta_como_la_app() {
        // tests/run.sh: misma proporcion y 21:9 (+160 px a la derecha en el borde derecho).
        let (x, y) = adaptar(1932.0, 960.0, 2400.0, 1080.0, 2560.0, 1080.0);
        assert!((x - 2092.0).abs() < 0.01 && (y - 960.0).abs() < 0.01);
        let (x, _) = adaptar(1932.0, 960.0, 2400.0, 1080.0, 1200.0, 540.0);
        assert!((x - 966.0).abs() < 0.01);
    }
}
