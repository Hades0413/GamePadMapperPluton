//! Mandos virtuales en memoria: las pruebas ven lo que se envia y simulan la vibracion del juego.

use super::{
    Disponibilidad, ErrorSalida, EstadoPad, FabricaSalidas, PantallaToques, SalidaVirtual, Teclado, TipoSalida,
    ToquePixel,
};
use std::sync::{Arc, Mutex, MutexGuard};

#[derive(Default)]
struct Interno {
    creados: Vec<TipoSalida>,
    /// Mandos vivos: (numero, tipo, estados enviados).
    vivos: Vec<(u32, TipoSalida, Vec<EstadoPad>)>,
    vibracion: Option<(f32, f32)>,
    teclas: Vec<(usize, bool)>,
    sin_permiso: bool,
    /// Pantallas de toques vivas y todo lo que se les ha enviado.
    pantallas: usize,
    toques: Vec<ToquePixel>,
}

fn bloquear(m: &Mutex<Interno>) -> MutexGuard<'_, Interno> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Default, Clone)]
pub struct FabricaSimulada {
    interno: Arc<Mutex<Interno>>,
}

impl FabricaSimulada {
    /// Tipos creados hasta ahora (en orden).
    pub fn creados(&self) -> Vec<TipoSalida> {
        bloquear(&self.interno).creados.clone()
    }

    /// Mandos virtuales vivos y su tipo.
    pub fn vivos(&self) -> Vec<TipoSalida> {
        bloquear(&self.interno).vivos.iter().map(|(_, t, _)| *t).collect()
    }

    /// Ultimo estado enviado al mando virtual vivo numero `n` (por orden de creacion).
    pub fn ultimo(&self, n: usize) -> Option<EstadoPad> {
        bloquear(&self.interno).vivos.get(n).and_then(|(_, _, e)| e.last().copied())
    }

    /// Todos los estados enviados al mando vivo `n`.
    pub fn enviados(&self, n: usize) -> Vec<EstadoPad> {
        bloquear(&self.interno).vivos.get(n).map(|(_, _, e)| e.clone()).unwrap_or_default()
    }

    /// El «juego» pide vibracion a todos los mandos virtuales.
    pub fn pedir_vibracion(&self, fuerte: f32, debil: f32) {
        bloquear(&self.interno).vibracion = Some((fuerte, debil));
    }

    pub fn teclas(&self) -> Vec<(usize, bool)> {
        bloquear(&self.interno).teclas.clone()
    }

    /// Pantallas de toques vivas.
    pub fn pantallas(&self) -> usize {
        bloquear(&self.interno).pantallas
    }

    /// Toques enviados a las pantallas (y los vacia).
    pub fn toques(&self) -> Vec<ToquePixel> {
        std::mem::take(&mut bloquear(&self.interno).toques)
    }

    /// Simula un sistema sin permiso para crear mandos virtuales.
    pub fn sin_permiso(&self, sin: bool) {
        bloquear(&self.interno).sin_permiso = sin;
    }
}

struct SalidaSimulada {
    numero: u32,
    tipo: TipoSalida,
    interno: Arc<Mutex<Interno>>,
}

impl SalidaVirtual for SalidaSimulada {
    fn tipo(&self) -> TipoSalida {
        self.tipo
    }

    fn enviar(&mut self, pad: &EstadoPad) -> std::io::Result<()> {
        let mut s = bloquear(&self.interno);
        if let Some((_, _, e)) = s.vivos.iter_mut().find(|(n, _, _)| *n == self.numero) {
            e.push(*pad);
        }
        Ok(())
    }

    fn vibracion(&mut self) -> Option<(f32, f32)> {
        bloquear(&self.interno).vibracion.take()
    }

    fn descripcion(&self) -> String {
        format!("simulado {}", self.numero)
    }
}

impl Drop for SalidaSimulada {
    fn drop(&mut self) {
        bloquear(&self.interno).vivos.retain(|(n, _, _)| *n != self.numero);
    }
}

struct TecladoSimulado {
    interno: Arc<Mutex<Interno>>,
}

impl Teclado for TecladoSimulado {
    fn tecla(&mut self, indice: usize, pulsada: bool) -> std::io::Result<()> {
        bloquear(&self.interno).teclas.push((indice, pulsada));
        Ok(())
    }
}

/// Escritorio de las pantallas de toques simuladas.
pub const ESCRITORIO_SIMULADO: (u32, u32) = (1920, 1080);

struct PantallaSimulada {
    interno: Arc<Mutex<Interno>>,
}

impl PantallaToques for PantallaSimulada {
    fn enviar(&mut self, ops: &[ToquePixel]) -> std::io::Result<()> {
        bloquear(&self.interno).toques.extend_from_slice(ops);
        Ok(())
    }

    fn escritorio(&self) -> (u32, u32) {
        ESCRITORIO_SIMULADO
    }

    fn descripcion(&self) -> String {
        "pantalla simulada".into()
    }
}

impl Drop for PantallaSimulada {
    fn drop(&mut self) {
        bloquear(&self.interno).pantallas -= 1;
    }
}

impl FabricaSalidas for FabricaSimulada {
    fn disponibilidad(&self) -> Vec<Disponibilidad> {
        let sin = bloquear(&self.interno).sin_permiso;
        TipoSalida::VIRTUALES
            .into_iter()
            .chain([TipoSalida::Toques])
            .map(|tipo| Disponibilidad {
                tipo,
                disponible: !sin,
                motivo: sin.then(|| ErrorSalida::SinPermisoUinput.to_string()),
            })
            .collect()
    }

    fn crear(&mut self, tipo: TipoSalida) -> Result<Box<dyn SalidaVirtual>, ErrorSalida> {
        let mut s = bloquear(&self.interno);
        if s.sin_permiso {
            return Err(ErrorSalida::SinPermisoUinput);
        }
        if !tipo.es_mando() {
            return Err(ErrorSalida::NoDisponible);
        }
        s.creados.push(tipo);
        let numero = s.creados.len() as u32;
        s.vivos.push((numero, tipo, Vec::new()));
        Ok(Box::new(SalidaSimulada { numero, tipo, interno: Arc::clone(&self.interno) }))
    }

    fn teclado(&mut self) -> Result<Box<dyn Teclado>, ErrorSalida> {
        Ok(Box::new(TecladoSimulado { interno: Arc::clone(&self.interno) }))
    }

    fn pantalla_toques(&mut self) -> Result<Box<dyn PantallaToques>, ErrorSalida> {
        let mut s = bloquear(&self.interno);
        if s.sin_permiso {
            return Err(ErrorSalida::SinPermisoUinput);
        }
        s.pantallas += 1;
        Ok(Box::new(PantallaSimulada { interno: Arc::clone(&self.interno) }))
    }
}
