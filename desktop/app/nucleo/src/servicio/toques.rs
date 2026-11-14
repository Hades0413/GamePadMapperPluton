//! La salida «Toques» dentro del servicio: un solo mando a la vez (el nucleo en C es global)
//! convierte su mando virtual (el resultado de su configuracion: turbo, capas...) en toques en el
//! rectangulo de destino, con el perfil del juego.
//!
//! Que perfil se usa (de mas a menos prioridad):
//! 1. el fijado a mano (`ConfigToques::fijo`);
//! 2. el del juego activo de la pestana «Juegos» (por ventana, `Juego::perfil_toques`);
//! 3. el del juego Android detectado por adb (`ConfigToques::elegidos[paquete]` o el primero de
//!    ese paquete).
//!
//! Se toca («mapeando») solo si no hay pausa, hay perfil, se sabe el destino y, con destino ventana
//! y «solo con foco», la ventana tiene el foco. Mientras se toca, el mando fisico se captura
//! (EVIOCGRAB) y al dejar de tocar se suelta (y se levantan los dedos).

use super::{efectivo_en, ErrorServicio, Servicio};
use crate::dispositivos::IdMando;
use crate::salida::{EstadoPad, PantallaToques, ToquePixel};
use crate::toques::android::{Deteccion, DispositivoAdb, ErrorAdb};
use crate::toques::config::{ConfigToques, DestinoToques};
use crate::toques::perfiles::{AlmacenPerfiles, ErrorPerfil, PerfilLocal, VistaPerfil};
use crate::toques::ventanas::{ObjetivoVentana, Rect, VentanaAbierta};
use crate::toques::{ErrorToques, MotorToques, OpToque};
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;

/// De donde sale el perfil en uso.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OrigenPerfil {
    Fijo,
    Juego,
    Detectado,
}

/// Lo que hay que saber de los toques (pestanas «Juegos» y «Salida»).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VistaToques {
    /// Mando que esta usando los toques.
    pub mando: Option<IdMando>,
    pub perfil: Option<PerfilLocal>,
    pub origen: Option<OrigenPerfil>,
    pub error_perfil: Option<String>,
    /// Juego Android en primer plano (adb).
    pub paquete: Option<String>,
    pub dispositivo: Option<DispositivoAdb>,
    pub error_adb: Option<String>,
    /// Destino en pixeles del escritorio y ventana que se sigue.
    pub destino: Option<Rect>,
    pub ventana: Option<String>,
    pub foco: Option<bool>,
    pub mapeando: bool,
    /// Toques en pausa (boton de la interfaz o SELECT+START en el mando).
    pub pausado: bool,
    pub escritorio: Option<(u32, u32)>,
}

/// Estado de los toques del servicio (dentro de [`Servicio`]).
#[derive(Default)]
pub(super) struct Toques {
    pub(super) almacen: Option<AlmacenPerfiles>,
    pub(super) ruta_config: Option<PathBuf>,
    pub(super) config: ConfigToques,
    pub(super) sesion: Option<Sesion>,
    pub(super) deteccion: Option<Deteccion>,
    pub(super) error_adb: Option<String>,
    pub(super) pausa: bool,
}

pub(super) struct Sesion {
    pub(super) id: IdMando,
    pantalla: Box<dyn PantallaToques>,
    motor: Option<MotorToques>,
    perfil: Option<(PerfilLocal, OrigenPerfil)>,
    error_perfil: Option<String>,
    rect: Option<Rect>,
    ventana: Option<VentanaAbierta>,
    mapeando: bool,
    error_avisado: bool,
    ultimo_tick: std::time::Instant,
}

impl Sesion {
    fn a_pixeles(&self, ops: &[OpToque]) -> (Vec<ToquePixel>, Option<f64>) {
        let Some(r) = self.rect else { return (Vec::new(), None) };
        let px =
            |t: f64, origen: i32, lado: u32| origen + (t.clamp(0.0, 1.0) * f64::from(lado.max(2) - 1)).round() as i32;
        let mut vibrar = None;
        let lista = ops
            .iter()
            .filter_map(|op| match *op {
                OpToque::Abajo { slot, u, v } => {
                    Some(ToquePixel::Abajo { slot, x: px(u, r.x, r.ancho), y: px(v, r.y, r.alto) })
                }
                OpToque::Mover { slot, u, v } => {
                    Some(ToquePixel::Mover { slot, x: px(u, r.x, r.ancho), y: px(v, r.y, r.alto) })
                }
                OpToque::Arriba { slot } => Some(ToquePixel::Arriba { slot }),
                OpToque::Sync { tocando } => Some(ToquePixel::Sync { tocando }),
                OpToque::Vibrar(n) => {
                    vibrar = Some(n);
                    None
                }
            })
            .collect();
        (lista, vibrar)
    }

