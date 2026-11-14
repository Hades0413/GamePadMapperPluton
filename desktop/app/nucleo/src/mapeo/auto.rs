//! «Automatico»: el mapeo de SDL GameControllerDB si el mando esta en la base; si no, uno deducido
//! de los codigos del sistema (evdev sigue la convencion del kernel para mandos; XInput es fijo).

use super::basedatos::BaseDatosSdl;
use super::{Control, Fuente, MapeoMando};
use crate::dispositivos::{hat, InfoMando, Plataforma};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrigenAuto {
    /// Linea de SDL GameControllerDB.
    BaseDatos,
    /// Deducido de los codigos de botones y ejes.
    Heuristica,
}

pub fn auto_mapear(info: &InfoMando, base: &BaseDatosSdl) -> (MapeoMando, OrigenAuto) {
    if let Some(linea) = base.buscar(&info.guid) {
        let mut m = linea.a_mapeo();
        m.guid = info.guid.clone();
        m.nombre = info.nombre.clone();
        // Descarta lo que apunte a entradas que este mando no tiene (otra revision del modelo).
        m.asignaciones.retain(|_, f| existe(info, f));
        return (m, OrigenAuto::BaseDatos);
    }
    (heuristica(info), OrigenAuto::Heuristica)
}

fn existe(info: &InfoMando, f: &Fuente) -> bool {
    match *f {
        Fuente::Boton { indice } => usize::from(indice) < info.botones.len(),
        Fuente::Eje { indice, .. } => usize::from(indice) < info.ejes.len(),
        Fuente::Hat { indice, .. } => indice < info.hats,
    }
}

// Codigos evdev (linux/input-event-codes.h).
mod ev {
    pub const BTN_SOUTH: u16 = 0x130;
    pub const BTN_EAST: u16 = 0x131;
    pub const BTN_NORTH: u16 = 0x133;
    pub const BTN_WEST: u16 = 0x134;
    pub const BTN_TL: u16 = 0x136;
    pub const BTN_TR: u16 = 0x137;
    pub const BTN_TL2: u16 = 0x138;
    pub const BTN_TR2: u16 = 0x139;
    pub const BTN_SELECT: u16 = 0x13a;
    pub const BTN_START: u16 = 0x13b;
    pub const BTN_MODE: u16 = 0x13c;
    pub const BTN_THUMBL: u16 = 0x13d;
    pub const BTN_THUMBR: u16 = 0x13e;
    pub const BTN_DPAD_UP: u16 = 0x220;
    pub const BTN_DPAD_DOWN: u16 = 0x221;
    pub const BTN_DPAD_LEFT: u16 = 0x222;
    pub const BTN_DPAD_RIGHT: u16 = 0x223;
    pub const ABS_X: u16 = 0x00;
    pub const ABS_Y: u16 = 0x01;
    pub const ABS_Z: u16 = 0x02;
    pub const ABS_RX: u16 = 0x03;
    pub const ABS_RY: u16 = 0x04;
    pub const ABS_RZ: u16 = 0x05;
    pub const ABS_GAS: u16 = 0x09;
    pub const ABS_BRAKE: u16 = 0x0a;
}

