//! Mandos virtuales de verdad (uinput): un mando «fisico» de prueba (tambien uinput) entra por la
//! fuente evdev, el servicio crea un Xbox 360 / DualShock 4 / Switch Pro virtual y aqui se lee ese
//! mando virtual como lo haria un juego. Necesita /dev/uinput y leer /dev/input (grupo `input`):
//!
//! ```sh
//! cargo test -p gpm-nucleo --test salida_uinput -- --ignored --nocapture --test-threads=1
//! ```
#![cfg(target_os = "linux")]

use evdev::uinput::VirtualDevice;
use evdev::{
    AbsInfo, AbsoluteAxisCode as A, AttributeSet, BusType, Device, EventSummary, EventType, FFEffectCode, FFEffectData,
    FFEffectKind, FFReplay, FFTrigger, InputEvent, InputId, KeyCode as K, UInputCode, UinputAbsSetup,
};
use nucleo::dispositivos::linux::FuenteEvdev;
use nucleo::dispositivos::IdMando;
use nucleo::mapeo::acciones::{Accion, Capa, Entrada, Macro, Modo, PasoMacro, SalidaPad};
use nucleo::mapeo::basedatos::BaseDatosSdl;
use nucleo::mapeo::Control;
use nucleo::salida::linux::FabricaUinput;
use nucleo::salida::TipoSalida;
use nucleo::servicio::Servicio;
use std::os::fd::AsRawFd;
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

const BOTONES: [K; 11] = [
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
];