    /// Envia toques a la pantalla. Devuelve la vibracion que pide el perfil, si la hay.
    fn enviar(&mut self, ops: &[OpToque]) -> Option<f64> {
        if ops.is_empty() {
            return None;
        }
        let (px, vibrar) = self.a_pixeles(ops);
        if let Err(e) = self.pantalla.enviar(&px) {
            if !self.error_avisado {
                log::warn!("la pantalla de toques fallo: {e}");
                self.error_avisado = true;
            }
        }
        vibrar
    }

    pub(super) fn descripcion(&self) -> String {
        self.pantalla.descripcion()
    }

    fn soltar(&mut self) {
        if let Some(m) = self.motor.as_mut() {
            let ops = m.soltar_todo();
            self.enviar(&ops);
        }
    }
}

impl Servicio {
    /// Usa esta carpeta de perfiles de toques y este archivo de configuracion (`toques.json`).
    pub fn con_toques(mut self, almacen: AlmacenPerfiles, ruta_config: Option<PathBuf>) -> Self {
        if let Some(r) = &ruta_config {
            self.toques.config = ConfigToques::cargar_de(r);
        }
        self.toques.almacen = Some(almacen);
        self.toques.ruta_config = ruta_config;
        self.sincronizar_todas();
        self
    }

    fn almacen_perfiles(&self) -> Result<&AlmacenPerfiles, ErrorServicio> {
        self.toques.almacen.as_ref().ok_or(ErrorServicio::SinAlmacen)
    }

    /// Perfil que toca usar ahora y por que.
    fn perfil_deseado(&self) -> Option<(PerfilLocal, OrigenPerfil)> {
        let almacen = self.toques.almacen.as_ref()?;
        let lista = almacen.listar();
        let buscar = |id: &str| lista.iter().find(|p| p.id == id).cloned();
        if let Some(p) = self.toques.config.fijo.as_deref().and_then(buscar) {
            return Some((p, OrigenPerfil::Fijo));
        }
        let del_juego = self.juego_activo.and_then(|j| self.juegos.get(j)).and_then(|j| j.perfil_toques.as_deref());
        if let Some(p) = del_juego.and_then(buscar) {
            return Some((p, OrigenPerfil::Juego));
        }
        let paquete = self.toques.deteccion.as_ref()?.paquete.as_deref()?;
        let elegido = self.toques.config.elegidos.get(paquete).and_then(|id| buscar(id));
        elegido.or_else(|| lista.iter().find(|p| p.paquete == paquete).cloned()).map(|p| (p, OrigenPerfil::Detectado))
    }

    /// Carga el perfil que toca (si ha cambiado) en la sesion de toques.
    pub(super) fn actualizar_perfil_toques(&mut self) {
        if self.toques.sesion.is_none() {
            return;
        }
        let deseado = self.perfil_deseado();
        let ruta = deseado.as_ref().and_then(|(p, _)| self.toques.almacen.as_ref()?.ruta(&p.id).ok());
        let Some(s) = self.toques.sesion.as_mut() else { return };
        let actual = s.perfil.as_ref().map(|(p, o)| (p.id.clone(), *o));
        if actual == deseado.as_ref().map(|(p, o)| (p.id.clone(), *o)) && (s.motor.is_some() || deseado.is_none()) {
            return;
        }
        s.soltar();
        s.motor = None;
        s.error_perfil = None;
        s.perfil = deseado.clone();
        if let (Some((p, _)), Some(ruta)) = (deseado, ruta) {
            match MotorToques::nuevo(&ruta) {
                Ok(mut m) => {
                    if let Some(r) = s.rect {
                        m.destino(r.ancho, r.alto);
                    }
                    log::info!("perfil de toques: {} ({})", p.id, p.paquete);
                    s.motor = Some(m);
                }
                Err(e) => {
                    log::warn!("no se pudo cargar el perfil de toques {}: {e}", p.id);
                    s.error_perfil = Some(e.to_string());
                }
            }
        }
        self.recalcular_toques();
    }

