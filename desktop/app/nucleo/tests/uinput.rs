//! Prueba de integracion con un mando virtual (uinput). Necesita permiso de escritura en
//! `/dev/uinput` y de lectura en `/dev/input/event*` (grupo `input`), por eso va con `#[ignore]`:
//!
//! ```sh
//! cargo test -p gpm-nucleo --test uinput -- --ignored --nocapture
//! ```
#![cfg(target_os = "linux")]

use evdev::uinput::VirtualDevice;
use evdev::{
    AbsInfo, AbsoluteAxisCode, AttributeSet, BusType, EventType, InputEvent, InputId, KeyCode, UinputAbsSetup,
};
use nucleo::asistente::{ConfigAsistente, Fase, PASOS};
use nucleo::dispositivos::linux::FuenteEvdev;
use nucleo::dispositivos::{Cambio, ErrorMandos, Evento, FuenteMandos};
use nucleo::mapeo::almacen::AlmacenMapeos;
use nucleo::mapeo::auto::{auto_mapear, OrigenAuto};
use nucleo::mapeo::basedatos::BaseDatosSdl;
use nucleo::mapeo::sdl::guid_sdl;
use nucleo::mapeo::{Control, Fuente};
use nucleo::servicio::{ErrorServicio, OrigenMapeo, Servicio};
use std::time::{Duration, Instant};

const NOMBRE: &str = "GPM Mando de prueba uinput";
const VENDEDOR: u16 = 0x1209;
const PRODUCTO: u16 = 0x6770;

const BOTONES: [KeyCode; 11] = [
    KeyCode::BTN_SOUTH,
    KeyCode::BTN_EAST,
    KeyCode::BTN_NORTH,
    KeyCode::BTN_WEST,
    KeyCode::BTN_TL,
    KeyCode::BTN_TR,
    KeyCode::BTN_SELECT,
    KeyCode::BTN_START,
    KeyCode::BTN_MODE,
    KeyCode::BTN_THUMBL,
    KeyCode::BTN_THUMBR,
];

fn crear_mando() -> VirtualDevice {
    let mut teclas = AttributeSet::<KeyCode>::new();
    for k in BOTONES {
        teclas.insert(k);
    }
    let stick = AbsInfo::new(0, -32768, 32767, 16, 128, 0);
    let gatillo = AbsInfo::new(0, 0, 255, 0, 0, 0);
    let hat = AbsInfo::new(0, -1, 1, 0, 0, 0);
    let mut b = VirtualDevice::builder()
        .expect("no se puede abrir /dev/uinput (¿grupo input?)")
        .name(NOMBRE)
        .input_id(InputId::new(BusType::BUS_USB, VENDEDOR, PRODUCTO, 0x0001))
        .with_keys(&teclas)
        .unwrap();
    for (eje, info) in [
        (AbsoluteAxisCode::ABS_X, stick),
        (AbsoluteAxisCode::ABS_Y, stick),
        (AbsoluteAxisCode::ABS_Z, gatillo),
        (AbsoluteAxisCode::ABS_RX, stick),
        (AbsoluteAxisCode::ABS_RY, stick),
        (AbsoluteAxisCode::ABS_RZ, gatillo),
        (AbsoluteAxisCode::ABS_HAT0X, hat),
        (AbsoluteAxisCode::ABS_HAT0Y, hat),
    ] {
        b = b.with_absolute_axis(&UinputAbsSetup::new(eje, info)).unwrap();
    }
    b.build().unwrap()
}

fn tecla(k: KeyCode, v: i32) -> InputEvent {
    InputEvent::new(EventType::KEY.0, k.0, v)
}

fn eje(a: AbsoluteAxisCode, v: i32) -> InputEvent {
    InputEvent::new(EventType::ABSOLUTE.0, a.0, v)
}

/// Lee el servicio durante `ms` milisegundos y devuelve todos los eventos.
fn bombear(s: &mut Servicio, ms: u64) -> Vec<Evento> {
    let fin = Instant::now() + Duration::from_millis(ms);
    let mut todos = Vec::new();
    while Instant::now() < fin {
        todos.extend(s.sondear(Duration::from_millis(5)));
    }
    todos
}

fn carpeta_temporal() -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("gpm-uinput-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    d
}