fn heuristica(info: &InfoMando) -> MapeoMando {
    let mut m = MapeoMando::vacio(&info.guid, &info.nombre);
    let boton =
        |codigo: u16| info.botones.iter().find(|b| b.codigo == codigo).map(|b| Fuente::Boton { indice: b.indice });
    let eje = |codigo: u16| info.ejes.iter().find(|e| e.codigo == codigo).map(|e| Fuente::eje(e.indice));
    match info.plataforma {
        Plataforma::Xinput => {
            // Disposicion fija de dispositivos::windows (la misma que SDL).
            let botones = [
                Control::A,
                Control::B,
                Control::X,
                Control::Y,
                Control::L1,
                Control::R1,
                Control::Select,
                Control::Start,
                Control::L3,
                Control::R3,
            ];
            for (i, c) in botones.into_iter().enumerate() {
                m.asignar(c, Some(Fuente::Boton { indice: i as u16 }));
            }
            let ejes = [Control::LsX, Control::LsY, Control::L2, Control::RsX, Control::RsY, Control::R2];
            for (i, c) in ejes.into_iter().enumerate() {
                m.asignar(c, Some(Fuente::eje(i as u16)));
            }
        }
        Plataforma::Evdev | Plataforma::Simulado => {
            let botones = [
                (Control::A, ev::BTN_SOUTH),
                (Control::B, ev::BTN_EAST),
                (Control::X, ev::BTN_NORTH),
                (Control::Y, ev::BTN_WEST),
                (Control::L1, ev::BTN_TL),
                (Control::R1, ev::BTN_TR),
                (Control::Select, ev::BTN_SELECT),
                (Control::Start, ev::BTN_START),
                (Control::Home, ev::BTN_MODE),
                (Control::L3, ev::BTN_THUMBL),
                (Control::R3, ev::BTN_THUMBR),
                (Control::DpadUp, ev::BTN_DPAD_UP),
                (Control::DpadDown, ev::BTN_DPAD_DOWN),
                (Control::DpadLeft, ev::BTN_DPAD_LEFT),
                (Control::DpadRight, ev::BTN_DPAD_RIGHT),
            ];
            for (c, codigo) in botones {
                m.asignar(c, boton(codigo));
            }
            m.asignar(Control::LsX, eje(ev::ABS_X));
            m.asignar(Control::LsY, eje(ev::ABS_Y));
            // Mandos tipo Xbox: stick derecho en RX/RY y gatillos en Z/RZ. Los HID genericos sin
            // RX/RY llevan el stick derecho en Z/RZ y los gatillos en BRAKE/GAS o como botones.
            if eje(ev::ABS_RX).is_some() {
                m.asignar(Control::RsX, eje(ev::ABS_RX));
                m.asignar(Control::RsY, eje(ev::ABS_RY));
                m.asignar(Control::L2, eje(ev::ABS_Z).or_else(|| eje(ev::ABS_BRAKE)).or_else(|| boton(ev::BTN_TL2)));
                m.asignar(Control::R2, eje(ev::ABS_RZ).or_else(|| eje(ev::ABS_GAS)).or_else(|| boton(ev::BTN_TR2)));
            } else {
                m.asignar(Control::RsX, eje(ev::ABS_Z));
                m.asignar(Control::RsY, eje(ev::ABS_RZ));
                m.asignar(Control::L2, eje(ev::ABS_BRAKE).or_else(|| boton(ev::BTN_TL2)));
                m.asignar(Control::R2, eje(ev::ABS_GAS).or_else(|| boton(ev::BTN_TR2)));
            }
        }
    }
    if info.hats > 0 {
        let cruceta = [
            (Control::DpadUp, hat::ARRIBA),
            (Control::DpadDown, hat::ABAJO),
            (Control::DpadLeft, hat::IZQUIERDA),
            (Control::DpadRight, hat::DERECHA),
        ];
        for (c, mascara) in cruceta {
            m.asignaciones.entry(c).or_insert(Fuente::Hat { indice: 0, mascara });
        }
    }
    m
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::dispositivos::simulado::info_ejemplo;
    use crate::dispositivos::DescEntrada;
    use crate::mapeo::sdl::guid_sdl;

    #[test]
    fn heuristica_tipo_xbox() {
        let info = info_ejemplo("Generico");
        let (m, origen) = auto_mapear(&info, &BaseDatosSdl::vacia("Linux"));
        assert_eq!(origen, OrigenAuto::Heuristica);
        assert_eq!(m.asignaciones[&Control::A], Fuente::Boton { indice: 0 });
        assert_eq!(m.asignaciones[&Control::X], Fuente::Boton { indice: 2 });
        assert_eq!(m.asignaciones[&Control::Home], Fuente::Boton { indice: 8 });
        assert_eq!(m.asignaciones[&Control::L2], Fuente::eje(2));
        assert_eq!(m.asignaciones[&Control::RsY], Fuente::eje(4));
        assert_eq!(m.asignaciones[&Control::DpadLeft], Fuente::Hat { indice: 0, mascara: 8 });
        assert_eq!(m.asignaciones.len(), 21);
    }

    #[test]
    fn heuristica_hid_generico_sin_rx() {
        let mut info = info_ejemplo("HID");
        info.ejes = [(0u16, "ABS_X"), (1, "ABS_Y"), (2, "ABS_Z"), (5, "ABS_RZ")]
            .iter()
            .enumerate()
            .map(|(i, (c, n))| DescEntrada { indice: i as u16, codigo: *c, nombre: (*n).to_owned() })
            .collect();
        info.botones.push(DescEntrada { indice: 11, codigo: 0x138, nombre: "BTN_TL2".into() });
        let (m, _) = auto_mapear(&info, &BaseDatosSdl::vacia("Linux"));
        assert_eq!(m.asignaciones[&Control::RsX], Fuente::eje(2));
        assert_eq!(m.asignaciones[&Control::RsY], Fuente::eje(3));
        assert_eq!(m.asignaciones[&Control::L2], Fuente::Boton { indice: 11 });
        assert!(!m.asignaciones.contains_key(&Control::R2));
    }

    #[test]
    fn base_de_datos_primero() {
        let mut info = info_ejemplo("Microsoft X-Box 360 pad");
        info.guid = guid_sdl(0x03, 0x045e, 0x028e, 0x0114, &info.nombre);
        let (m, origen) = auto_mapear(&info, &BaseDatosSdl::incluida());
        if cfg!(target_os = "linux") {
            assert_eq!(origen, OrigenAuto::BaseDatos);
            assert_eq!(m.guid, info.guid);
            assert_eq!(m.nombre, info.nombre);
            assert_eq!(m.asignaciones[&Control::R2], Fuente::eje(5));
        }
    }

    #[test]
    fn descarta_entradas_inexistentes() {
        let mut info = info_ejemplo("Corto");
        info.botones.truncate(4);
        let mut base = BaseDatosSdl::vacia("Linux");
        base.anadir_texto(&format!("{},Corto,a:b0,start:b7,leftx:a0,platform:Linux,", info.guid));
        let (m, origen) = auto_mapear(&info, &base);
        assert_eq!(origen, OrigenAuto::BaseDatos);
        assert!(m.asignaciones.contains_key(&Control::A));
        assert!(!m.asignaciones.contains_key(&Control::Start));
    }
}
