//! Toques de verdad (uinput) sin tocar el escritorio: un mando «fisico» de prueba (uinput) entra
//! por la fuente evdev, el servicio crea la pantalla tactil virtual y la prueba la CAPTURA
//! (EVIOCGRAB) antes de que reciba ningun toque, asi la sesion grafica nunca los ve. Luego se
//! comprueba que cada toque cae en el rectangulo de destino de mentira, con la formula de la app.
//!
//! ```sh
//! cargo test -p gpm-nucleo --test toques_uinput -- --ignored --nocapture --test-threads=1
//! ```
#![cfg(target_os = "linux")]

use evdev::uinput::VirtualDevice;
use evdev::{
    AbsInfo, AbsoluteAxisCode as A, AttributeSet, BusType, Device, EventType, InputEvent, InputId, KeyCode as K,
    PropType, UinputAbsSetup,
};
use nucleo::dispositivos::linux::FuenteEvdev;
use nucleo::dispositivos::IdMando;
use nucleo::mapeo::basedatos::BaseDatosSdl;
use nucleo::salida::linux::FabricaUinput;
use nucleo::salida::pantalla_linux::PantallaUinput;
use nucleo::salida::{Disponibilidad, ErrorSalida, FabricaSalidas, PantallaToques, SalidaVirtual, Teclado, TipoSalida};
use nucleo::servicio::Servicio;
use nucleo::toques::config::{AjusteToques, DestinoToques};
use nucleo::toques::perfiles::AlmacenPerfiles;
use nucleo::toques::ventanas::Rect;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// Rectangulo de destino de mentira (como si fuera la ventana del juego).
const RECT: Rect = Rect { x: 300, y: 200, ancho: 1200, alto: 540 };
const PERFIL: &str = "package = com.prueba.juego\nname = Uinput\nscreen = 2400x1080\nA = tap 1932 960\n\
                      LS = stick 344 828 112\n";

/// La fabrica de verdad, pero con una pantalla de nombre propio y escritorio fijo.
struct FabricaPrueba(FabricaUinput, String);

impl FabricaSalidas for FabricaPrueba {
    fn disponibilidad(&self) -> Vec<Disponibilidad> {
        self.0.disponibilidad()
    }
    fn crear(&mut self, tipo: TipoSalida) -> Result<Box<dyn SalidaVirtual>, ErrorSalida> {
        self.0.crear(tipo)
    }
    fn teclado(&mut self) -> Result<Box<dyn Teclado>, ErrorSalida> {
        self.0.teclado()
    }
    fn pantalla_toques(&mut self) -> Result<Box<dyn PantallaToques>, ErrorSalida> {
        Ok(Box::new(PantallaUinput::crear(&self.1, 1920, 1080)?))
    }
}

fn mando_fisico(nombre: &str) -> VirtualDevice {
    let mut teclas = AttributeSet::<K>::new();
    for k in [
        K::BTN_SOUTH,
        K::BTN_EAST,
        K::BTN_NORTH,
        K::BTN_WEST,
        K::BTN_TL,
        K::BTN_TR,
        K::BTN_SELECT,
        K::BTN_START,
        K::BTN_MODE,
        K::BTN_THUMBL,
        K::BTN_THUMBR,
    ] {
        teclas.insert(k);
    }
    let stick = AbsInfo::new(0, -32768, 32767, 16, 128, 0);
    let gatillo = AbsInfo::new(0, 0, 255, 0, 0, 0);
    let hat = AbsInfo::new(0, -1, 1, 0, 0, 0);
    let mut b = VirtualDevice::builder()
        .expect("no se puede abrir /dev/uinput")
        .name(nombre)
        .input_id(InputId::new(BusType::BUS_USB, 0x1209, 0x6790, 1))
        .with_keys(&teclas)
        .unwrap();
    for (eje, info) in [
        (A::ABS_X, stick),
        (A::ABS_Y, stick),
        (A::ABS_Z, gatillo),
        (A::ABS_RX, stick),
        (A::ABS_RY, stick),
        (A::ABS_RZ, gatillo),
        (A::ABS_HAT0X, hat),
        (A::ABS_HAT0Y, hat),
    ] {
        b = b.with_absolute_axis(&UinputAbsSetup::new(eje, info)).unwrap();
    }
    b.build().unwrap()
}

fn nodo_de(dev: &mut VirtualDevice) -> PathBuf {
    dev.enumerate_dev_nodes_blocking()
        .unwrap()
        .filter_map(Result::ok)
        .find(|p| p.to_string_lossy().contains("event"))
        .expect("sin nodo event")
}

fn bombear(s: &mut Servicio, ms: u64) {
    let fin = Instant::now() + Duration::from_millis(ms);
    while Instant::now() < fin {
        s.sondear(Duration::from_millis(2));
    }
}

