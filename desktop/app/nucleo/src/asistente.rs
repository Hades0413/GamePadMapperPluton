//! «Asignar todo»: pide cada control por turnos («pulsa A», «mueve el stick izquierdo a la
//! derecha»...) y asigna la entrada cruda que mas claramente se ha movido.
//!
//! 1. Calibracion (`calibracion_ms`, sin tocar el mando): se toma el reposo de cada eje y se marcan
//!    como ruidosos los que se mueven solos; esos se ignoran.
//! 2. Esperando: cada boton pulsado, direccion de hat o eje que se aleja de su reposo mas de
//!    `umbral_eje` es candidato. Pasada la ventana `ventana_ms` desde el primero se elige el mejor:
//!    para un stick solo valen ejes; para L2/R2 se prefiere un eje (gatillo analogico); para el
//!    resto, boton > hat > eje. Las entradas ya asignadas a otro control no valen (aviso).
//! 3. Soltando: no se pasa al siguiente control hasta que todo vuelve al reposo (antirrebote:
//!    la misma pulsacion nunca cuenta dos veces).
//!
//! Gatillos: los que reposan en un extremo (-1, lo normal en evdev y XInput) se asignan como eje
//! completo; los que reposan en el centro (un eje Z compartido por los dos gatillos) como media
//! parte (`+a2` / `-a2`).
//!
//! El tiempo se pasa desde fuera (milisegundos) para poder probarlo con secuencias sinteticas.

use crate::dispositivos::{Cambio, EstadoCrudo};
use crate::mapeo::{Control, Fuente, Mitad};
use serde::Serialize;
use std::collections::BTreeMap;

/// Orden en el que se piden los controles. En los ejes se pide el sentido positivo
/// (derecha en X, abajo en Y).
pub const PASOS: [Control; 21] = [
    Control::A,
    Control::B,
    Control::X,
    Control::Y,
    Control::DpadUp,
    Control::DpadRight,
    Control::DpadDown,
    Control::DpadLeft,
    Control::L1,
    Control::R1,
    Control::L2,
    Control::R2,
    Control::L3,
    Control::R3,
    Control::Select,
    Control::Start,
    Control::Home,
    Control::LsX,
    Control::LsY,
    Control::RsX,
    Control::RsY,
];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ConfigAsistente {
    pub calibracion_ms: u64,
    pub ventana_ms: u64,
    /// Distancia al reposo para que un eje cuente (0..2).
    pub umbral_eje: f32,
    /// Movimiento en reposo a partir del cual un eje es ruidoso.
    pub umbral_ruido: f32,
    /// Distancia al reposo para considerar que un eje se ha soltado.
    pub umbral_reposo: f32,
}

