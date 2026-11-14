//! Fuente de mandos en memoria: las pruebas (y quien quiera una demostracion sin mando) conectan
//! mandos y envian entradas con un [`ControlSimulado`] mientras la fuente la usa otro.

use super::{
    Cambio, Conexion, DescEntrada, ErrorMandos, EstadoCrudo, Evento, FuenteMandos, IdMando, InfoMando, Plataforma,
};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

#[derive(Default)]
struct Interno {
    siguiente: u32,
    mandos: BTreeMap<IdMando, (InfoMando, EstadoCrudo)>,
    pendientes: Vec<Evento>,
    vibraciones: Vec<(IdMando, f32, f32)>,
}

#[derive(Default)]
pub struct FuenteSimulada {
    interno: Arc<Mutex<Interno>>,
}

/// Mando de la fuente simulada que la controla desde fuera.
#[derive(Clone)]
pub struct ControlSimulado {
    interno: Arc<Mutex<Interno>>,
}

fn bloquear(m: &Mutex<Interno>) -> MutexGuard<'_, Interno> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl FuenteSimulada {
    pub fn control(&self) -> ControlSimulado {
        ControlSimulado { interno: Arc::clone(&self.interno) }
    }
}

/// Un mando de ejemplo con la disposicion habitual (como xpad en Linux): 11 botones, 6 ejes y un hat.
pub fn info_ejemplo(nombre: &str) -> InfoMando {
    const BOTONES: [(u16, &str); 11] = [
        (0x130, "BTN_SOUTH"),
        (0x131, "BTN_EAST"),
        (0x133, "BTN_NORTH"),
        (0x134, "BTN_WEST"),
        (0x136, "BTN_TL"),
        (0x137, "BTN_TR"),
        (0x13a, "BTN_SELECT"),
        (0x13b, "BTN_START"),
        (0x13c, "BTN_MODE"),
        (0x13d, "BTN_THUMBL"),
        (0x13e, "BTN_THUMBR"),
    ];
    const EJES: [(u16, &str); 6] =
        [(0, "ABS_X"), (1, "ABS_Y"), (2, "ABS_Z"), (3, "ABS_RX"), (4, "ABS_RY"), (5, "ABS_RZ")];
    let desc = |(i, (codigo, nombre)): (usize, &(u16, &str))| DescEntrada {
        indice: i as u16,
        codigo: *codigo,
        nombre: (*nombre).to_owned(),
    };
    InfoMando {
        id: IdMando(0),
        nombre: nombre.to_owned(),
        guid: "0000000073696d756c61646f00000000".to_owned(),
        vendedor: 0,
        producto: 0,
        version: 0,
        conexion: Conexion::Virtual,
        plataforma: Plataforma::Simulado,
        ruta: "simulado".to_owned(),
        botones: BOTONES.iter().enumerate().map(desc).collect(),
        ejes: EJES.iter().enumerate().map(desc).collect(),
        hats: 1,
        vibracion: true,
    }
}

impl ControlSimulado {
    /// Conecta un mando; `reposo` son los valores iniciales de sus ejes (vacio = todos a 0).
    pub fn conectar(&self, mut info: InfoMando, reposo: &[f32]) -> IdMando {
        let mut s = bloquear(&self.interno);
        s.siguiente += 1;
        info.id = IdMando(s.siguiente);
        let mut estado = EstadoCrudo::para(&info);
        for (e, v) in estado.ejes.iter_mut().zip(reposo) {
            *e = *v;
        }
        let id = info.id;
        s.pendientes.push(Evento::Conectado { info: info.clone() });
        s.mandos.insert(id, (info, estado));
        id
    }

    pub fn desconectar(&self, id: IdMando) {
        let mut s = bloquear(&self.interno);
        if s.mandos.remove(&id).is_some() {
            s.pendientes.push(Evento::Desconectado { id });
        }
    }

    pub fn enviar(&self, id: IdMando, cambio: Cambio) {
        let mut s = bloquear(&self.interno);
        if let Some((_, estado)) = s.mandos.get_mut(&id) {
            estado.aplicar(&cambio);
            s.pendientes.push(Evento::Entrada { id, cambio });
        }
    }

    /// Vibraciones pedidas hasta ahora (mando, fuerte, debil).
    pub fn vibraciones(&self) -> Vec<(IdMando, f32, f32)> {
        bloquear(&self.interno).vibraciones.clone()
    }
}

impl FuenteMandos for FuenteSimulada {
    fn mandos(&self) -> Vec<InfoMando> {
        bloquear(&self.interno).mandos.values().map(|(i, _)| i.clone()).collect()
    }

    fn estado(&self, id: IdMando) -> Option<EstadoCrudo> {
        bloquear(&self.interno).mandos.get(&id).map(|(_, e)| e.clone())
    }

    fn sondear(&mut self, espera: Duration, eventos: &mut Vec<Evento>) {
        let pendientes = std::mem::take(&mut bloquear(&self.interno).pendientes);
        if pendientes.is_empty() && !espera.is_zero() {
            std::thread::sleep(espera.min(Duration::from_millis(5)));
        }
        eventos.extend(pendientes);
    }

    fn vibrar(&mut self, id: IdMando, fuerte: f32, debil: f32, _duracion: Duration) -> Result<(), ErrorMandos> {
        let mut s = bloquear(&self.interno);
        if !s.mandos.contains_key(&id) {
            return Err(ErrorMandos::NoEncontrado);
        }
        s.vibraciones.push((id, fuerte, debil));
        Ok(())
    }
}