/// Abre un nodo de /dev/input (puede tardar en tener permisos).
fn abrir(nodo: &Path) -> Device {
    let limite = Instant::now() + Duration::from_secs(3);
    loop {
        match Device::open(nodo) {
            Ok(d) => return d,
            Err(e) => {
                assert!(Instant::now() < limite, "no se puede abrir {}: {e}", nodo.display());
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

/// Eventos de la pantalla tactil (tipo, codigo, valor), sin los SYN.
fn leer(p: &mut Device) -> Vec<(u16, u16, i32)> {
    match p.fetch_events() {
        Ok(it) => it
            .filter(|e| e.event_type() != EventType::SYNCHRONIZATION)
            .map(|e| (e.event_type().0, e.code(), e.value()))
            .collect(),
        Err(_) => Vec::new(),
    }
}

fn valor(ev: &[(u16, u16, i32)], tipo: EventType, codigo: u16) -> Option<i32> {
    ev.iter().rev().find(|(t, c, _)| *t == tipo.0 && *c == codigo).map(|(_, _, v)| *v)
}

fn dentro(x: i32, y: i32) -> bool {
    (RECT.x..RECT.x + RECT.ancho as i32).contains(&x) && (RECT.y..RECT.y + RECT.alto as i32).contains(&y)
}

fn servicio_con(nodo: &Path, nombre_pantalla: &str, dir: &Path) -> (Servicio, IdMando) {
    let mut s = Servicio::nuevo(Box::new(FuenteEvdev::nueva()), BaseDatosSdl::vacia("Linux"), None)
        .con_salidas(Box::new(FabricaPrueba(FabricaUinput, nombre_pantalla.to_owned())))
        .con_toques(AlmacenPerfiles::en(dir), None);
    let limite = Instant::now() + Duration::from_secs(5);
    loop {
        s.sondear(Duration::from_millis(20));
        if let Some(m) = s.mandos().into_iter().find(|m| m.ruta == nodo.to_string_lossy()) {
            return (s, m.id);
        }
        assert!(Instant::now() < limite, "no aparece el mando de prueba");
    }
}

#[test]
#[ignore = "necesita /dev/uinput; ejecutar con --ignored"]
fn toques_en_el_rectangulo_sin_llegar_al_escritorio() {
    let dir = std::env::temp_dir().join(format!("gpm-toques-uinput-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let nombre_pantalla = format!("GPM prueba toques {}", std::process::id());
    let mut fisico = mando_fisico("GPM Fisico de prueba toques");
    let nodo_fisico = nodo_de(&mut fisico);
    let (mut s, id) = servicio_con(&nodo_fisico, &nombre_pantalla, &dir);
    let perfil = s.importar_perfil_toques(PERFIL).unwrap();

    // 1) Salida «Toques» SIN perfil todavia: se crea la pantalla, pero no puede tocar nada.
    let mut m = s.mapeo(id).unwrap().mapeo;
    m.salida = TipoSalida::Toques;
    m.stick_izquierdo.zona_muerta = 0.0;
    m.toques = AjusteToques { destino: DestinoToques::Rectangulo(RECT), solo_con_foco: true };
    s.editar_mapeo(id, m).unwrap();
    let vista = s.vista_salida(id);
    assert!(vista.activa, "{:?}", vista.error);
    assert!(!s.estado_toques().mapeando);
    let nodo_pantalla = PathBuf::from(vista.descripcion.unwrap());

    // 2) La prueba captura la pantalla tactil ANTES del primer toque: el escritorio no ve nada.
    let mut pantalla = abrir(&nodo_pantalla);
    assert_eq!(pantalla.name(), Some(nombre_pantalla.as_str()));
    pantalla.grab().expect("no se pudo capturar la pantalla de toques: la prueba no sigue");
    pantalla.set_nonblocking(true).unwrap();
    assert!(pantalla.properties().contains(PropType::DIRECT));
    let abs = pantalla.get_abs_state().unwrap();
    assert_eq!(
        (abs[A::ABS_MT_POSITION_X.0 as usize].maximum, abs[A::ABS_MT_POSITION_Y.0 as usize].maximum),
        (1919, 1079)
    );
    assert!(leer(&mut pantalla).is_empty());

    // 3) Ahora si: perfil fijado -> se toca y el mando fisico queda capturado.
    let mut c = s.config_toques();
    c.adb = false;
    c.fijo = Some(perfil.id.clone());
    s.guardar_config_toques(c).unwrap();
    let e = s.estado_toques();
    assert!(e.mapeando, "{e:?}");
    assert_eq!(e.destino, Some(RECT));
    let mut otro = Device::open(&nodo_fisico).unwrap();
    assert!(otro.grab().is_err(), "el mando fisico deberia estar capturado");
    drop(otro);

    // A -> toque en (1932, 960) del perfil 2400x1080 adaptado a 1200x540: (966, 480) + origen.
    let inicio = Instant::now();
    fisico.emit(&[InputEvent::new(EventType::KEY.0, K::BTN_SOUTH.0, 1)]).unwrap();
    let mut ev = Vec::new();
    while valor(&ev, EventType::KEY, K::BTN_TOUCH.0) != Some(1) && inicio.elapsed() < Duration::from_secs(2) {
        s.sondear(Duration::from_millis(2));
        ev.extend(leer(&mut pantalla));
    }
    let latencia = inicio.elapsed();
    let (x, y) = (
        valor(&ev, EventType::ABSOLUTE, A::ABS_MT_POSITION_X.0),
        valor(&ev, EventType::ABSOLUTE, A::ABS_MT_POSITION_Y.0),
    );
    println!("A -> {ev:?} en {latencia:?}");
    assert_eq!((x, y), (Some(RECT.x + 966), Some(RECT.y + 480)));
    assert!(dentro(x.unwrap(), y.unwrap()));
    // (El kernel no repite ABS_MT_SLOT si ya era 0.)
    assert!(matches!(valor(&ev, EventType::ABSOLUTE, A::ABS_MT_SLOT.0), None | Some(0)));
    assert!(valor(&ev, EventType::ABSOLUTE, A::ABS_MT_TRACKING_ID.0).is_some_and(|t| t > 0));

    fisico.emit(&[InputEvent::new(EventType::KEY.0, K::BTN_SOUTH.0, 0)]).unwrap();
    bombear(&mut s, 60);
    let ev = leer(&mut pantalla);
    assert_eq!(valor(&ev, EventType::ABSOLUTE, A::ABS_MT_TRACKING_ID.0), Some(-1), "{ev:?}");
    assert_eq!(valor(&ev, EventType::KEY, K::BTN_TOUCH.0), Some(0));

    // Stick izquierdo a la derecha: el dedo se apoya en el centro del stick y se mueve a la derecha,
    // siempre dentro del rectangulo.
    fisico.emit(&[InputEvent::new(EventType::ABSOLUTE.0, A::ABS_X.0, 32767)]).unwrap();
    bombear(&mut s, 120);
    let ev = leer(&mut pantalla);
    let xs: Vec<i32> = ev
        .iter()
        .filter(|(t, c, _)| *t == EventType::ABSOLUTE.0 && *c == A::ABS_MT_POSITION_X.0)
        .map(|e| e.2)
        .collect();
    let ys: Vec<i32> = ev
        .iter()
        .filter(|(t, c, _)| *t == EventType::ABSOLUTE.0 && *c == A::ABS_MT_POSITION_Y.0)
        .map(|e| e.2)
        .collect();
    println!("LS -> x {xs:?} y {ys:?}");
    assert!(!xs.is_empty() && xs.iter().zip(ys.iter().chain(std::iter::repeat(&ys[0]))).all(|(x, y)| dentro(*x, *y)));
    // Centro del stick (344, 828) -> (172, 414) + origen; a tope, 112 px del perfil (56 en destino) a la derecha.
    assert_eq!(xs[0], RECT.x + 172);
    assert_eq!(*xs.last().unwrap(), RECT.x + 172 + 56);

    // 4) Pausa: se levanta el dedo y se suelta el mando fisico.
    s.pausar_toques(true);
    let ev = leer(&mut pantalla);
    assert_eq!(valor(&ev, EventType::ABSOLUTE, A::ABS_MT_TRACKING_ID.0), Some(-1), "{ev:?}");
    let mut otro = Device::open(&nodo_fisico).unwrap();
    otro.grab().expect("en pausa el mando fisico debe estar libre");
    otro.ungrab().unwrap();
    drop(otro);
    // En pausa el mando no toca.
    fisico.emit(&[InputEvent::new(EventType::KEY.0, K::BTN_SOUTH.0, 1)]).unwrap();
    bombear(&mut s, 60);
    assert!(leer(&mut pantalla).is_empty());

    // 5) Fin: se suelta todo, se reanuda y al quitar la salida desaparece la pantalla.
    fisico
        .emit(&[
            InputEvent::new(EventType::KEY.0, K::BTN_SOUTH.0, 0),
            InputEvent::new(EventType::ABSOLUTE.0, A::ABS_X.0, 0),
        ])
        .unwrap();
    bombear(&mut s, 60);
    s.pausar_toques(false);
    let mut m = s.mapeo(id).unwrap().mapeo;
    m.salida = TipoSalida::Ninguna;
    s.editar_mapeo(id, m).unwrap();
    bombear(&mut s, 50);
    assert!(s.estado_toques().mando.is_none());
    assert!(leer(&mut pantalla).is_empty());
    drop(s);
    let _ = std::fs::remove_dir_all(dir);
}
