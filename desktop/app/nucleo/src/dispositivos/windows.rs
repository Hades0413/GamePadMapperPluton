//! Mandos en Windows con XInput (hasta 4, compatibles con XInput).
//!
//! La disposicion es fija y la misma que usa SDL para XInput: botones A, B, X, Y, LB, RB, BACK,
//! START, LS, RS; ejes LX, LY, LT, RX, RY, RT (Y positivo hacia abajo); un hat con la cruceta.
//! Las ranuras vacias se consultan solo una vez por segundo (XInputGetState tarda en las ranuras
//! sin mando). Fase siguiente: Raw Input / HID para mandos que no son XInput.

use super::{
    hat, normalizar, Cambio, Conexion, DescEntrada, ErrorMandos, EstadoCrudo, Evento, FuenteMandos, IdMando, InfoMando,
    Plataforma,
};
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::ERROR_SUCCESS;
use windows_sys::Win32::UI::Input::XboxController::{
    XInputGetState, XInputSetState, XINPUT_GAMEPAD_A, XINPUT_GAMEPAD_B, XINPUT_GAMEPAD_BACK, XINPUT_GAMEPAD_DPAD_DOWN,
    XINPUT_GAMEPAD_DPAD_LEFT, XINPUT_GAMEPAD_DPAD_RIGHT, XINPUT_GAMEPAD_DPAD_UP, XINPUT_GAMEPAD_LEFT_SHOULDER,
    XINPUT_GAMEPAD_LEFT_THUMB, XINPUT_GAMEPAD_RIGHT_SHOULDER, XINPUT_GAMEPAD_RIGHT_THUMB, XINPUT_GAMEPAD_START,
    XINPUT_GAMEPAD_X, XINPUT_GAMEPAD_Y, XINPUT_STATE, XINPUT_VIBRATION,
};

/// GUID que SDL da a los mandos XInput ("xinput" + subtipo mando).
pub const GUID_XINPUT: &str = "78696e70757401000000000000000000";

const BOTONES: [(u16, &str); 10] = [
    (XINPUT_GAMEPAD_A, "A"),
    (XINPUT_GAMEPAD_B, "B"),
    (XINPUT_GAMEPAD_X, "X"),
    (XINPUT_GAMEPAD_Y, "Y"),
    (XINPUT_GAMEPAD_LEFT_SHOULDER, "LB"),
    (XINPUT_GAMEPAD_RIGHT_SHOULDER, "RB"),
    (XINPUT_GAMEPAD_BACK, "BACK"),
    (XINPUT_GAMEPAD_START, "START"),
    (XINPUT_GAMEPAD_LEFT_THUMB, "LEFT_THUMB"),
    (XINPUT_GAMEPAD_RIGHT_THUMB, "RIGHT_THUMB"),
];
const EJES: [&str; 6] = ["LX", "LY", "LT", "RX", "RY", "RT"];
const INTERVALO_VACIAS: Duration = Duration::from_secs(1);

struct Ranura {
    info: Option<InfoMando>,
    estado: EstadoCrudo,
    paquete: u32,
    parar_vibracion: Option<Instant>,
}

pub struct FuenteXinput {
    ranuras: [Ranura; 4],
    siguiente_id: u32,
    ultimo_vacias: Option<Instant>,
}

impl Default for FuenteXinput {
    fn default() -> Self {
        Self::nueva()
    }
}

fn info(ranura: u32, id: IdMando) -> InfoMando {
    InfoMando {
        id,
        nombre: format!("Mando XInput {}", ranura + 1),
        guid: GUID_XINPUT.to_owned(),
        vendedor: 0,
        producto: 0,
        version: 0,
        conexion: Conexion::Otra,
        plataforma: Plataforma::Xinput,
        ruta: format!("XInput {}", ranura + 1),
        botones: BOTONES
            .iter()
            .enumerate()
            .map(|(i, (codigo, nombre))| DescEntrada {
                indice: i as u16,
                codigo: *codigo,
                nombre: (*nombre).to_owned(),
            })
            .collect(),
        ejes: EJES
            .iter()
            .enumerate()
            .map(|(i, nombre)| DescEntrada { indice: i as u16, codigo: i as u16, nombre: (*nombre).to_owned() })
            .collect(),
        hats: 1,
        vibracion: true,
    }
}

/// Estado XInput -> estado crudo con la numeracion de SDL.
fn convertir(s: &XINPUT_STATE) -> EstadoCrudo {
    let g = &s.Gamepad;
    let botones = BOTONES.iter().map(|(bit, _)| g.wButtons & bit != 0).collect();
    let stick = |v: i16| normalizar(i32::from(v), -32768, 32767);
    let gatillo = |v: u8| normalizar(i32::from(v), 0, 255);
    let ejes = vec![
        stick(g.sThumbLX),
        -stick(g.sThumbLY),
        gatillo(g.bLeftTrigger),
        stick(g.sThumbRX),
        -stick(g.sThumbRY),
        gatillo(g.bRightTrigger),
    ];
    let d = |bit: u16| i32::from(g.wButtons & bit != 0);
    let x = d(XINPUT_GAMEPAD_DPAD_RIGHT) - d(XINPUT_GAMEPAD_DPAD_LEFT);
    let y = d(XINPUT_GAMEPAD_DPAD_DOWN) - d(XINPUT_GAMEPAD_DPAD_UP);
    EstadoCrudo { botones, ejes, hats: vec![hat::desde_xy(x, y)] }
}