/// Mando «fisico» de prueba (como el de tests/uinput.rs), opcionalmente con vibracion.
fn mando_fisico(nombre: &str, producto: u16, vibracion: bool) -> VirtualDevice {
    let mut teclas = AttributeSet::<K>::new();
    for k in BOTONES {
        teclas.insert(k);
    }
    let stick = AbsInfo::new(0, -32768, 32767, 16, 128, 0);
    let gatillo = AbsInfo::new(0, 0, 255, 0, 0, 0);
    let hat = AbsInfo::new(0, -1, 1, 0, 0, 0);
    let mut b = VirtualDevice::builder()
        .expect("no se puede abrir /dev/uinput")
        .name(nombre)
        .input_id(InputId::new(BusType::BUS_USB, 0x1209, producto, 1))
        .with_keys(&teclas)
        .unwrap();
    if vibracion {
        let mut ff = AttributeSet::<FFEffectCode>::new();
        ff.insert(FFEffectCode::FF_RUMBLE);
        b = b.with_ff(&ff).unwrap().with_ff_effects_max(4);
    }
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

fn tecla(k: K, v: i32) -> InputEvent {
    InputEvent::new(EventType::KEY.0, k.0, v)
}

fn bombear(s: &mut Servicio, ms: u64) {
    let fin = Instant::now() + Duration::from_millis(ms);
    while Instant::now() < fin {
        s.sondear(Duration::from_millis(2));
    }
}

/// Servicio con la fuente evdev y la fabrica uinput reales, y el id del mando de prueba.
fn servicio_con(nodo: &Path) -> (Servicio, IdMando) {
    let mut s = Servicio::nuevo(Box::new(FuenteEvdev::nueva()), BaseDatosSdl::vacia("Linux"), None)
        .con_salidas(Box::new(FabricaUinput));
    let limite = Instant::now() + Duration::from_secs(5);
    loop {
        s.sondear(Duration::from_millis(20));
        if let Some(m) = s.mandos().into_iter().find(|m| m.ruta == nodo.to_string_lossy()) {
            return (s, m.id);
        }
        assert!(Instant::now() < limite, "no aparece el mando de prueba");
    }
}

fn poner_salida(s: &mut Servicio, id: IdMando, tipo: TipoSalida) -> PathBuf {
    let mut m = s.mapeo(id).unwrap().mapeo;
    m.salida = tipo;
    m.stick_izquierdo.zona_muerta = 0.0;
    s.editar_mapeo(id, m).unwrap();
    let vista = s.vista_salida(id);
    assert!(vista.activa, "{:?}", vista.error);
    PathBuf::from(vista.descripcion.unwrap())
}

/// Abre el mando virtual como un juego (el nodo puede tardar en tener permisos).
fn abrir_como_juego(nodo: &Path) -> Device {
    let limite = Instant::now() + Duration::from_secs(3);
    loop {
        match Device::open(nodo) {
            Ok(d) => {
                d.set_nonblocking(true).unwrap();
                return d;
            }
            Err(e) => {
                assert!(Instant::now() < limite, "no se puede abrir {}: {e}", nodo.display());
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

/// Eventos de tecla y eje que ha recibido el «juego».
fn leer(juego: &mut Device) -> Vec<(u16, u16, i32)> {
    match juego.fetch_events() {
        Ok(it) => it
            .filter(|e| e.event_type() == EventType::KEY || e.event_type() == EventType::ABSOLUTE)
            .map(|e| (e.event_type().0, e.code(), e.value()))
            .collect(),
        Err(_) => Vec::new(),
    }
}

fn pulsado(juego: &Device, k: K) -> bool {
    juego.get_key_state().unwrap().contains(k)
}

#[test]
#[ignore = "necesita /dev/uinput; ejecutar con --ignored"]
fn tres_tipos_con_ids_capacidades_captura_y_exclusion() {
    let mut fisico = mando_fisico("GPM Fisico de prueba A", 0x6780, false);
    let nodo_fisico = nodo_de(&mut fisico);
    let (mut s, id) = servicio_con(&nodo_fisico);

    for (tipo, nombre, vendedor, producto, version) in [
        (TipoSalida::Xbox360, "Microsoft X-Box 360 pad", 0x045e, 0x028e, 0x0114),
        (TipoSalida::Dualshock4, "Sony Interactive Entertainment Wireless Controller", 0x054c, 0x09cc, 0x8111),
        (TipoSalida::Switchpro, "Nintendo Switch Pro Controller", 0x057e, 0x2009, 0x8111),
    ] {
        let nodo = poner_salida(&mut s, id, tipo);
        let juego = abrir_como_juego(&nodo);
        let iid = juego.input_id();
        println!(
            "{tipo:?}: {} {:04x}:{:04x} v{:04x} en {}",
            juego.name().unwrap_or("?"),
            iid.vendor(),
            iid.product(),
            iid.version(),
            nodo.display()
        );
        assert_eq!(juego.name(), Some(nombre));
        assert_eq!(
            (iid.bus_type(), iid.vendor(), iid.product(), iid.version()),
            (BusType::BUS_USB, vendedor, producto, version)
        );
        assert!(nucleo::salida::linux::es_propio(&nodo));
        let teclas = juego.supported_keys().unwrap();
        let ejes = juego.supported_absolute_axes().unwrap();
        assert!(teclas.contains(K::BTN_SOUTH) && teclas.contains(K::BTN_MODE) && teclas.contains(K::BTN_THUMBR));
        assert!(ejes.contains(A::ABS_HAT0X) && ejes.contains(A::ABS_RY));
        assert!(juego.supported_ff().unwrap().contains(FFEffectCode::FF_RUMBLE));
        let abs = juego.get_abs_state().unwrap();
        match tipo {
            TipoSalida::Xbox360 => {
                assert_eq!(teclas.iter().count(), 11);
                assert_eq!((abs[0].minimum, abs[0].maximum), (-32768, 32767));
                assert_eq!((abs[2].minimum, abs[2].maximum), (0, 255));
            }
            TipoSalida::Dualshock4 => {
                assert_eq!(teclas.iter().count(), 13);
                assert!(teclas.contains(K::BTN_TL2));
                assert_eq!((abs[0].minimum, abs[0].maximum, abs[0].value), (0, 255, 128));
                assert!(ejes.contains(A::ABS_RZ));
            }
            _ => {
                assert_eq!(teclas.iter().count(), 14);
                assert!(teclas.contains(K::BTN_Z) && teclas.contains(K::BTN_TR2));
                assert!(!ejes.contains(A::ABS_Z));
                assert_eq!((abs[0].minimum, abs[0].maximum), (-32767, 32767));
            }
        }
        // El fisico esta capturado: nadie mas puede capturarlo.
        let mut otro = Device::open(&nodo_fisico).unwrap();
        assert!(otro.grab().is_err(), "el mando fisico deberia estar capturado");
        drop(otro);
        // La fuente no lee nuestro propio mando virtual (pasa un escaneo completo).
        bombear(&mut s, 1200);
        assert!(!s.mandos().iter().any(|m| m.ruta == nodo.to_string_lossy()), "se ha leido el mando virtual");
    }

    // Sin salida: se quita el virtual y se libera el fisico.
    let nodo = poner_salida(&mut s, id, TipoSalida::Xbox360);
    let mut m = s.mapeo(id).unwrap().mapeo;
    m.salida = TipoSalida::Ninguna;
    s.editar_mapeo(id, m).unwrap();
    bombear(&mut s, 100);
    assert!(
        !nodo.exists()
            || Device::open(&nodo).is_err()
            || !Device::open(&nodo).unwrap().name().unwrap_or("").contains("X-Box")
    );
    let mut otro = Device::open(&nodo_fisico).unwrap();
    assert!(otro.grab().is_ok(), "el mando fisico deberia estar libre");
    otro.ungrab().unwrap();
}

#[test]
#[ignore = "necesita /dev/uinput; ejecutar con --ignored"]
fn botones_ejes_turbo_alterno_macro_y_capa() {
    let mut fisico = mando_fisico("GPM Fisico de prueba B", 0x6781, false);
    let nodo_fisico = nodo_de(&mut fisico);
    let (mut s, id) = servicio_con(&nodo_fisico);
    let mut m = s.mapeo(id).unwrap().mapeo;
    // b8 (MODE) -> macro; b9 (THUMBL) capa; Y en turbo; X alterno.
    m.acciones
        .insert(Entrada::Control(Control::Y), Accion::Pad { salida: SalidaPad::Y, modo: Modo::Turbo, turbo_hz: 10.0 });
    m.acciones.insert(
        Entrada::Control(Control::X),
        Accion::Pad { salida: SalidaPad::X, modo: Modo::Alternar, turbo_hz: 10.0 },
    );
    m.macros.push(Macro {
        id: 1,
        nombre: "combo".into(),
        pasos: vec![
            PasoMacro::Toque { salida: SalidaPad::B, ms: 60 },
            PasoMacro::Esperar { ms: 40 },
            PasoMacro::Toque { salida: SalidaPad::Start, ms: 60 },
        ],
        repetir: false,
    });
    m.acciones.insert(Entrada::Control(Control::Home), Accion::Macro { macro_id: 1 });
    m.capas.push(Capa {
        nombre: "shift".into(),
        modificador: Entrada::Control(Control::L3),
        acciones: [(Entrada::Control(Control::A), Accion::pad(SalidaPad::Select))].into(),
    });
    s.editar_mapeo(id, m).unwrap();
    let nodo = poner_salida(&mut s, id, TipoSalida::Xbox360);
    let mut juego = abrir_como_juego(&nodo);
    bombear(&mut s, 50);
    leer(&mut juego);

    // Boton y eje con latencia baja.
    let t = Instant::now();
    fisico.emit(&[tecla(K::BTN_SOUTH, 1), InputEvent::new(EventType::ABSOLUTE.0, A::ABS_X.0, 16384)]).unwrap();
    let mut recibido = Vec::new();
    while recibido.is_empty() && t.elapsed() < Duration::from_millis(200) {
        s.sondear(Duration::from_millis(1));
        recibido = leer(&mut juego);
    }
    let latencia = t.elapsed();
    println!("latencia fisico -> virtual: {latencia:?}");
    assert!(recibido.contains(&(EventType::KEY.0, K::BTN_SOUTH.0, 1)), "{recibido:?}");
    assert!(
        recibido.iter().any(|(t, c, v)| *t == EventType::ABSOLUTE.0 && *c == A::ABS_X.0 && (*v - 16384).abs() < 50),
        "{recibido:?}"
    );
    assert!(latencia < Duration::from_millis(50));
    fisico.emit(&[tecla(K::BTN_SOUTH, 0), InputEvent::new(EventType::ABSOLUTE.0, A::ABS_X.0, 0)]).unwrap();
    bombear(&mut s, 30);
    leer(&mut juego);

    // Turbo a 10 Hz durante ~400 ms: unas 4 pulsaciones.
    fisico.emit(&[tecla(K::BTN_WEST, 1)]).unwrap();
    let mut pulsaciones = 0;
    let fin = Instant::now() + Duration::from_millis(420);
    while Instant::now() < fin {
        s.sondear(Duration::from_millis(2));
        pulsaciones += leer(&mut juego).iter().filter(|e| *e == &(EventType::KEY.0, K::BTN_WEST.0, 1)).count();
    }
    fisico.emit(&[tecla(K::BTN_WEST, 0)]).unwrap();
    bombear(&mut s, 120);
    println!("turbo: {pulsaciones} pulsaciones en 420 ms");
    assert!((3..=6).contains(&pulsaciones), "{pulsaciones}");
    assert!(!pulsado(&juego, K::BTN_WEST));

    // Alterno: X (BTN_NORTH en xpad) sigue pulsado al soltar.
    fisico.emit(&[tecla(K::BTN_NORTH, 1)]).unwrap();
    bombear(&mut s, 30);
    fisico.emit(&[tecla(K::BTN_NORTH, 0)]).unwrap();
    bombear(&mut s, 30);
    assert!(pulsado(&juego, K::BTN_NORTH));
    fisico.emit(&[tecla(K::BTN_NORTH, 1)]).unwrap();
    bombear(&mut s, 30);
    fisico.emit(&[tecla(K::BTN_NORTH, 0)]).unwrap();
    bombear(&mut s, 30);
    assert!(!pulsado(&juego, K::BTN_NORTH));

    // Macro: B 60 ms, espera, START 60 ms.
    leer(&mut juego);
    fisico.emit(&[tecla(K::BTN_MODE, 1)]).unwrap();
    bombear(&mut s, 20);
    fisico.emit(&[tecla(K::BTN_MODE, 0)]).unwrap();
    assert!(pulsado(&juego, K::BTN_EAST));
    bombear(&mut s, 80);
    assert!(!pulsado(&juego, K::BTN_EAST));
    bombear(&mut s, 30);
    assert!(pulsado(&juego, K::BTN_START));
    bombear(&mut s, 100);
    assert!(!pulsado(&juego, K::BTN_START) && !pulsado(&juego, K::BTN_MODE));

    // Capa: con L3 mantenido, A produce SELECT (y L3 no sale).
    fisico.emit(&[tecla(K::BTN_THUMBL, 1)]).unwrap();
    bombear(&mut s, 20);
    fisico.emit(&[tecla(K::BTN_SOUTH, 1)]).unwrap();
    bombear(&mut s, 20);
    assert!(pulsado(&juego, K::BTN_SELECT) && !pulsado(&juego, K::BTN_SOUTH) && !pulsado(&juego, K::BTN_THUMBL));
    fisico.emit(&[tecla(K::BTN_THUMBL, 0)]).unwrap();
    bombear(&mut s, 20);
    assert!(pulsado(&juego, K::BTN_SOUTH) && !pulsado(&juego, K::BTN_SELECT));
    fisico.emit(&[tecla(K::BTN_SOUTH, 0)]).unwrap();
    bombear(&mut s, 20);

    // Pausa: el virtual desaparece y el fisico queda libre.
    s.pausar(true);
    assert!(!s.vista_salida(id).activa);
    let mut otro = Device::open(&nodo_fisico).unwrap();
    assert!(otro.grab().is_ok());
    otro.ungrab().unwrap();
}

#[test]
#[ignore = "necesita /dev/uinput; ejecutar con --ignored"]
fn la_vibracion_del_juego_llega_al_mando_fisico() {
    let mut fisico = mando_fisico("GPM Fisico de prueba C", 0x6782, true);
    let nodo_fisico = nodo_de(&mut fisico);
    // El mando «fisico» atiende las subidas de efectos en su propio hilo y cuenta lo que suena.
    let (tx, rx) = mpsc::channel::<(u16, u16)>();
    let fd = fisico.as_raw_fd();
    // SAFETY: O_NONBLOCK en el descriptor del mando de prueba.
    unsafe { libc::fcntl(fd, libc::F_SETFL, libc::fcntl(fd, libc::F_GETFL) | libc::O_NONBLOCK) };
    let hilo = std::thread::spawn(move || {
        let mut efectos = std::collections::HashMap::new();
        let fin = Instant::now() + Duration::from_secs(4);
        while Instant::now() < fin {
            let eventos: Vec<InputEvent> = fisico.fetch_events().map(|it| it.collect()).unwrap_or_default();
            for ev in eventos {
                match EventSummary::from(ev) {
                    EventSummary::UInput(ev, UInputCode::UI_FF_UPLOAD, _) => {
                        let mut subida = fisico.process_ff_upload(ev).unwrap();
                        if let FFEffectKind::Rumble { strong_magnitude, weak_magnitude } = subida.effect().kind {
                            efectos.insert(subida.effect_id(), (strong_magnitude, weak_magnitude));
                        }
                        subida.set_retval(0);
                    }
                    EventSummary::UInput(ev, UInputCode::UI_FF_ERASE, _) => {
                        let _ = fisico.process_ff_erase(ev);
                    }
                    EventSummary::ForceFeedback(_, FFEffectCode(id), v) if v > 0 => {
                        if let Some(e) = efectos.get(&(id as i16)) {
                            if tx.send(*e).is_err() {
                                return;
                            }
                        }
                    }
                    _ => {}
                }
            }
            std::thread::sleep(Duration::from_millis(2));
        }
    });

    let (mut s, id) = servicio_con(&nodo_fisico);
    assert!(s.mandos().iter().find(|m| m.id == id).unwrap().vibracion);
    let mut m = s.mapeo(id).unwrap().mapeo;
    m.vibracion.intercambiar = true;
    m.vibracion.fuerza = 0.5;
    s.editar_mapeo(id, m).unwrap();
    let nodo = poner_salida(&mut s, id, TipoSalida::Dualshock4);
    // El «juego» sube un efecto al mando virtual y lo reproduce, en otro hilo (la subida espera a
    // que el servicio la atienda).
    let juego = std::thread::spawn(move || {
        let mut juego = abrir_como_juego(&nodo);
        let datos = FFEffectData {
            direction: 0,
            trigger: FFTrigger::default(),
            replay: FFReplay { length: 500, delay: 0 },
            kind: FFEffectKind::Rumble { strong_magnitude: 0xffff, weak_magnitude: 0x4000 },
        };
        let mut efecto = juego.upload_ff_effect(datos).expect("subir efecto al mando virtual");
        efecto.play(1).unwrap();
        std::thread::sleep(Duration::from_millis(300));
        drop(efecto);
    });
    let fin = Instant::now() + Duration::from_secs(3);
    let mut recibido = None;
    while recibido.is_none() && Instant::now() < fin {
        s.sondear(Duration::from_millis(2));
        recibido = rx.try_recv().ok();
    }
    // Al soltar el efecto, el kernel pide al servicio que lo borre: hay que seguir atendiendo.
    while !juego.is_finished() {
        s.sondear(Duration::from_millis(2));
    }
    juego.join().unwrap();
    let (fuerte, debil) = recibido.expect("la vibracion no llego al mando fisico");
    println!("vibracion en el fisico: fuerte={fuerte:#06x} debil={debil:#06x}");
    // Intercambiados y a la mitad: fuerte ~ 0x4000/2, debil ~ 0xffff/2.
    assert!((0x1f00..=0x2100).contains(&fuerte), "{fuerte:#x}");
    assert!((0x7f00..=0x8000).contains(&debil), "{debil:#x}");
    drop(s);
    drop(rx);
    let _ = hilo.join();
}
