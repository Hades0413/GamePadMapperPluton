//! Mando virtual (uinput) para probar la app sin un mando real: los sticks giran, los gatillos
//! suben y bajan y los botones se pulsan por turnos. Ctrl+C para quitarlo.
//!
//! ```sh
//! cargo run -p gpm-nucleo --example mando_virtual            # sin limite
//! cargo run -p gpm-nucleo --example mando_virtual -- 10      # 10 segundos
//! ```

#[cfg(target_os = "linux")]
fn main() -> std::io::Result<()> {
    use evdev::uinput::VirtualDevice;
    use evdev::{AbsInfo, AbsoluteAxisCode as A, AttributeSet, BusType, EventType, InputEvent, InputId, KeyCode};
    use std::time::{Duration, Instant};

    let botones = [
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
    let mut teclas = AttributeSet::<KeyCode>::new();
    for b in botones {
        teclas.insert(b);
    }
    let stick = AbsInfo::new(0, -32768, 32767, 16, 128, 0);
    let gatillo = AbsInfo::new(0, 0, 255, 0, 0, 0);
    let hat = AbsInfo::new(0, -1, 1, 0, 0, 0);
    let mut b = VirtualDevice::builder()?
        .name("GPM Mando virtual")
        .input_id(InputId::new(BusType::BUS_USB, 0x1209, 0x6770, 0x0001))
        .with_keys(&teclas)?;
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
        b = b.with_absolute_axis(&evdev::UinputAbsSetup::new(eje, info))?;
    }
    let mut mando = b.build()?;
    for nodo in mando.enumerate_dev_nodes_blocking()?.flatten() {
        println!("mando virtual en {}", nodo.display());
    }

    let limite = std::env::args().nth(1).and_then(|s| s.parse::<u64>().ok()).map(Duration::from_secs);
    let inicio = Instant::now();
    let abs = |eje: A, v: f64| InputEvent::new(EventType::ABSOLUTE.0, eje.0, v as i32);
    let mut anterior = None;
    while limite.is_none_or(|l| inicio.elapsed() < l) {
        let t = inicio.elapsed().as_secs_f64();
        let pulsado = botones[(t / 0.6) as usize % botones.len()];
        let mut eventos = vec![
            abs(A::ABS_X, (t * 1.3).cos() * 30000.0),
            abs(A::ABS_Y, (t * 1.3).sin() * 30000.0),
            abs(A::ABS_RX, (t * 0.9).sin() * 30000.0),
            abs(A::ABS_RY, (t * 1.8).sin() * 16000.0),
            abs(A::ABS_Z, (t * 2.0).sin().max(0.0) * 255.0),
            abs(A::ABS_RZ, (t * 1.1 + 2.0).sin().max(0.0) * 255.0),
            abs(A::ABS_HAT0X, ((t / 0.8) as i64 % 3 - 1) as f64),
        ];
        if anterior != Some(pulsado) {
            if let Some(a) = anterior {
                eventos.push(InputEvent::new(EventType::KEY.0, KeyCode::code(a), 0));
            }
            eventos.push(InputEvent::new(EventType::KEY.0, pulsado.code(), 1));
            anterior = Some(pulsado);
        }
        mando.emit(&eventos)?;
        std::thread::sleep(Duration::from_millis(16));
    }
    Ok(())
}

#[cfg(not(target_os = "linux"))]
fn main() {
    eprintln!("El mando virtual usa uinput: solo funciona en Linux.");
}