fn diferencias(id: IdMando, antes: &EstadoCrudo, ahora: &EstadoCrudo, eventos: &mut Vec<Evento>) {
    for (i, (a, b)) in antes.botones.iter().zip(&ahora.botones).enumerate() {
        if a != b {
            eventos.push(Evento::Entrada { id, cambio: Cambio::Boton { indice: i as u16, pulsado: *b } });
        }
    }
    for (i, (a, b)) in antes.ejes.iter().zip(&ahora.ejes).enumerate() {
        if a != b {
            eventos.push(Evento::Entrada { id, cambio: Cambio::Eje { indice: i as u16, valor: *b } });
        }
    }
    for (i, (a, b)) in antes.hats.iter().zip(&ahora.hats).enumerate() {
        if a != b {
            eventos.push(Evento::Entrada { id, cambio: Cambio::Hat { indice: i as u8, valor: *b } });
        }
    }
}

fn poner_vibracion(ranura: u32, fuerte: u16, debil: u16) -> u32 {
    let v = XINPUT_VIBRATION { wLeftMotorSpeed: fuerte, wRightMotorSpeed: debil };
    // SAFETY: `v` es una estructura valida que vive durante la llamada.
    unsafe { XInputSetState(ranura, &v) }
}

impl FuenteXinput {
    pub fn nueva() -> Self {
        let vacia = || Ranura { info: None, estado: EstadoCrudo::default(), paquete: 0, parar_vibracion: None };
        Self { ranuras: [vacia(), vacia(), vacia(), vacia()], siguiente_id: 0, ultimo_vacias: None }
    }
}

impl FuenteMandos for FuenteXinput {
    fn mandos(&self) -> Vec<InfoMando> {
        self.ranuras.iter().filter_map(|r| r.info.clone()).collect()
    }

    fn estado(&self, id: IdMando) -> Option<EstadoCrudo> {
        self.ranuras.iter().find(|r| r.info.as_ref().is_some_and(|i| i.id == id)).map(|r| r.estado.clone())
    }

    fn sondear(&mut self, espera: Duration, eventos: &mut Vec<Evento>) {
        std::thread::sleep(espera.min(Duration::from_millis(4)));
        let mirar_vacias = self.ultimo_vacias.is_none_or(|t| t.elapsed() >= INTERVALO_VACIAS);
        if mirar_vacias {
            self.ultimo_vacias = Some(Instant::now());
        }
        for (n, r) in self.ranuras.iter_mut().enumerate() {
            if r.info.is_none() && !mirar_vacias {
                continue;
            }
            let n = n as u32;
            // SAFETY: XINPUT_STATE es POD; XInputGetState solo escribe en ella.
            let mut s: XINPUT_STATE = unsafe { std::mem::zeroed() };
            // SAFETY: puntero valido a una estructura local.
            let conectado = unsafe { XInputGetState(n, &mut s) } == ERROR_SUCCESS;
            match (&r.info, conectado) {
                (None, true) => {
                    self.siguiente_id += 1;
                    let nueva = info(n, IdMando(self.siguiente_id));
                    r.estado = convertir(&s);
                    r.paquete = s.dwPacketNumber;
                    eventos.push(Evento::Conectado { info: nueva.clone() });
                    r.info = Some(nueva);
                }
                (Some(i), false) => {
                    eventos.push(Evento::Desconectado { id: i.id });
                    r.info = None;
                }
                (Some(i), true) if s.dwPacketNumber != r.paquete => {
                    let ahora = convertir(&s);
                    diferencias(i.id, &r.estado, &ahora, eventos);
                    r.estado = ahora;
                    r.paquete = s.dwPacketNumber;
                }
                _ => {}
            }
            if r.parar_vibracion.is_some_and(|t| Instant::now() >= t) {
                poner_vibracion(n, 0, 0);
                r.parar_vibracion = None;
            }
        }
    }

    fn vibrar(&mut self, id: IdMando, fuerte: f32, debil: f32, duracion: Duration) -> Result<(), ErrorMandos> {
        let (n, r) = self
            .ranuras
            .iter_mut()
            .enumerate()
            .find(|(_, r)| r.info.as_ref().is_some_and(|i| i.id == id))
            .ok_or(ErrorMandos::NoEncontrado)?;
        let magnitud = |v: f32| (v.clamp(0.0, 1.0) * f32::from(u16::MAX)) as u16;
        if poner_vibracion(n as u32, magnitud(fuerte), magnitud(debil)) != ERROR_SUCCESS {
            return Err(ErrorMandos::NoEncontrado);
        }
        r.parar_vibracion = Some(Instant::now() + duracion);
        Ok(())
    }
}
