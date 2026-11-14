//! Aplica un mapeo al estado crudo: botones estandar, sticks con zona muerta, curva e inversion,
//! y gatillos 0..1.

use super::{AjusteStick, Control, Fuente, MapeoMando, Mitad};
use crate::dispositivos::EstadoCrudo;
use serde::Serialize;
use std::collections::BTreeMap;

/// Un boton digital se considera pulsado por encima de este valor (ejes y gatillos).
pub const UMBRAL_PULSADO: f32 = 0.5;

/// Estado del mando con los controles estandar.
#[derive(Debug, Clone, PartialEq, Default, Serialize)]
pub struct EstadoEstandar {
    /// Botones digitales (incluye L2 y R2 pasado el umbral).
    pub botones: BTreeMap<Control, bool>,
    /// Stick izquierdo y derecho ya ajustados (x, y; y positivo hacia abajo).
    pub ls: [f32; 2],
    pub rs: [f32; 2],
    /// Gatillos 0..1.
    pub l2: f32,
    pub r2: f32,
}

/// Valor de una fuente: -1..1 para un eje completo; 0..1 para el resto.
pub fn valor(f: &Fuente, e: &EstadoCrudo) -> f32 {
    match *f {
        Fuente::Boton { indice } => f32::from(u8::from(e.boton(indice))),
        Fuente::Hat { indice, mascara } => f32::from(u8::from(e.hat(indice) & mascara != 0)),
        Fuente::Eje { indice, mitad, invertido } => {
            let v = if invertido { -e.eje(indice) } else { e.eje(indice) };
            match mitad {
                Mitad::Completa => v,
                Mitad::Positiva => v.max(0.0),
                Mitad::Negativa => (-v).max(0.0),
            }
        }
    }
}

/// Valor 0..1 de un gatillo: un eje completo va de -1 (suelto) a 1 (a fondo), como en SDL.
fn gatillo(f: &Fuente, e: &EstadoCrudo) -> f32 {
    match f {
        Fuente::Eje { mitad: Mitad::Completa, .. } => (valor(f, e) + 1.0) / 2.0,
        _ => valor(f, e),
    }
    .clamp(0.0, 1.0)
}

/// Zona muerta radial, curva de respuesta e inversion.
pub fn ajustar_stick(x: f32, y: f32, a: &AjusteStick) -> [f32; 2] {
    let a = a.limitado();
    let m = x.hypot(y);
    let (mut x, mut y) = if m <= a.zona_muerta || m == 0.0 {
        (0.0, 0.0)
    } else {
        let n = ((m.min(1.0) - a.zona_muerta) / (1.0 - a.zona_muerta)).clamp(0.0, 1.0).powf(a.curva);
        let k = n / m;
        ((x * k).clamp(-1.0, 1.0), (y * k).clamp(-1.0, 1.0))
    };
    if a.invertir_x {
        x = -x;
    }
    if a.invertir_y {
        y = -y;
    }
    [x, y]
}

pub fn aplicar(m: &MapeoMando, e: &EstadoCrudo) -> EstadoEstandar {
    let leer = |c: Control| m.asignaciones.get(&c).map(|f| valor(f, e)).unwrap_or(0.0);
    let leer_gatillo = |c: Control| m.asignaciones.get(&c).map(|f| gatillo(f, e)).unwrap_or(0.0);
    let mut s = EstadoEstandar {
        ls: ajustar_stick(leer(Control::LsX), leer(Control::LsY), &m.stick_izquierdo),
        rs: ajustar_stick(leer(Control::RsX), leer(Control::RsY), &m.stick_derecho),
        l2: leer_gatillo(Control::L2),
        r2: leer_gatillo(Control::R2),
        ..Default::default()
    };
    for c in Control::TODOS.into_iter().filter(|c| !c.es_eje()) {
        let v = if c.es_gatillo() { leer_gatillo(c) } else { leer(c) };
        s.botones.insert(c, v > UMBRAL_PULSADO);
    }
    s
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn cerca(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-4
    }

    #[test]
    fn zona_muerta_y_curva() {
        let a = AjusteStick { zona_muerta: 0.2, curva: 1.0, ..Default::default() };
        assert_eq!(ajustar_stick(0.1, 0.1, &a), [0.0, 0.0]);
        let [x, y] = ajustar_stick(0.6, 0.0, &a);
        assert!(cerca(x, 0.5) && y == 0.0);
        let [x, _] = ajustar_stick(1.0, 0.0, &a);
        assert!(cerca(x, 1.0));
        let curva = AjusteStick { zona_muerta: 0.0, curva: 2.0, ..Default::default() };
        let [x, _] = ajustar_stick(0.5, 0.0, &curva);
        assert!(cerca(x, 0.25));
        // La direccion se conserva.
        let [x, y] = ajustar_stick(0.5, 0.5, &AjusteStick { zona_muerta: 0.0, ..Default::default() });
        assert!(cerca(x, y));
    }

    #[test]
    fn inversion_y_valores_raros() {
        let a = AjusteStick { zona_muerta: 0.0, curva: f32::NAN, invertir_x: true, invertir_y: true };
        let [x, y] = ajustar_stick(0.5, -0.5, &a);
        assert!(cerca(x, -0.5) && cerca(y, 0.5));
    }

    #[test]
    fn aplica_todas_las_fuentes() {
        let mut m = MapeoMando::vacio("g", "n");
        m.stick_izquierdo.zona_muerta = 0.0;
        m.asignar(Control::A, Some("b0".parse().unwrap()));
        m.asignar(Control::DpadLeft, Some("h0.8".parse().unwrap()));
        m.asignar(Control::DpadRight, Some("+a6".parse().unwrap()));
        m.asignar(Control::L2, Some("a2".parse().unwrap()));
        m.asignar(Control::R2, Some("b1".parse().unwrap()));
        m.asignar(Control::LsX, Some("a0".parse().unwrap()));
        m.asignar(Control::LsY, Some("a1~".parse().unwrap()));
        let e =
            EstadoCrudo { botones: vec![true, true], ejes: vec![0.5, 0.25, 0.0, 0.0, 0.0, 0.0, 0.9], hats: vec![8] };
        let s = aplicar(&m, &e);
        assert!(s.botones[&Control::A] && s.botones[&Control::DpadLeft] && s.botones[&Control::DpadRight]);
        assert!(!s.botones[&Control::B]);
        assert!(cerca(s.l2, 0.5) && !s.botones[&Control::L2]);
        assert!(cerca(s.r2, 1.0) && s.botones[&Control::R2]);
        assert!(cerca(s.ls[0], 0.5) && cerca(s.ls[1], -0.25));
        // Gatillo suelto (-1) = 0.
        let suelto = EstadoCrudo { ejes: vec![0.0, 0.0, -1.0], ..Default::default() };
        assert_eq!(aplicar(&m, &suelto).l2, 0.0);
    }
}