#[test]
#[ignore = "necesita /dev/uinput; ejecutar con --ignored"]
fn mando_virtual_de_principio_a_fin() {
    let mut mando = crear_mando();
    let nodo = mando
        .enumerate_dev_nodes_blocking()
        .unwrap()
        .filter_map(Result::ok)
        .find(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("event")))
        .expect("el mando virtual no tiene nodo event");
    println!("mando virtual en {}", nodo.display());

    // 1. La fuente evdev lo encuentra (el nodo puede tardar un poco en tener permisos).
    let dir = carpeta_temporal();
    let mut fuente = FuenteEvdev::nueva();
    let mut eventos = Vec::new();
    let limite = Instant::now() + Duration::from_secs(5);
    let info = loop {
        fuente.sondear(Duration::from_millis(20), &mut eventos);
        if let Some(info) = fuente.mandos().into_iter().find(|m| m.ruta == nodo.to_string_lossy()) {
            break info;
        }
        assert!(Instant::now() < limite, "la fuente evdev no encontro el mando virtual");
    };
    println!(
        "encontrado: {} guid={} botones={} ejes={} hats={}",
        info.nombre,
        info.guid,
        info.botones.len(),
        info.ejes.len(),
        info.hats
    );
    assert_eq!(info.nombre, NOMBRE);
    assert_eq!((info.vendedor, info.producto), (VENDEDOR, PRODUCTO));
    assert_eq!(info.guid, guid_sdl(0x03, VENDEDOR, PRODUCTO, 0x0001, NOMBRE));
    assert_eq!((info.botones.len(), info.ejes.len(), info.hats), (11, 6, 1));
    assert_eq!(info.botones[0].nombre, "BTN_SOUTH");
    assert!(!info.vibracion);
    // Gatillos en reposo a -1, sticks en el centro.
    let estado = fuente.estado(info.id).unwrap();
    assert_eq!(estado.ejes[2], -1.0);
    assert!(estado.ejes[0].abs() < 0.01);

    // 2. Entradas en vivo.
    let id = info.id;
    let leer = |fuente: &mut FuenteEvdev| {
        let mut v = Vec::new();
        let fin = Instant::now() + Duration::from_millis(150);
        while Instant::now() < fin {
            fuente.sondear(Duration::from_millis(10), &mut v);
        }
        v.into_iter()
            .filter_map(|e| match e {
                Evento::Entrada { id: i, cambio } if i == id => Some(cambio),
                _ => None,
            })
            .collect::<Vec<_>>()
    };
    mando.emit(&[tecla(KeyCode::BTN_SOUTH, 1)]).unwrap();
    assert_eq!(leer(&mut fuente), vec![Cambio::Boton { indice: 0, pulsado: true }]);
    mando.emit(&[tecla(KeyCode::BTN_SOUTH, 0), eje(AbsoluteAxisCode::ABS_RZ, 255)]).unwrap();
    assert_eq!(
        leer(&mut fuente),
        vec![Cambio::Boton { indice: 0, pulsado: false }, Cambio::Eje { indice: 5, valor: 1.0 }]
    );
    mando.emit(&[eje(AbsoluteAxisCode::ABS_RZ, 0), eje(AbsoluteAxisCode::ABS_HAT0X, -1)]).unwrap();
    assert_eq!(leer(&mut fuente), vec![Cambio::Eje { indice: 5, valor: -1.0 }, Cambio::Hat { indice: 0, valor: 8 }]);
    mando.emit(&[eje(AbsoluteAxisCode::ABS_HAT0X, 0)]).unwrap();
    leer(&mut fuente);
    assert!(matches!(fuente.vibrar(id, 1.0, 1.0, Duration::from_millis(100)), Err(ErrorMandos::SinVibracion)));

    // 3. El asistente con pulsaciones guionizadas, a traves del servicio.
    let mut s = Servicio::nuevo(Box::new(fuente), BaseDatosSdl::vacia("Linux"), Some(AlmacenMapeos::en(&dir)))
        .con_config_asistente(ConfigAsistente { calibracion_ms: 150, ventana_ms: 60, ..Default::default() });
    s.asistente_iniciar(id).unwrap();
    bombear(&mut s, 250);
    let mut pulsar = |s: &mut Servicio, abajo: &[InputEvent], arriba: &[InputEvent]| {
        mando.emit(abajo).unwrap();
        bombear(s, 150);
        mando.emit(arriba).unwrap();
        bombear(s, 80);
    };
    use AbsoluteAxisCode as A;
    for paso in PASOS {
        let vista = s.instantanea(id).unwrap().asistente.unwrap();
        assert_eq!(vista.paso, Some(paso), "el asistente deberia pedir {paso:?}");
        let boton = |k: KeyCode| ([tecla(k, 1)], [tecla(k, 0)]);
        let (abajo, arriba) = match paso {
            Control::A => boton(KeyCode::BTN_SOUTH),
            Control::B => boton(KeyCode::BTN_EAST),
            Control::X => boton(KeyCode::BTN_NORTH),
            Control::Y => boton(KeyCode::BTN_WEST),
            Control::L1 => boton(KeyCode::BTN_TL),
            Control::R1 => boton(KeyCode::BTN_TR),
            Control::Select => boton(KeyCode::BTN_SELECT),
            Control::Start => boton(KeyCode::BTN_START),
            Control::Home => boton(KeyCode::BTN_MODE),
            Control::L3 => boton(KeyCode::BTN_THUMBL),
            Control::R3 => boton(KeyCode::BTN_THUMBR),
            Control::DpadUp => ([eje(A::ABS_HAT0Y, -1)], [eje(A::ABS_HAT0Y, 0)]),
            Control::DpadDown => ([eje(A::ABS_HAT0Y, 1)], [eje(A::ABS_HAT0Y, 0)]),
            Control::DpadLeft => ([eje(A::ABS_HAT0X, -1)], [eje(A::ABS_HAT0X, 0)]),
            Control::DpadRight => ([eje(A::ABS_HAT0X, 1)], [eje(A::ABS_HAT0X, 0)]),
            Control::L2 => ([eje(A::ABS_Z, 255)], [eje(A::ABS_Z, 0)]),
            Control::R2 => ([eje(A::ABS_RZ, 255)], [eje(A::ABS_RZ, 0)]),
            Control::LsX => ([eje(A::ABS_X, 32767)], [eje(A::ABS_X, 0)]),
            Control::LsY => ([eje(A::ABS_Y, 32767)], [eje(A::ABS_Y, 0)]),
            Control::RsX => ([eje(A::ABS_RX, 32767)], [eje(A::ABS_RX, 0)]),
            Control::RsY => ([eje(A::ABS_RY, 32767)], [eje(A::ABS_RY, 0)]),
        };
        pulsar(&mut s, &abajo, &arriba);
    }
    let vista = s.instantanea(id).unwrap().asistente.unwrap();
    assert_eq!(vista.fase, Fase::Terminado);
    let estado = s.asistente_aplicar(id).unwrap();
    assert_eq!(estado.origen, OrigenMapeo::Asistente);
    let m = estado.mapeo;
    assert_eq!(m.asignaciones.len(), 21);
    assert_eq!(m.asignaciones[&Control::L2], Fuente::eje(2));
    assert_eq!(m.asignaciones[&Control::DpadUp], Fuente::Hat { indice: 0, mascara: 1 });
    // Para este mando, el asistente y el automatico coinciden.
    let (auto, origen) = auto_mapear(&info, &BaseDatosSdl::vacia("Linux"));
    assert_eq!(origen, OrigenAuto::Heuristica);
    assert_eq!(auto.asignaciones, m.asignaciones);

    // 4. Guardar y volver a cargar.
    let (_, ruta) = s.guardar(id).unwrap();
    println!("mapeo guardado en {}", ruta.display());
    let cargado = AlmacenMapeos::en(&dir).cargar(&info.guid).unwrap().unwrap();
    assert_eq!(cargado, m);

    // 5. Al destruir el mando virtual, se detecta la desconexion.
    drop(mando);
    let eventos = bombear(&mut s, 500);
    assert!(eventos.iter().any(|e| matches!(e, Evento::Desconectado { id: i } if *i == id)), "{eventos:?}");
    assert!(matches!(s.mapeo(id), Err(ErrorServicio::NoEncontrado)));
    assert!(!s.mandos().iter().any(|m| m.id == id || m.ruta == nodo.to_string_lossy()));
    let _ = std::fs::remove_dir_all(dir);
}