    /// Destino de los toques segun la configuracion del mando (pantalla, rectangulo o ventana).
    pub(super) fn sincronizar_destino_toques(&mut self) {
        let Some(id) = self.toques.sesion.as_ref().map(|s| s.id) else { return };
        let destino = efectivo_en(&self.mapeos, &self.juegos, self.juego_activo, id).map(|m| m.toques.destino.clone());
        let Some(s) = self.toques.sesion.as_mut() else { return };
        let rect = match destino {
            Some(DestinoToques::PantallaCompleta) => {
                let (ancho, alto) = s.pantalla.escritorio();
                s.ventana = None;
                Some(Rect { x: 0, y: 0, ancho, alto })
            }
            Some(DestinoToques::Rectangulo(r)) => {
                s.ventana = None;
                Some(r)
            }
            Some(DestinoToques::Ventana(_)) => s.ventana.as_ref().map(|v| v.rect),
            None => None,
        };
        self.poner_rect_toques(rect);
    }

    fn poner_rect_toques(&mut self, rect: Option<Rect>) {
        let Some(s) = self.toques.sesion.as_mut() else { return };
        if s.rect != rect {
            s.soltar();
            s.rect = rect;
            if let (Some(r), Some(m)) = (rect, s.motor.as_mut()) {
                m.destino(r.ancho, r.alto);
                log::info!("destino de los toques: {},{} {}x{}", r.x, r.y, r.ancho, r.alto);
            }
        }
        self.recalcular_toques();
    }

    /// Decide si se toca y captura o suelta el mando fisico.
    pub(super) fn recalcular_toques(&mut self) {
        let Some(id) = self.toques.sesion.as_ref().map(|s| s.id) else { return };
        let ajuste = efectivo_en(&self.mapeos, &self.juegos, self.juego_activo, id).map(|m| m.toques.clone());
        let asistiendo = self.asistente.as_ref().is_some_and(|(a, _)| *a == id);
        let pausa = self.pausado || self.toques.pausa || asistiendo;
        let Some(s) = self.toques.sesion.as_mut() else { return };
        let foco_ok = match &ajuste {
            Some(a) if matches!(a.destino, DestinoToques::Ventana(_)) && a.solo_con_foco => {
                s.ventana.as_ref().is_some_and(|v| v.activa)
            }
            _ => true,
        };
        let quiere = !pausa && s.motor.is_some() && s.rect.is_some() && foco_ok;
        if quiere == s.mapeando {
            return;
        }
        s.soltar();
        s.mapeando = quiere;
        if let Err(e) = self.fuente.capturar(id, quiere) {
            log::warn!("no se pudo {} el mando {id:?}: {e}", if quiere { "capturar" } else { "soltar" });
        }
        log::info!("toques {}", if quiere { "activos (mando capturado)" } else { "inactivos (mando libre)" });
    }

    /// Empieza la sesion de toques de un mando (si no la tiene otro).
    pub(super) fn empezar_toques(&mut self, id: IdMando) {
        if self.toques.sesion.as_ref().is_some_and(|s| s.id == id) {
            self.sincronizar_destino_toques();
            return;
        }
        self.errores_salida.remove(&id);
        if self.toques.sesion.is_some() {
            self.errores_salida.insert(id, ErrorToques::Ocupado.to_string());
            return;
        }
        match self.fabrica.pantalla_toques() {
            Ok(pantalla) => {
                self.toques.sesion = Some(Sesion {
                    id,
                    pantalla,
                    motor: None,
                    perfil: None,
                    error_perfil: None,
                    rect: None,
                    ventana: None,
                    mapeando: false,
                    error_avisado: false,
                    ultimo_tick: std::time::Instant::now(),
                });
                self.actualizar_perfil_toques();
                self.sincronizar_destino_toques();
            }
            Err(e) => {
                log::warn!("no se pudo crear la pantalla de toques: {e}");
                self.errores_salida.insert(id, e.to_string());
            }
        }
    }

    /// Termina la sesion de toques (levanta los dedos y suelta el mando).
    pub(super) fn terminar_toques(&mut self) {
        let Some(mut s) = self.toques.sesion.take() else { return };
        s.soltar();
        if s.mapeando {
            let _ = self.fuente.capturar(s.id, false);
        }
        log::info!("toques terminados");
        // Otro mando que esperaba los toques.
        let esperando: Vec<IdMando> = self
            .errores_salida
            .iter()
            .filter(|(i, e)| **i != s.id && **e == ErrorToques::Ocupado.to_string())
            .map(|(i, _)| *i)
            .collect();
        drop(s);
        for i in esperando {
            self.sincronizar_salida(i);
        }
    }

