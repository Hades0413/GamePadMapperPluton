//! Motor de un mando: convierte su estado crudo y su configuracion en el estado del mando virtual
//! (y en teclas), con turbo, alterno, macros, capas y cambios de direccion. Es puro (el tiempo
//! llega como argumento) para probarlo sin esperar y se ejecuta en el hilo de lectura en cada
//! vuelta: no reserva memoria salvo al empezar macros.

use crate::dispositivos::{EstadoCrudo, InfoMando};
use crate::mapeo::acciones::{indice_tecla, Accion, Capa, Entrada, Lado, Modo, PasoMacro, SalidaPad};
use crate::mapeo::ajustes::{aplicar, valor, valor_gatillo, EstadoEstandar, UMBRAL_PULSADO};
use crate::mapeo::validar::MAX_PASOS;
use crate::mapeo::{Control, Fuente, MapeoMando, Mitad};
use crate::salida::EstadoPad;
use std::collections::HashMap;

/// Resultado de una vuelta del motor.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct Salida {
    pub pad: EstadoPad,
    /// Teclas pulsadas (bit `i` = `TECLAS[i]`).
    pub teclas: u128,
}

struct MacroEnCurso {
    id: u32,
    desde: u64,
    origen: Entrada,
}

#[derive(Default)]
struct EstadoEntrada {
    pulsado: bool,
    desde: u64,
    alterno: bool,
}

/// Grabacion de una macro pulsando el mando.
struct Grabacion {
    ultimo: u64,
    previo: u32,
    pasos: Vec<PasoMacro>,
}

#[derive(Default)]
pub struct Motor {
    entradas: HashMap<Entrada, EstadoEntrada>,
    macros: Vec<MacroEnCurso>,
    grabacion: Option<Grabacion>,
}

/// Botones (como salidas) del estado estandar, para la grabacion.
fn bits_estandar(e: &EstadoEstandar) -> u32 {
    e.botones
        .iter()
        .filter(|(_, p)| **p)
        .filter_map(|(c, _)| SalidaPad::de_control(*c))
        .fold(0, |b, s| b | s.bit())
}

/// Valor 0..1 de una entrada con el estado ya ajustado.
fn valor_entrada(e: &Entrada, est: &EstadoEstandar, crudo: &EstadoCrudo) -> f32 {
    match e {
        Entrada::Control(Control::L2) => est.l2,
        Entrada::Control(Control::R2) => est.r2,
        Entrada::Control(c) => f32::from(u8::from(est.botones.get(c).copied().unwrap_or(false))),
        Entrada::Cruda(f @ Fuente::Eje { mitad: Mitad::Completa, .. }) => valor_gatillo(f, crudo),
        Entrada::Cruda(f) => valor(f, crudo).clamp(0.0, 1.0),
    }
}

/// Entradas crudas del mando que no usa el mapeo estandar: los botones extra (paletas, «misc»...),
/// los ejes extra (como dos mitades) y las direcciones de hat que sobran.
pub fn entradas_extra(info: &InfoMando, m: &MapeoMando) -> Vec<Entrada> {
    let usada = |f: &Fuente| m.fuentes_usadas().any(|u| u.se_solapa(f));
    let mut extra = Vec::new();
    for b in &info.botones {
        let f = Fuente::Boton { indice: b.indice };
        if !usada(&f) {
            extra.push(Entrada::Cruda(f));
        }
    }
    for e in &info.ejes {
        for mitad in [Mitad::Positiva, Mitad::Negativa] {
            let f = Fuente::Eje { indice: e.indice, mitad, invertido: false };
            if !usada(&f) {
                extra.push(Entrada::Cruda(f));
            }
        }
    }
    for h in 0..info.hats {
        for mascara in [1, 2, 4, 8] {
            let f = Fuente::Hat { indice: h, mascara };
            if !usada(&f) {
                extra.push(Entrada::Cruda(f));
            }
        }
    }
    extra
}

impl Motor {
    pub fn new() -> Self {
        Self::default()
    }

    /// Olvida pulsaciones, alternos y macros en curso (al cambiar de configuracion o pausar).
    pub fn reiniciar(&mut self) {
        self.entradas.clear();
        self.macros.clear();
    }

    pub fn grabando(&self) -> bool {
        self.grabacion.is_some()
    }