impl Default for ConfigAsistente {
    fn default() -> Self {
        Self { calibracion_ms: 400, ventana_ms: 120, umbral_eje: 0.5, umbral_ruido: 0.2, umbral_reposo: 0.25 }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Fase {
    Calibrando,
    Esperando,
    Soltando,
    Terminado,
    Cancelado,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Aviso {
    /// Esa entrada ya esta asignada a `control`.
    Repetida { control: Control },
}

/// Lo que la interfaz necesita para dibujar el asistente.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VistaAsistente {
    pub fase: Fase,
    pub paso: Option<Control>,
    pub indice: usize,
    pub total: usize,
    pub asignaciones: BTreeMap<Control, Fuente>,
    pub aviso: Option<Aviso>,
    pub ejes_ruidosos: Vec<u16>,
}

pub struct Asistente {
    cfg: ConfigAsistente,
    paso: usize,
    fase: Fase,
    inicio_ms: u64,
    estado: EstadoCrudo,
    reposo: Vec<f32>,
    extremos: Vec<(f32, f32)>,
    ruidosos: Vec<bool>,
    asignaciones: BTreeMap<Control, Fuente>,
    candidatos: Vec<(Fuente, f32)>,
    primer_candidato_ms: Option<u64>,
    aviso: Option<Aviso>,
}

impl Asistente {
    pub fn nuevo(estado: &EstadoCrudo, ahora_ms: u64) -> Self {
        Self::con_config(estado, ahora_ms, ConfigAsistente::default())
    }

    pub fn con_config(estado: &EstadoCrudo, ahora_ms: u64, cfg: ConfigAsistente) -> Self {
        Self {
            cfg,
            paso: 0,
            fase: Fase::Calibrando,
            inicio_ms: ahora_ms,
            estado: estado.clone(),
            reposo: estado.ejes.clone(),
            extremos: estado.ejes.iter().map(|v| (*v, *v)).collect(),
            ruidosos: vec![false; estado.ejes.len()],
            asignaciones: BTreeMap::new(),
            candidatos: Vec::new(),
            primer_candidato_ms: None,
            aviso: None,
        }
    }

    pub fn fase(&self) -> Fase {
        self.fase
    }

    pub fn paso(&self) -> Option<Control> {
        match self.fase {
            Fase::Terminado | Fase::Cancelado => None,
            _ => PASOS.get(self.paso).copied(),
        }
    }

    pub fn asignaciones(&self) -> &BTreeMap<Control, Fuente> {
        &self.asignaciones
    }

    pub fn vista(&self) -> VistaAsistente {
        VistaAsistente {
            fase: self.fase,
            paso: self.paso(),
            indice: self.paso,
            total: PASOS.len(),
            asignaciones: self.asignaciones.clone(),
            aviso: self.aviso,
            ejes_ruidosos: self.ruidosos.iter().enumerate().filter(|(_, r)| **r).map(|(i, _)| i as u16).collect(),
        }
    }

    pub fn alimentar(&mut self, cambio: &Cambio, ahora_ms: u64) {
        self.estado.aplicar(cambio);
        match self.fase {
            Fase::Calibrando => {
                if let Cambio::Eje { indice, valor } = *cambio {
                    if let Some((min, max)) = self.extremos.get_mut(usize::from(indice)) {
                        *min = min.min(valor);
                        *max = max.max(valor);
                    }
                }
            }
            Fase::Esperando => self.considerar(cambio, ahora_ms),
            _ => {}
        }
        self.tick(ahora_ms);
    }

    /// Avanza por el paso del tiempo (fin de la calibracion o de la ventana de candidatos).
    pub fn tick(&mut self, ahora_ms: u64) {
        match self.fase {
            Fase::Calibrando if ahora_ms.saturating_sub(self.inicio_ms) >= self.cfg.calibracion_ms => {
                self.reposo.clone_from(&self.estado.ejes);
                for (r, (min, max)) in self.ruidosos.iter_mut().zip(&self.extremos) {
                    *r = max - min > self.cfg.umbral_ruido;
                }
                self.fase = Fase::Soltando;
                self.tick(ahora_ms);
            }
            Fase::Esperando => {
                if self.primer_candidato_ms.is_some_and(|t| ahora_ms.saturating_sub(t) >= self.cfg.ventana_ms) {
                    self.decidir();
                }
            }
            Fase::Soltando if self.en_reposo() => {
                self.fase = Fase::Esperando;
                self.limpiar_candidatos();
            }
            _ => {}
        }
    }

    pub fn saltar(&mut self) {
        if let Some(c) = self.paso() {
            self.asignaciones.remove(&c);
            self.ir_a(self.paso + 1);
        }
    }

    pub fn atras(&mut self) {
        if self.fase != Fase::Cancelado && self.paso > 0 {
            let anterior = self.paso - 1;
            self.asignaciones.remove(&PASOS[anterior]);
            self.ir_a(anterior);
        }
    }

    pub fn cancelar(&mut self) {
        self.fase = Fase::Cancelado;
    }

    fn ir_a(&mut self, paso: usize) {
        self.paso = paso;
        self.aviso = None;
        self.limpiar_candidatos();
        if self.paso >= PASOS.len() {
            self.fase = Fase::Terminado;
        } else if self.fase != Fase::Calibrando {
            self.fase = if self.en_reposo() { Fase::Esperando } else { Fase::Soltando };
        }
    }

    fn limpiar_candidatos(&mut self) {
        self.candidatos.clear();
        self.primer_candidato_ms = None;
    }

    fn en_reposo(&self) -> bool {
        !self.estado.botones.iter().any(|b| *b)
            && self.estado.hats.iter().all(|h| *h == 0)
            && self
                .estado
                .ejes
                .iter()
                .enumerate()
                .all(|(i, v)| self.ruidosos[i] || (v - self.reposo[i]).abs() < self.cfg.umbral_reposo)
    }

    fn considerar(&mut self, cambio: &Cambio, ahora_ms: u64) {
        let Some(control) = self.paso() else { return };
        let candidato = match *cambio {
            Cambio::Boton { indice, pulsado: true } => Some((Fuente::Boton { indice }, 1.0)),
            Cambio::Hat { indice, valor } if valor.count_ones() == 1 => {
                Some((Fuente::Hat { indice, mascara: valor }, 1.0))
            }
            Cambio::Eje { indice, valor } if !self.ruidosos.get(usize::from(indice)).copied().unwrap_or(true) => {
                let reposo = self.reposo[usize::from(indice)];
                let d = valor - reposo;
                if d.abs() < self.cfg.umbral_eje {
                    None
                } else if reposo.abs() > 0.5 {
                    // Reposa en un extremo: gatillo de eje completo.
                    Some((Fuente::Eje { indice, mitad: Mitad::Completa, invertido: reposo > 0.0 }, d.abs() / 2.0))
                } else if control.es_eje() {
                    Some((Fuente::Eje { indice, mitad: Mitad::Completa, invertido: d < 0.0 }, d.abs()))
                } else {
                    let mitad = if d > 0.0 { Mitad::Positiva } else { Mitad::Negativa };
                    Some((Fuente::Eje { indice, mitad, invertido: false }, d.abs()))
                }
            }
            _ => None,
        };
        let Some((fuente, fuerza)) = candidato else { return };
        match self.candidatos.iter_mut().find(|(f, _)| misma_entrada(f, &fuente)) {
            Some(c) if fuerza > c.1 => *c = (fuente, fuerza),
            Some(_) => {}
            None => self.candidatos.push((fuente, fuerza)),
        }
        self.primer_candidato_ms.get_or_insert(ahora_ms);
    }

    fn decidir(&mut self) {
        let Some(control) = self.paso() else { return };
        let prioridad = |f: &Fuente| -> Option<u8> {
            match (f, control.es_eje(), control.es_gatillo()) {
                (Fuente::Eje { mitad: Mitad::Completa, .. }, true, _) => Some(0),
                (_, true, _) => None,
                (Fuente::Eje { .. }, _, true) => Some(2),
                (Fuente::Boton { .. }, _, true) => Some(1),
                (Fuente::Boton { .. }, _, false) => Some(2),
                (Fuente::Hat { .. }, _, _) => Some(1),
                (Fuente::Eje { .. }, _, false) => Some(0),
            }
        };
        let validos: Vec<(Fuente, f32, u8)> =
            self.candidatos.iter().filter_map(|(f, fuerza)| prioridad(f).map(|p| (*f, *fuerza, p))).collect();
        let ocupada = |f: &Fuente| self.asignaciones.iter().find(|(_, otra)| otra.se_solapa(f)).map(|(c, _)| *c);
        let libre = validos
            .iter()
            .filter(|(f, _, _)| ocupada(f).is_none())
            .max_by(|a, b| a.2.cmp(&b.2).then(a.1.total_cmp(&b.1)));
        match libre {
            Some((f, _, _)) => {
                self.asignaciones.insert(control, *f);
                self.ir_a(self.paso + 1);
            }
            None => {
                self.aviso = validos.iter().find_map(|(f, _, _)| ocupada(f)).map(|c| Aviso::Repetida { control: c });
                self.limpiar_candidatos();
                self.fase = Fase::Soltando;
            }
        }
    }
}

/// Misma entrada fisica (para agrupar candidatos de un mismo movimiento).
fn misma_entrada(a: &Fuente, b: &Fuente) -> bool {
    match (a, b) {
        (Fuente::Eje { indice: x, .. }, Fuente::Eje { indice: y, .. }) => x == y,
        _ => a == b,
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    /// Mando de prueba: 11 botones, 6 ejes (gatillos a2 y a5 en reposo a -1) y un hat.
    fn reposo_xbox() -> EstadoCrudo {
        EstadoCrudo { botones: vec![false; 11], ejes: vec![0.0, 0.0, -1.0, 0.0, 0.0, -1.0], hats: vec![0] }
    }

    struct Guion {
        a: Asistente,
        t: u64,
    }

    impl Guion {
        fn nuevo(estado: EstadoCrudo) -> Self {
            let mut a = Asistente::nuevo(&estado, 0);
            a.tick(500);
            assert_eq!(a.fase(), Fase::Esperando);
            Self { a, t: 500 }
        }
        fn enviar(&mut self, c: Cambio) {
            self.t += 10;
            self.a.alimentar(&c, self.t);
        }
        fn esperar(&mut self, ms: u64) {
            self.t += ms;
            self.a.tick(self.t);
        }
        fn boton(&mut self, indice: u16) {
            self.enviar(Cambio::Boton { indice, pulsado: true });
            self.esperar(200);
            self.enviar(Cambio::Boton { indice, pulsado: false });
        }
        fn hat(&mut self, valor: u8) {
            self.enviar(Cambio::Hat { indice: 0, valor });
            self.esperar(200);
            self.enviar(Cambio::Hat { indice: 0, valor: 0 });
        }
        fn eje(&mut self, indice: u16, desde: f32, hasta: f32) {
            for k in 1..=4 {
                self.enviar(Cambio::Eje { indice, valor: desde + (hasta - desde) * k as f32 / 4.0 });
            }
            self.esperar(200);
            self.enviar(Cambio::Eje { indice, valor: desde });
        }
    }

    fn f(s: &str) -> Fuente {
        s.parse().unwrap()
    }

    #[test]
    fn mando_completo() {
        let mut g = Guion::nuevo(reposo_xbox());
        for b in [0, 1, 2, 3] {
            g.boton(b);
        }
        for h in [1, 2, 4, 8] {
            g.hat(h);
        }
        g.boton(4);
        g.boton(5);
        g.eje(2, -1.0, 1.0);
        g.eje(5, -1.0, 1.0);
        g.boton(9);
        g.boton(10);
        g.boton(6);
        g.boton(7);
        g.boton(8);
        g.eje(0, 0.0, 1.0);
        g.eje(1, 0.0, 1.0);
        // Stick derecho al reves: la derecha da negativo.
        g.eje(3, 0.0, -1.0);
        g.eje(4, 0.0, 1.0);
        assert_eq!(g.a.fase(), Fase::Terminado);
        let r = g.a.asignaciones();
        assert_eq!(r.len(), 21);
        assert_eq!(r[&Control::A], f("b0"));
        assert_eq!(r[&Control::DpadLeft], f("h0.8"));
        assert_eq!(r[&Control::L2], f("a2"));
        assert_eq!(r[&Control::R2], f("a5"));
        assert_eq!(r[&Control::Home], f("b8"));
        assert_eq!(r[&Control::LsY], f("a1"));
        assert_eq!(r[&Control::RsX], f("a3~"));
    }

    #[test]
    fn ignora_ejes_ruidosos() {
        let mut estado = reposo_xbox();
        estado.ejes.push(0.0);
        let mut a = Asistente::nuevo(&estado, 0);
        for (t, v) in [(50, 0.3), (100, -0.3), (150, 0.25)] {
            a.alimentar(&Cambio::Eje { indice: 6, valor: v }, t);
        }
        a.tick(500);
        assert_eq!(a.vista().ejes_ruidosos, vec![6]);
        a.alimentar(&Cambio::Eje { indice: 6, valor: 1.0 }, 510);
        a.tick(800);
        assert_eq!(a.paso(), Some(Control::A), "el eje ruidoso no debe asignarse");
        a.alimentar(&Cambio::Boton { indice: 0, pulsado: true }, 810);
        a.tick(1000);
        assert_eq!(a.asignaciones()[&Control::A], f("b0"));
    }

    #[test]
    fn gatillos_en_un_eje_compartido() {
        // Eje Z en reposo en el centro: L2 lo lleva a -1 y R2 a +1.
        let mut g = Guion::nuevo(EstadoCrudo { botones: vec![false; 4], ejes: vec![0.0, 0.0, 0.0], hats: vec![] });
        for _ in 0..10 {
            g.a.saltar();
        }
        assert_eq!(g.a.paso(), Some(Control::L2));
        g.eje(2, 0.0, -1.0);
        g.eje(2, 0.0, 1.0);
        assert_eq!(g.a.asignaciones()[&Control::L2], f("-a2"));
        assert_eq!(g.a.asignaciones()[&Control::R2], f("+a2"));
    }

    #[test]
    fn antirrebote_y_mantener_pulsado() {
        let mut g = Guion::nuevo(reposo_xbox());
        g.enviar(Cambio::Boton { indice: 0, pulsado: true });
        g.esperar(200);
        assert_eq!(g.a.asignaciones()[&Control::A], f("b0"));
        // Sigue pulsado: B no puede asignarse aun aunque se pulse otro.
        g.enviar(Cambio::Boton { indice: 1, pulsado: true });
        g.esperar(200);
        assert_eq!(g.a.paso(), Some(Control::B));
        assert!(!g.a.asignaciones().contains_key(&Control::B));
        g.enviar(Cambio::Boton { indice: 0, pulsado: false });
        g.enviar(Cambio::Boton { indice: 1, pulsado: false });
        // Rebote rapido de b1: una sola asignacion.
        g.enviar(Cambio::Boton { indice: 1, pulsado: true });
        g.enviar(Cambio::Boton { indice: 1, pulsado: false });
        g.enviar(Cambio::Boton { indice: 1, pulsado: true });
        g.esperar(200);
        g.enviar(Cambio::Boton { indice: 1, pulsado: false });
        assert_eq!(g.a.asignaciones()[&Control::B], f("b1"));
        assert_eq!(g.a.paso(), Some(Control::X));
    }

    #[test]
    fn preferencias_entre_candidatos() {
        // L2 da boton digital y eje analogico a la vez: gana el eje.
        let mut g = Guion::nuevo(reposo_xbox());
        for _ in 0..10 {
            g.a.saltar();
        }
        g.enviar(Cambio::Boton { indice: 6, pulsado: true });
        g.enviar(Cambio::Eje { indice: 2, valor: 1.0 });
        g.esperar(200);
        g.enviar(Cambio::Boton { indice: 6, pulsado: false });
        g.enviar(Cambio::Eje { indice: 2, valor: -1.0 });
        assert_eq!(g.a.asignaciones()[&Control::L2], f("a2"));
        // Cruceta con hat y botones a la vez: para DPAD gana el boton.
        let mut g = Guion::nuevo(reposo_xbox());
        for _ in 0..4 {
            g.a.saltar();
        }
        g.enviar(Cambio::Hat { indice: 0, valor: 1 });
        g.enviar(Cambio::Boton { indice: 10, pulsado: true });
        g.esperar(200);
        assert_eq!(g.a.asignaciones()[&Control::DpadUp], f("b10"));
    }

    #[test]
    fn avisa_de_entrada_repetida() {
        let mut g = Guion::nuevo(reposo_xbox());
        g.boton(0);
        g.boton(0);
        assert_eq!(g.a.paso(), Some(Control::B));
        assert_eq!(g.a.vista().aviso, Some(Aviso::Repetida { control: Control::A }));
        g.boton(1);
        assert_eq!(g.a.vista().aviso, None);
        assert_eq!(g.a.asignaciones()[&Control::B], f("b1"));
    }

    #[test]
    fn stick_ignora_botones_y_ejes_ya_usados() {
        let mut g = Guion::nuevo(reposo_xbox());
        while g.a.paso() != Some(Control::LsX) {
            g.a.saltar();
        }
        g.boton(3);
        assert_eq!(g.a.paso(), Some(Control::LsX), "un boton no vale para un stick");
        g.eje(0, 0.0, 1.0);
        // Al bajar el stick se mueve un poco tambien X: gana Y.
        g.enviar(Cambio::Eje { indice: 0, valor: 0.6 });
        g.enviar(Cambio::Eje { indice: 1, valor: 1.0 });
        g.esperar(200);
        assert_eq!(g.a.asignaciones()[&Control::LsY], f("a1"));
    }

    #[test]
    fn atras_saltar_y_cancelar() {
        let mut g = Guion::nuevo(reposo_xbox());
        g.boton(0);
        g.a.atras();
        assert_eq!(g.a.paso(), Some(Control::A));
        assert!(g.a.asignaciones().is_empty());
        for _ in 0..PASOS.len() {
            g.a.saltar();
        }
        assert_eq!(g.a.fase(), Fase::Terminado);
        assert_eq!(g.a.paso(), None);
        g.a.atras();
        assert_eq!(g.a.paso(), Some(Control::RsY));
        g.a.cancelar();
        assert_eq!(g.a.fase(), Fase::Cancelado);
        assert_eq!(g.a.paso(), None);
    }

    #[test]
    fn espera_a_soltar_tras_calibrar() {
        // Si se mantiene un boton durante la calibracion, no se asigna hasta soltarlo.
        let mut estado = reposo_xbox();
        estado.botones[0] = true;
        let mut a = Asistente::nuevo(&estado, 0);
        a.tick(500);
        assert_eq!(a.fase(), Fase::Soltando);
        a.alimentar(&Cambio::Boton { indice: 0, pulsado: false }, 510);
        assert_eq!(a.fase(), Fase::Esperando);
    }
}