    /// Una vuelta de los toques del mando `id` con su mando virtual `pad`.
    pub(super) fn paso_toques(&mut self, id: IdMando, pad: &EstadoPad) {
        let Some(s) = self.toques.sesion.as_mut().filter(|s| s.id == id) else { return };
        let mapeando = s.mapeando;
        let Some(m) = s.motor.as_mut() else { return };
        let mut ops = m.mando(pad, mapeando);
        // Camara, turbo y deslizar al ritmo del nucleo (8-10 ms), no a cada lectura del mando.
        let intervalo = Duration::from_millis(u64::from(m.intervalo_ms()));
        let ticks = s.ultimo_tick.elapsed() >= intervalo;
        if ticks {
            s.ultimo_tick = std::time::Instant::now();
        }
        let (mas, peticiones) = m.vuelta(mapeando, ticks);
        ops.extend(mas);
        let vibrar = s.enviar(&ops);
        if let Err(e) = s.pantalla.mantener() {
            log::debug!("pantalla de toques: {e}");
        }
        if let Some(n) = vibrar.filter(|n| *n > 0.0) {
            let _ = self.fuente.vibrar(id, n as f32, n as f32, Duration::from_millis(40));
        }
        if peticiones.pausa {
            self.toques.pausa = !self.toques.pausa;
            log::info!("toques {} con SELECT+START", if self.toques.pausa { "en pausa" } else { "reanudados" });
            self.recalcular_toques();
        }
        if peticiones.cambio != 0 {
            self.cambiar_perfil_toques(peticiones.cambio);
        }
    }

    /// SELECT+R1/L1: siguiente o anterior perfil del mismo juego.
    fn cambiar_perfil_toques(&mut self, paso: i32) {
        let Some((actual, origen)) = self.toques.sesion.as_ref().and_then(|s| s.perfil.clone()) else { return };
        let Some(almacen) = self.toques.almacen.as_ref() else { return };
        let mismos: Vec<PerfilLocal> = almacen.listar().into_iter().filter(|p| p.paquete == actual.paquete).collect();
        let Some(i) = mismos.iter().position(|p| p.id == actual.id) else { return };
        if mismos.len() < 2 {
            return;
        }
        let n = mismos.len() as i32;
        let siguiente = mismos[((i as i32 + paso) % n + n) as usize % mismos.len()].id.clone();
        let mut c = self.toques.config.clone();
        match origen {
            OrigenPerfil::Fijo => c.fijo = Some(siguiente),
            _ => {
                c.elegidos.insert(actual.paquete, siguiente);
            }
        }
        if let Err(e) = self.guardar_config_toques(c) {
            log::warn!("no se pudo cambiar de perfil de toques: {e}");
        }
    }

    // ------------------------------------------------------------------ para la interfaz y los hilos

    /// Ventana que siguen los toques (y la que se seguia), si el destino es una ventana.
    pub fn objetivo_toques(&self) -> Option<(ObjetivoVentana, Option<u64>)> {
        let s = self.toques.sesion.as_ref()?;
        let m = efectivo_en(&self.mapeos, &self.juegos, self.juego_activo, s.id)?;
        match &m.toques.destino {
            DestinoToques::Ventana(o) => Some((o.clone(), s.ventana.as_ref().map(|v| v.id))),
            _ => None,
        }
    }

    /// La ventana destino ahora (posicion, tamano y foco), o `None` si no esta.
    pub fn poner_ventana_toques(&mut self, ventana: Option<VentanaAbierta>) {
        let Some(s) = self.toques.sesion.as_mut() else { return };
        if s.ventana.as_ref().map(|v| v.id) != ventana.as_ref().map(|v| v.id) {
            match &ventana {
                Some(v) => log::info!("ventana de los toques: «{}» ({})", v.titulo, v.clase),
                None => log::info!("ventana de los toques no encontrada"),
            }
        }
        let rect = ventana.as_ref().map(|v| v.rect);
        s.ventana = ventana;
        self.poner_rect_toques(rect);
    }