    pub fn empezar_grabacion(&mut self, ahora: u64) {
        self.grabacion = Some(Grabacion { ultimo: ahora, previo: 0, pasos: Vec::new() });
    }

    /// Termina la grabacion y devuelve los pasos (suelta lo que siguiera pulsado).
    pub fn terminar_grabacion(&mut self, ahora: u64) -> Option<Vec<PasoMacro>> {
        let mut g = self.grabacion.take()?;
        Self::grabar_cambio(&mut g, 0, ahora);
        // Sin esperas al principio ni al final.
        while matches!(g.pasos.first(), Some(PasoMacro::Esperar { .. })) {
            g.pasos.remove(0);
        }
        while matches!(g.pasos.last(), Some(PasoMacro::Esperar { .. })) {
            g.pasos.pop();
        }
        Some(g.pasos)
    }

    fn grabar_cambio(g: &mut Grabacion, bits: u32, ahora: u64) {
        if bits == g.previo {
            return;
        }
        let espera = ahora.saturating_sub(g.ultimo).min(u64::from(crate::mapeo::validar::MAX_MS_PASO)) as u32;
        let cambios = SalidaPad::TODAS.into_iter().filter(|s| (bits ^ g.previo) & s.bit() != 0);
        let mut nuevos = Vec::new();
        if espera > 0 && !g.pasos.is_empty() {
            nuevos.push(PasoMacro::Esperar { ms: espera });
        }
        for s in cambios {
            nuevos.push(if bits & s.bit() != 0 { PasoMacro::Pulsar { salida: s } } else { PasoMacro::Soltar { salida: s } });
        }
        if g.pasos.len() + nuevos.len() > MAX_PASOS {
            return;
        }
        g.pasos.extend(nuevos);
        g.previo = bits;
        g.ultimo = ahora;
    }