    /// Resultado de la deteccion del juego Android (`None`: deteccion apagada).
    pub fn poner_deteccion(&mut self, r: Option<Result<Deteccion, ErrorAdb>>) -> bool {
        let antes = (self.toques.deteccion.clone(), self.toques.error_adb.clone());
        match r {
            Some(Ok(d)) => {
                self.toques.deteccion = Some(d);
                self.toques.error_adb = None;
            }
            Some(Err(e)) => {
                self.toques.deteccion = None;
                self.toques.error_adb = Some(e.to_string());
            }
            None => {
                self.toques.deteccion = None;
                self.toques.error_adb = None;
            }
        }
        let cambiado = antes != (self.toques.deteccion.clone(), self.toques.error_adb.clone());
        if cambiado {
            let p = self.toques.deteccion.as_ref().and_then(|d| d.paquete.clone());
            log::info!("juego Android en primer plano: {}", p.as_deref().unwrap_or("(ninguno)"));
            self.actualizar_perfil_toques();
        }
        cambiado
    }

    pub fn pausar_toques(&mut self, pausa: bool) {
        self.toques.pausa = pausa;
        self.recalcular_toques();
    }

    pub fn estado_toques(&self) -> VistaToques {
        let s = self.toques.sesion.as_ref();
        let (perfil, origen) = match s.and_then(|s| s.perfil.clone()) {
            Some((p, o)) => (Some(p), Some(o)),
            None if s.is_none() => self.perfil_deseado().map_or((None, None), |(p, o)| (Some(p), Some(o))),
            None => (None, None),
        };
        VistaToques {
            mando: s.map(|s| s.id),
            perfil,
            origen,
            error_perfil: s.and_then(|s| s.error_perfil.clone()),
            paquete: self.toques.deteccion.as_ref().and_then(|d| d.paquete.clone()),
            dispositivo: self.toques.deteccion.as_ref().map(|d| d.dispositivo.clone()),
            error_adb: self.toques.error_adb.clone(),
            destino: s.and_then(|s| s.rect),
            ventana: s.and_then(|s| s.ventana.as_ref().map(|v| v.titulo.clone())),
            foco: s.and_then(|s| s.ventana.as_ref().map(|v| v.activa)),
            mapeando: s.is_some_and(|s| s.mapeando),
            pausado: self.toques.pausa,
            escritorio: s.map(|s| s.pantalla.escritorio()),
        }
    }

    pub fn config_toques(&self) -> ConfigToques {
        self.toques.config.clone()
    }

    /// Guarda la configuracion de los toques (validada) y la aplica.
    pub fn guardar_config_toques(&mut self, c: ConfigToques) -> Result<ConfigToques, ErrorServicio> {
        c.validar()?;
        if let Some(r) = &self.toques.ruta_config {
            c.guardar_en(r)?;
        }
        self.toques.config = c;
        self.actualizar_perfil_toques();
        Ok(self.toques.config.clone())
    }

    pub fn perfiles_toques(&self) -> Vec<PerfilLocal> {
        self.toques.almacen.as_ref().map(AlmacenPerfiles::listar).unwrap_or_default()
    }

    pub fn ver_perfil_toques(&self, id: &str) -> Result<VistaPerfil, ErrorServicio> {
        Ok(self.almacen_perfiles()?.leer(id)?)
    }

    /// Valida y guarda un perfil (de archivo o de la comunidad).
    pub fn importar_perfil_toques(&mut self, texto: &str) -> Result<PerfilLocal, ErrorServicio> {
        let p = self.almacen_perfiles()?.guardar(texto)?;
        self.actualizar_perfil_toques();
        Ok(p)
    }

    pub fn borrar_perfil_toques(&mut self, id: &str) -> Result<Vec<PerfilLocal>, ErrorServicio> {
        self.almacen_perfiles()?.borrar(id)?;
        let mut c = self.toques.config.clone();
        if c.fijo.as_deref() == Some(id) {
            c.fijo = None;
        }
        c.elegidos.retain(|_, v| v != id);
        if c != self.toques.config {
            self.guardar_config_toques(c)?;
        }
        if self.toques.sesion.as_ref().and_then(|s| s.perfil.as_ref()).is_some_and(|(p, _)| p.id == id) {
            if let Some(s) = self.toques.sesion.as_mut() {
                s.soltar();
                s.motor = None;
                s.perfil = None;
            }
        }
        self.actualizar_perfil_toques();
        Ok(self.perfiles_toques())
    }
}