    /// Una vuelta: estado crudo + configuracion -> mando virtual y teclas.
    pub fn paso(&mut self, m: &MapeoMando, crudo: &EstadoCrudo, ahora: u64) -> Salida {
        let mut est = aplicar(m, crudo);
        let dir = m.direccion;
        if dir.intercambiar_sticks {
            std::mem::swap(&mut est.ls, &mut est.rs);
        }
        // Stick -> cruceta (el stick deja de moverse).
        if let Some(lado) = dir.stick_a_cruceta {
            let s = match lado {
                Lado::Izquierdo => &mut est.ls,
                Lado::Derecho => &mut est.rs,
            };
            let [x, y] = *s;
            *s = [0.0, 0.0];
            for (c, activo) in [
                (Control::DpadLeft, x < -UMBRAL_PULSADO),
                (Control::DpadRight, x > UMBRAL_PULSADO),
                (Control::DpadUp, y < -UMBRAL_PULSADO),
                (Control::DpadDown, y > UMBRAL_PULSADO),
            ] {
                if activo {
                    est.botones.insert(c, true);
                }
            }
        }
        // Cruceta -> stick (la cruceta deja de pulsarse).
        if let Some(lado) = dir.cruceta_a_stick {
            let p = |c: Control| f32::from(u8::from(est.botones.get(&c).copied().unwrap_or(false)));
            let x = p(Control::DpadRight) - p(Control::DpadLeft);
            let y = p(Control::DpadDown) - p(Control::DpadUp);
            for c in [Control::DpadUp, Control::DpadDown, Control::DpadLeft, Control::DpadRight] {
                est.botones.insert(c, false);
            }
            if x != 0.0 || y != 0.0 {
                let s = match lado {
                    Lado::Izquierdo => &mut est.ls,
                    Lado::Derecho => &mut est.rs,
                };
                let n = x.hypot(y);
                *s = [x / n, y / n];
            }
        }

        if let Some(g) = self.grabacion.as_mut() {
            let mut bits = bits_estandar(&est);
            if est.l2 > UMBRAL_PULSADO {
                bits |= SalidaPad::L2.bit();
            }
            if est.r2 > UMBRAL_PULSADO {
                bits |= SalidaPad::R2.bit();
            }
            Self::grabar_cambio(g, bits, ahora);
        }

        let mut salida = Salida { pad: EstadoPad { ls: est.ls, rs: est.rs, ..Default::default() }, teclas: 0 };

        // Capa activa: la primera cuyo modificador se mantiene.
        let pulsada = |e: &Entrada| valor_entrada(e, &est, crudo) > UMBRAL_PULSADO;
        let capa: Option<&Capa> = m.capas.iter().find(|c| pulsada(&c.modificador));
        let es_modificador = |e: &Entrada| m.capas.iter().any(|c| c.modificador == *e);

        let crudas = m.acciones.keys().chain(capa.into_iter().flat_map(|c| c.acciones.keys()));
        let crudas = crudas.filter(|e| matches!(e, Entrada::Cruda(_)));
        let mut vistas: Vec<Entrada> = Entrada::estandar().collect();
        for e in crudas {
            if !vistas.contains(e) {
                vistas.push(*e);
            }
        }

        for e in vistas {
            if es_modificador(&e) {
                continue;
            }
            let accion = capa.and_then(|c| c.acciones.get(&e)).cloned().unwrap_or_else(|| m.accion(&e));
            let v = valor_entrada(&e, &est, crudo);
            let pulsado = v > UMBRAL_PULSADO;
            let estado = self.entradas.entry(e).or_default();
            let flanco = pulsado && !estado.pulsado;
            if pulsado != estado.pulsado {
                estado.pulsado = pulsado;
                estado.desde = ahora;
            }
            match accion {
                Accion::Pad { salida: s, modo: Modo::Normal, .. } => salida.pad.aplicar(s, v),
                Accion::Pad { salida: s, modo: Modo::Turbo, turbo_hz } => {
                    if pulsado {
                        let periodo = (1000.0 / turbo_hz.clamp(1.0, 30.0)) as u64;
                        if (ahora - estado.desde) % periodo.max(1) < periodo.max(2) / 2 {
                            salida.pad.aplicar(s, 1.0);
                        }
                    }
                }
                Accion::Pad { salida: s, modo: Modo::Alternar, .. } => {
                    if flanco {
                        estado.alterno = !estado.alterno;
                    }
                    if estado.alterno {
                        salida.pad.aplicar(s, 1.0);
                    }
                }
                Accion::Macro { macro_id } => {
                    let en_curso = self.macros.iter().any(|x| x.origen == e && x.id == macro_id);
                    let repetir = m.macros.iter().any(|x| x.id == macro_id && x.repetir);
                    if (flanco || (pulsado && repetir)) && !en_curso {
                        self.macros.push(MacroEnCurso { id: macro_id, desde: ahora, origen: e });
                    }
                }
                Accion::Tecla { tecla } => {
                    if pulsado {
                        if let Some(i) = indice_tecla(&tecla) {
                            salida.teclas |= 1 << i;
                        }
                    }
                }
                Accion::Ignorar => {}
            }
        }

        // Macros en curso.
        let pad = &mut salida.pad;
        self.macros.retain(|x| {
            let Some(mac) = m.macros.iter().find(|mac| mac.id == x.id) else { return false };
            match mac.pulsadas_en(ahora.saturating_sub(x.desde)) {
                Some(bits) => {
                    for s in SalidaPad::TODAS.into_iter().filter(|s| bits & s.bit() != 0) {
                        pad.aplicar(s, 1.0);
                    }
                    true
                }
                None => false,
            }
        });
        salida
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::dispositivos::simulado::info_ejemplo;
    use crate::mapeo::acciones::{AjusteDireccion, Macro};

    /// Mapeo del mando de ejemplo (11 botones, 6 ejes, 1 hat) como xpad.
    fn mapeo() -> MapeoMando {
        let mut m = MapeoMando::vacio("0000000073696d756c61646f00000000", "Pad");
        for (c, f) in [
            (Control::A, "b0"),
            (Control::B, "b1"),
            (Control::X, "b2"),
            (Control::Y, "b3"),
            (Control::L1, "b4"),
            (Control::R1, "b5"),
            (Control::L2, "a2"),
            (Control::R2, "a5"),
            (Control::LsX, "a0"),
            (Control::LsY, "a1"),
            (Control::DpadUp, "h0.1"),
            (Control::DpadDown, "h0.4"),
            (Control::DpadLeft, "h0.8"),
            (Control::DpadRight, "h0.2"),
        ] {
            m.asignar(c, Some(f.parse().unwrap()));
        }
        m.stick_izquierdo.zona_muerta = 0.0;
        m
    }

    fn crudo() -> EstadoCrudo {
        EstadoCrudo { botones: vec![false; 11], ejes: vec![0.0, 0.0, -1.0, 0.0, 0.0, -1.0], hats: vec![0] }
    }

    #[test]
    fn normal_y_extras() {
        let info = info_ejemplo("Pad");
        let mut m = mapeo();
        let extras = entradas_extra(&info, &m);
        // b6..b10 sin usar, ejes 3 y 4 (dos mitades cada uno) y ningun hat.
        assert!(extras.contains(&"b6".parse().unwrap()) && extras.contains(&"+a3".parse().unwrap()));
        assert!(!extras.contains(&"b0".parse().unwrap()) && !extras.contains(&"+a2".parse().unwrap()));
        assert!(!extras.iter().any(|e| matches!(e, Entrada::Cruda(Fuente::Hat { .. }))));

        m.acciones.insert("b6".parse().unwrap(), Accion::pad(SalidaPad::Touchpad));
        m.acciones.insert("+a3".parse().unwrap(), Accion::pad(SalidaPad::RsRight));
        m.acciones.insert("b7".parse().unwrap(), Accion::Tecla { tecla: "SPACE".into() });
        let mut motor = Motor::new();
        let mut c = crudo();
        c.botones[0] = true;
        c.botones[6] = true;
        c.botones[7] = true;
        c.ejes[3] = 0.8;
        c.ejes[2] = 0.0; // L2 a medias
        c.hats[0] = 1;
        c.ejes[0] = -0.5;
        let s = motor.paso(&m, &c, 0);
        assert!(s.pad.pulsado(SalidaPad::A) && s.pad.pulsado(SalidaPad::Touchpad) && s.pad.pulsado(SalidaPad::DpadUp));
        assert!(!s.pad.pulsado(SalidaPad::B));
        assert!((s.pad.l2 - 0.5).abs() < 1e-4);
        assert!((s.pad.rs[0] - 0.8).abs() < 1e-4);
        assert!((s.pad.ls[0] + 0.5).abs() < 1e-4);
        assert_eq!(s.teclas, 1 << indice_tecla("SPACE").unwrap());
    }

    #[test]
    fn turbo_alterno_y_remapeo() {
        let mut m = mapeo();
        m.acciones.insert(
            Entrada::Control(Control::A),
            Accion::Pad { salida: SalidaPad::A, modo: Modo::Turbo, turbo_hz: 10.0 },
        );
        m.acciones.insert(
            Entrada::Control(Control::B),
            Accion::Pad { salida: SalidaPad::B, modo: Modo::Alternar, turbo_hz: 10.0 },
        );
        m.acciones.insert(Entrada::Control(Control::X), Accion::pad(SalidaPad::Y));
        m.acciones.insert(Entrada::Control(Control::Y), Accion::Ignorar);
        let mut motor = Motor::new();
        let mut c = crudo();
        c.botones[0] = true;
        // Turbo a 10 Hz: 50 ms pulsado, 50 ms suelto.
        let a = |motor: &mut Motor, c: &EstadoCrudo, t| motor.paso(&m, c, t).pad.pulsado(SalidaPad::A);
        assert!(a(&mut motor, &c, 1000));
        assert!(a(&mut motor, &c, 1040));
        assert!(!a(&mut motor, &c, 1060));
        assert!(a(&mut motor, &c, 1110));
        c.botones[0] = false;
        assert!(!a(&mut motor, &c, 1120));
        // Alterno: pulsar, soltar -> sigue; pulsar otra vez -> se suelta.
        let b = |motor: &mut Motor, c: &EstadoCrudo, t| motor.paso(&m, c, t).pad.pulsado(SalidaPad::B);
        c.botones[1] = true;
        assert!(b(&mut motor, &c, 2000));
        c.botones[1] = false;
        assert!(b(&mut motor, &c, 2010));
        c.botones[1] = true;
        assert!(!b(&mut motor, &c, 2020));
        c.botones[1] = false;
        assert!(!b(&mut motor, &c, 2030));
        // X produce Y; Y no produce nada.
        c.botones[2] = true;
        c.botones[3] = true;
        let s = motor.paso(&m, &c, 3000).pad;
        assert!(s.pulsado(SalidaPad::Y) && !s.pulsado(SalidaPad::X));
    }

    #[test]
    fn macros_capas_y_grabacion() {
        let mut m = mapeo();
        m.macros.push(Macro {
            id: 1,
            nombre: "combo".into(),
            pasos: vec![PasoMacro::Toque { salida: SalidaPad::A, ms: 30 }, PasoMacro::Toque { salida: SalidaPad::B, ms: 30 }],
            repetir: false,
        });
        m.acciones.insert("b8".parse().unwrap(), Accion::Macro { macro_id: 1 });
        m.capas.push(Capa {
            nombre: "shift".into(),
            modificador: "b9".parse().unwrap(),
            acciones: [(Entrada::Control(Control::A), Accion::pad(SalidaPad::Home))].into(),
        });
        let mut motor = Motor::new();
        let mut c = crudo();
        c.botones[8] = true;
        let s0 = motor.paso(&m, &c, 0).pad;
        assert!(s0.pulsado(SalidaPad::A));
        c.botones[8] = false;
        assert!(motor.paso(&m, &c, 20).pad.pulsado(SalidaPad::A));
        let s = motor.paso(&m, &c, 40).pad;
        assert!(s.pulsado(SalidaPad::B) && !s.pulsado(SalidaPad::A));
        assert_eq!(motor.paso(&m, &c, 70).pad.botones, 0);
        // Capa: con b9 mantenido, A produce HOME.
        c.botones[9] = true;
        c.botones[0] = true;
        let s = motor.paso(&m, &c, 100).pad;
        assert!(s.pulsado(SalidaPad::Home) && !s.pulsado(SalidaPad::A));
        c.botones[9] = false;
        let s = motor.paso(&m, &c, 110).pad;
        assert!(s.pulsado(SalidaPad::A) && !s.pulsado(SalidaPad::Home));
        c.botones[0] = false;
        // Grabacion: A 0..50 ms, luego B.
        motor.empezar_grabacion(200);
        motor.paso(&m, &c, 200);
        c.botones[0] = true;
        motor.paso(&m, &c, 300);
        c.botones[0] = false;
        motor.paso(&m, &c, 350);
        c.botones[1] = true;
        motor.paso(&m, &c, 400);
        let pasos = motor.terminar_grabacion(450).unwrap();
        assert_eq!(
            pasos,
            vec![
                PasoMacro::Pulsar { salida: SalidaPad::A },
                PasoMacro::Esperar { ms: 50 },
                PasoMacro::Soltar { salida: SalidaPad::A },
                PasoMacro::Esperar { ms: 50 },
                PasoMacro::Pulsar { salida: SalidaPad::B },
                PasoMacro::Esperar { ms: 50 },
                PasoMacro::Soltar { salida: SalidaPad::B },
            ]
        );
        assert!(!motor.grabando());
    }

    #[test]
    fn cambios_de_direccion() {
        let mut m = mapeo();
        m.direccion = AjusteDireccion { intercambiar_sticks: true, ..Default::default() };
        let mut motor = Motor::new();
        let mut c = crudo();
        c.ejes[0] = 0.9;
        let s = motor.paso(&m, &c, 0).pad;
        assert!(s.ls[0].abs() < 1e-4 && (s.rs[0] - 0.9).abs() < 1e-4);
        m.direccion = AjusteDireccion { stick_a_cruceta: Some(Lado::Izquierdo), ..Default::default() };
        let s = motor.paso(&m, &c, 10).pad;
        assert!(s.pulsado(SalidaPad::DpadRight) && s.ls == [0.0, 0.0]);
        m.direccion = AjusteDireccion { cruceta_a_stick: Some(Lado::Derecho), ..Default::default() };
        c.ejes[0] = 0.0;
        c.hats[0] = 1;
        let s = motor.paso(&m, &c, 20).pad;
        assert!(!s.pulsado(SalidaPad::DpadUp) && (s.rs[1] + 1.0).abs() < 1e-4);
    }

    #[test]
    fn una_vuelta_cuesta_poco() {
        let mut m = mapeo();
        for i in 6..11 {
            m.acciones.insert(
                format!("b{i}").parse().unwrap(),
                Accion::Pad { salida: SalidaPad::A, modo: Modo::Turbo, turbo_hz: 20.0 },
            );
        }
        let mut motor = Motor::new();
        let c = crudo();
        let inicio = std::time::Instant::now();
        for t in 0..1000 {
            motor.paso(&m, &c, t);
        }
        // Objetivo < 2 ms por vuelta; en la practica son microsegundos.
        assert!(inicio.elapsed() < std::time::Duration::from_millis(1000), "{:?}", inicio.elapsed());
    }
}