impl From<ErrorPerfil> for ErrorServicio {
    fn from(e: ErrorPerfil) -> Self {
        ErrorServicio::Perfil(e)
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::dispositivos::simulado::{info_ejemplo, ControlSimulado, FuenteSimulada};
    use crate::dispositivos::Cambio;
    use crate::mapeo::almacen::AlmacenMapeos;
    use crate::mapeo::basedatos::BaseDatosSdl;
    use crate::salida::simulada::FabricaSimulada;
    use crate::salida::TipoSalida;
    use crate::toques::config::AjusteToques;

    const PERFIL: &str = "package = com.prueba.juego\nname = Normal\nscreen = 2400x1080\nA = tap 1932 960\n";

    fn preparar(nombre: &str) -> (Servicio, ControlSimulado, FabricaSimulada, PathBuf) {
        let dir = std::env::temp_dir().join(format!("gpm-servicio-toques-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let fuente = FuenteSimulada::default();
        let control = fuente.control();
        let fabrica = FabricaSimulada::default();
        let s = Servicio::nuevo(
            Box::new(fuente),
            BaseDatosSdl::vacia("Linux"),
            Some(AlmacenMapeos::en(dir.join("mandos"))),
        )
        .con_salidas(Box::new(fabrica.clone()))
        .con_toques(AlmacenPerfiles::en(dir.join("perfiles")), Some(dir.join("toques.json")));
        (s, control, fabrica, dir)
    }

    fn poner_toques(s: &mut Servicio, id: IdMando, destino: DestinoToques, solo_con_foco: bool) {
        let mut m = s.mapeo(id).unwrap().mapeo;
        m.salida = TipoSalida::Toques;
        m.toques = AjusteToques { destino, solo_con_foco };
        s.editar_mapeo(id, m).unwrap();
    }

    fn detectar(s: &mut Servicio, paquete: &str) {
        let dispositivo = DispositivoAdb { serie: "emulator-5554".into(), estado: "device".into(), modelo: None };
        s.poner_deteccion(Some(Ok(Deteccion { dispositivo, paquete: Some(paquete.into()) })));
    }

    /// Espera turno: otras pruebas pueden estar usando el nucleo de toques (es global).
    fn con_nucleo<T>(f: impl FnOnce() -> T) -> T {
        static TURNO: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _g = TURNO.lock().unwrap_or_else(|e| e.into_inner());
        f()
    }

    #[test]
    fn toques_con_perfil_detectado_destino_y_pausa() {
        con_nucleo(|| {
            let (mut s, c, fabrica, dir) = preparar("ciclo");
            let id = c.conectar(info_ejemplo("Pad"), &[0.0, 0.0, -1.0, 0.0, 0.0, -1.0]);
            s.sondear(Duration::ZERO);
            let p = s.importar_perfil_toques(PERFIL).unwrap();
            poner_toques(&mut s, id, DestinoToques::Rectangulo(Rect { x: 100, y: 200, ancho: 1200, alto: 540 }), true);
            assert_eq!(fabrica.pantallas(), 1);
            assert!(s.vista_salida(id).activa);
            // Sin juego detectado no hay perfil: no se toca y el mando sigue libre.
            let e = s.estado_toques();
            assert_eq!((e.mando, e.perfil.is_none(), e.mapeando), (Some(id), true, false));
            assert!(!c.capturado(id));
            // Juego detectado: su perfil, se toca y el mando se captura.
            detectar(&mut s, "com.prueba.juego");
            let e = s.estado_toques();
            assert_eq!(e.perfil.as_ref().map(|p| p.id.as_str()), Some(p.id.as_str()));
            assert_eq!(e.origen, Some(OrigenPerfil::Detectado));
            assert!(e.mapeando && c.capturado(id));
            // A (b0) -> toque en el rectangulo, adaptado como en el movil (2400x1080 -> 1200x540).
            c.enviar(id, Cambio::Boton { indice: 0, pulsado: true });
            s.sondear(Duration::ZERO);
            assert_eq!(
                fabrica.toques(),
                vec![ToquePixel::Abajo { slot: 0, x: 100 + 966, y: 200 + 480 }, ToquePixel::Sync { tocando: true }]
            );
            // Otro mando no puede usar los toques a la vez.
            let id2 = c.conectar(info_ejemplo("Pad 2"), &[0.0, 0.0, -1.0, 0.0, 0.0, -1.0]);
            s.sondear(Duration::ZERO);
            poner_toques(&mut s, id2, DestinoToques::PantallaCompleta, true);
            assert_eq!(s.vista_salida(id2).error.as_deref(), Some(ErrorToques::Ocupado.to_string().as_str()));
            // Pausa (boton de la interfaz): se levanta el dedo y se suelta el mando.
            s.pausar_toques(true);
            assert_eq!(fabrica.toques(), vec![ToquePixel::Arriba { slot: 0 }, ToquePixel::Sync { tocando: false }]);
            assert!(!c.capturado(id) && !s.estado_toques().mapeando);
            s.pausar_toques(false);
            assert!(c.capturado(id));
            // Pausa global: se quita la pantalla.
            s.pausar(true);
            assert_eq!(fabrica.pantallas(), 0);
            assert!(!c.capturado(id));
            s.pausar(false);
            assert_eq!(fabrica.pantallas(), 1);
            // Quitar los toques del primer mando: el segundo, que esperaba, los coge.
            let mut m = s.mapeo(id).unwrap().mapeo;
            m.salida = TipoSalida::Ninguna;
            s.editar_mapeo(id, m).unwrap();
            assert_eq!(s.estado_toques().mando, Some(id2));
            assert!(!c.capturado(id) && c.capturado(id2));
            let _ = std::fs::remove_dir_all(dir);
        });
    }

    #[test]
    fn ventana_con_foco_perfil_fijo_y_borrar() {
        con_nucleo(|| {
            let (mut s, c, fabrica, dir) = preparar("ventana");
            let id = c.conectar(info_ejemplo("Pad"), &[0.0, 0.0, -1.0, 0.0, 0.0, -1.0]);
            s.sondear(Duration::ZERO);
            let p = s.importar_perfil_toques(PERFIL).unwrap();
            let mut cfg = s.config_toques();
            cfg.fijo = Some(p.id.clone());
            s.guardar_config_toques(cfg).unwrap();
            let objetivo = ObjetivoVentana { titulo: "Waydroid".into(), clase: "Waydroid".into() };
            poner_toques(&mut s, id, DestinoToques::Ventana(objetivo.clone()), true);
            assert_eq!(s.objetivo_toques(), Some((objetivo, None)));
            // Sin ventana todavia: no se toca.
            assert!(!s.estado_toques().mapeando);
            let mut v = VentanaAbierta {
                id: 7,
                titulo: "Waydroid".into(),
                clase: "Waydroid".into(),
                rect: Rect { x: 0, y: 0, ancho: 2400, alto: 1080 },
                activa: false,
            };
            s.poner_ventana_toques(Some(v.clone()));
            assert!(!s.estado_toques().mapeando, "sin foco no se toca");
            v.activa = true;
            s.poner_ventana_toques(Some(v.clone()));
            let e = s.estado_toques();
            assert!(e.mapeando && e.origen == Some(OrigenPerfil::Fijo) && e.foco == Some(true));
            c.enviar(id, Cambio::Boton { indice: 0, pulsado: true });
            s.sondear(Duration::ZERO);
            assert_eq!(fabrica.toques()[0], ToquePixel::Abajo { slot: 0, x: 1932, y: 960 });
            // La ventana se mueve: se levanta el dedo y se sigue en el sitio nuevo.
            v.rect.x = 100;
            s.poner_ventana_toques(Some(v));
            assert_eq!(fabrica.toques()[0], ToquePixel::Arriba { slot: 0 });
            c.enviar(id, Cambio::Boton { indice: 0, pulsado: false });
            s.sondear(Duration::ZERO);
            c.enviar(id, Cambio::Boton { indice: 0, pulsado: true });
            s.sondear(Duration::ZERO);
            assert_eq!(fabrica.toques()[0], ToquePixel::Abajo { slot: 0, x: 2032, y: 960 });
            // Borrar el perfil: se quita de la configuracion y se deja de tocar.
            assert!(s.borrar_perfil_toques(&p.id).unwrap().is_empty());
            assert_eq!(s.config_toques().fijo, None);
            assert!(!s.estado_toques().mapeando && !c.capturado(id));
            assert_eq!(ConfigToques::cargar_de(&dir.join("toques.json")).fijo, None);
            let _ = std::fs::remove_dir_all(dir);
        });
    }
}
