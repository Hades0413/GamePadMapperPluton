//! Servicio de la app: une la fuente de mandos, los mapeos (guardados, automaticos o editados), el
//! asistente, los mandos virtuales (con su motor: turbo, macros, capas...), las teclas y los
//! juegos. La interfaz (Tauri o pruebas) solo habla con esto.

use crate::asistente::{Asistente, ConfigAsistente, Fase, VistaAsistente};
use crate::dispositivos::{ErrorMandos, EstadoCrudo, Evento, FuenteMandos, IdMando, InfoMando};
use crate::juegos::{validar_juego, AlmacenJuegos, ErrorJuegos, Juego, Ventana, MAX_JUEGOS, MAX_MANDOS_POR_JUEGO};
use crate::mapeo::acciones::{Entrada, PasoMacro};
use crate::mapeo::ajustes::{aplicar, EstadoEstandar};
use crate::mapeo::almacen::{AlmacenMapeos, ErrorAlmacen};
use crate::mapeo::auto::{auto_mapear, OrigenAuto};
use crate::mapeo::basedatos::BaseDatosSdl;
use crate::mapeo::sdl::{mapeo_desde_texto, ErrorSdl, LineaSdl, PLATAFORMA_SDL};
use crate::mapeo::validar::{desde_json, validar, ErrorValidacion};
use crate::mapeo::MapeoMando;
use crate::motor::{entradas_extra, Motor, Salida};
use crate::salida::simulada::FabricaSimulada;
use crate::salida::{Disponibilidad, EstadoPad, FabricaSalidas, SalidaVirtual, Teclado, TipoSalida};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OrigenMapeo {
    Guardado,
    BaseDatos,
    Heuristica,
    Asistente,
    Manual,
}

impl From<OrigenAuto> for OrigenMapeo {
    fn from(o: OrigenAuto) -> Self {
        match o {
            OrigenAuto::BaseDatos => OrigenMapeo::BaseDatos,
            OrigenAuto::Heuristica => OrigenMapeo::Heuristica,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EstadoMapeo {
    pub mapeo: MapeoMando,
    pub origen: OrigenMapeo,
    pub sin_guardar: bool,
    /// Entradas del mando que no usa el mapeo estandar (botones extra).
    pub extras: Vec<Entrada>,
}

/// Estado del mando virtual de un mando.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VistaSalida {
    /// Tipo elegido en la configuracion efectiva (la del juego si hay uno activo).
    pub tipo: TipoSalida,
    pub activa: bool,
    /// Donde esta (`/dev/input/event23`, `ViGEm XInput 2`...).
    pub descripcion: Option<String>,
    /// Por que no se pudo crear.
    pub error: Option<String>,
}

/// Todo lo que la vista en vivo necesita de un mando en un instante.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Instantanea {
    pub id: IdMando,
    pub crudo: EstadoCrudo,
    pub estandar: EstadoEstandar,
    pub asistente: Option<VistaAsistente>,
    /// Lo que produce el motor (mando virtual), aunque no haya mando virtual.
    pub pad: EstadoPad,
    pub salida: VistaSalida,
    /// Juego cuya configuracion se esta usando para este mando.
    pub juego: Option<String>,
    pub grabando: bool,
    pub pausado: bool,
}

/// Resumen de un mando para la bandeja.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResumenMando {
    pub nombre: String,
    pub salida: VistaSalida,
}

#[derive(Debug, thiserror::Error)]
pub enum ErrorServicio {
    #[error("El mando ya no está conectado.")]
    NoEncontrado,
    #[error("No hay carpeta de configuración donde guardar.")]
    SinAlmacen,
    #[error("El asistente no está en marcha para este mando.")]
    SinAsistente,
    #[error("El asistente aún no ha terminado.")]
    AsistenteSinTerminar,
    #[error("No se está grabando ninguna macro en este mando.")]
    SinGrabacion,
    #[error(transparent)]
    Mandos(#[from] ErrorMandos),
    #[error(transparent)]
    Almacen(#[from] ErrorAlmacen),
    #[error(transparent)]
    Sdl(#[from] ErrorSdl),
    #[error(transparent)]
    Validacion(#[from] ErrorValidacion),
    #[error(transparent)]
    Juegos(#[from] ErrorJuegos),
}

/// Configuracion efectiva (prestando solo los campos que hacen falta, para poder mover el motor a
/// la vez).
fn efectivo_en<'a>(
    mapeos: &'a HashMap<IdMando, EstadoMapeo>,
    juegos: &'a [Juego],
    activo: Option<usize>,
    id: IdMando,
) -> Option<&'a MapeoMando> {
    let estado = mapeos.get(&id)?;
    let del_juego = activo.and_then(|j| juegos.get(j)).and_then(|j| j.mapeos.get(&estado.mapeo.guid));
    Some(del_juego.unwrap_or(&estado.mapeo))
}

/// Mando virtual vivo de un mando fisico.
struct Activa {
    dispositivo: Box<dyn SalidaVirtual>,
    ultimo: Option<EstadoPad>,
}

pub struct Servicio {
    fuente: Box<dyn FuenteMandos>,
    base: BaseDatosSdl,
    almacen: Option<AlmacenMapeos>,
    config_asistente: ConfigAsistente,
    mapeos: HashMap<IdMando, EstadoMapeo>,
    asistente: Option<(IdMando, Asistente)>,
    reloj: Instant,
    fabrica: Box<dyn FabricaSalidas>,
    activas: HashMap<IdMando, Activa>,
    errores_salida: HashMap<IdMando, String>,
    motores: HashMap<IdMando, Motor>,
    ultimas: HashMap<IdMando, Salida>,
    teclado: Option<Box<dyn Teclado>>,
    teclado_fallido: bool,
    teclas: u128,
    pausado: bool,
    almacen_juegos: Option<AlmacenJuegos>,
    juegos: Vec<Juego>,
    juego_activo: Option<usize>,
}

impl Servicio {
    /// Los mandos que la fuente ya conozca reciben su mapeo al crear el servicio. Los mandos
    /// virtuales son simulados hasta que se llame a [`Servicio::con_salidas`].
    pub fn nuevo(fuente: Box<dyn FuenteMandos>, base: BaseDatosSdl, almacen: Option<AlmacenMapeos>) -> Self {
        let mut s = Self {
            fuente,
            base,
            almacen,
            config_asistente: ConfigAsistente::default(),
            mapeos: HashMap::new(),
            asistente: None,
            reloj: Instant::now(),
            fabrica: Box::new(FabricaSimulada::default()),
            activas: HashMap::new(),
            errores_salida: HashMap::new(),
            motores: HashMap::new(),
            ultimas: HashMap::new(),
            teclado: None,
            teclado_fallido: false,
            teclas: 0,
            pausado: false,
            almacen_juegos: None,
            juegos: Vec::new(),
            juego_activo: None,
        };
        for info in s.fuente.mandos() {
            let estado = s.mapeo_inicial(&info);
            s.mapeos.insert(info.id, estado);
        }
        s
    }

    pub fn con_config_asistente(mut self, cfg: ConfigAsistente) -> Self {
        self.config_asistente = cfg;
        self
    }

    /// Usa esta fabrica de mandos virtuales (la nativa en la app) y crea los que pidan los mapeos.
    pub fn con_salidas(mut self, fabrica: Box<dyn FabricaSalidas>) -> Self {
        self.activas.clear();
        self.fabrica = fabrica;
        self.sincronizar_todas();
        self
    }

    /// Carga los juegos guardados.
    pub fn con_juegos(mut self, almacen: AlmacenJuegos) -> Self {
        match almacen.cargar() {
            Ok(j) => self.juegos = j,
            Err(e) => log::warn!("no se pudieron leer los juegos: {e}"),
        }
        self.almacen_juegos = Some(almacen);
        self
    }

    pub fn carpeta_mapeos(&self) -> Option<&Path> {
        self.almacen.as_ref().map(AlmacenMapeos::carpeta)
    }

    pub fn entradas_base_datos(&self) -> usize {
        self.base.len()
    }

    fn ms(&self) -> u64 {
        self.reloj.elapsed().as_millis() as u64
    }

    /// Lee la fuente (espera como mucho `espera`), mueve los mandos virtuales y devuelve los
    /// eventos para la interfaz.
    pub fn sondear(&mut self, espera: Duration) -> Vec<Evento> {
        let mut eventos = Vec::new();
        self.fuente.sondear(espera, &mut eventos);
        let ahora = self.ms();
        for ev in &eventos {
            match ev {
                Evento::Conectado { info } => {
                    let estado = self.mapeo_inicial(info);
                    self.mapeos.insert(info.id, estado);
                    self.sincronizar_salida(info.id);
                }
                Evento::Desconectado { id } => {
                    self.mapeos.remove(id);
                    self.activas.remove(id);
                    self.errores_salida.remove(id);
                    self.motores.remove(id);
                    self.ultimas.remove(id);
                    if self.asistente.as_ref().is_some_and(|(a, _)| a == id) {
                        self.asistente = None;
                    }
                }
                Evento::Entrada { id, cambio } => {
                    if let Some((_, a)) = self.asistente.as_mut().filter(|(a, _)| a == id) {
                        a.alimentar(cambio, ahora);
                    }
                }
            }
        }
        if let Some((_, a)) = self.asistente.as_mut() {
            a.tick(ahora);
        }
        self.mover_salidas(ahora);
        eventos
    }

    /// Una vuelta del motor de cada mando: mando virtual, vibracion de vuelta y teclas.
    fn mover_salidas(&mut self, ahora: u64) {
        let mut teclas = 0u128;
        let ids: Vec<IdMando> = self.mapeos.keys().copied().collect();
        for id in ids {
            // Mientras el asistente escucha a este mando, el mando virtual no se mueve.
            let asistiendo = self.asistente.as_ref().is_some_and(|(a, _)| *a == id);
            let Some(crudo) = self.fuente.estado(id) else { continue };
            let Some(m) = efectivo_en(&self.mapeos, &self.juegos, self.juego_activo, id) else { continue };
            let salida = if self.pausado || asistiendo {
                Salida::default()
            } else {
                self.motores.entry(id).or_default().paso(m, &crudo, ahora)
            };
            let vibracion = m.vibracion;
            teclas |= salida.teclas;
            self.ultimas.insert(id, salida);
            let Some(activa) = self.activas.get_mut(&id) else { continue };
            if activa.ultimo != Some(salida.pad) {
                if let Err(e) = activa.dispositivo.enviar(&salida.pad) {
                    log::warn!("el mando virtual de {id:?} fallo: {e}");
                    self.quitar_salida(id);
                    self.errores_salida.insert(id, format!("{e}"));
                    continue;
                }
                activa.ultimo = Some(salida.pad);
            }
            if let Some((fuerte, debil)) = activa.dispositivo.vibracion() {
                let (f, d) = vibracion.aplicar(fuerte, debil);
                if let Err(e) = self.fuente.vibrar(id, f, d, Duration::ZERO) {
                    log::debug!("vibracion de {id:?} no reenviada: {e}");
                }
            }
        }
        self.enviar_teclas(teclas);
    }

    fn enviar_teclas(&mut self, teclas: u128) {
        let cambios = teclas ^ self.teclas;
        if cambios == 0 {
            return;
        }
        if self.teclado.is_none() && !self.teclado_fallido {
            match self.fabrica.teclado() {
                Ok(t) => self.teclado = Some(t),
                Err(e) => {
                    log::warn!("sin teclado virtual: {e}");
                    self.teclado_fallido = true;
                }
            }
        }
        if let Some(t) = self.teclado.as_mut() {
            for i in (0..128).filter(|i| cambios & (1 << i) != 0) {
                if let Err(e) = t.tecla(i, teclas & (1 << i) != 0) {
                    log::warn!("tecla no enviada: {e}");
                }
            }
        }
        self.teclas = teclas;
    }

    fn mapeo_inicial(&self, info: &InfoMando) -> EstadoMapeo {
        if let Some(almacen) = &self.almacen {
            match almacen.cargar(&info.guid) {
                Ok(Some(mut mapeo)) => {
                    mapeo.nombre.clone_from(&info.nombre);
                    return self.estado_de(info, mapeo, OrigenMapeo::Guardado, false);
                }
                Ok(None) => {}
                Err(e) => log::warn!("mapeo guardado de {} ignorado: {e}", info.nombre),
            }
        }
        let (mapeo, origen) = auto_mapear(info, &self.base);
        self.estado_de(info, mapeo, origen.into(), false)
    }

    fn estado_de(&self, info: &InfoMando, mapeo: MapeoMando, origen: OrigenMapeo, sin_guardar: bool) -> EstadoMapeo {
        let extras = entradas_extra(info, &mapeo);
        EstadoMapeo { mapeo, origen, sin_guardar, extras }
    }

    /// Configuracion que se usa ahora: la del juego activo si tiene una para este modelo.
    fn efectivo(&self, id: IdMando) -> Option<&MapeoMando> {
        efectivo_en(&self.mapeos, &self.juegos, self.juego_activo, id)
    }

    fn juego_de(&self, id: IdMando) -> Option<String> {
        let guid = &self.mapeos.get(&id)?.mapeo.guid;
        let j = self.juegos.get(self.juego_activo?)?;
        j.mapeos.contains_key(guid).then(|| j.nombre.clone())
    }

    fn quitar_salida(&mut self, id: IdMando) {
        if self.activas.remove(&id).is_some() {
            let _ = self.fuente.capturar(id, false);
            let _ = self.fuente.vibrar(id, 0.0, 0.0, Duration::ZERO);
        }
    }

    /// Crea, cambia o quita el mando virtual de un mando segun su configuracion efectiva.
    fn sincronizar_salida(&mut self, id: IdMando) {
        let deseado = if self.pausado {
            TipoSalida::Ninguna
        } else {
            self.efectivo(id).map_or(TipoSalida::Ninguna, |m| m.salida)
        };
        let actual = self.activas.get(&id).map(|a| a.dispositivo.tipo());
        if actual == Some(deseado) {
            return;
        }
        self.quitar_salida(id);
        self.errores_salida.remove(&id);
        if let Some(m) = self.motores.get_mut(&id) {
            m.reiniciar();
        }
        if deseado == TipoSalida::Ninguna || !self.mapeos.contains_key(&id) {
            return;
        }
        match self.fabrica.crear(deseado) {
            Ok(dispositivo) => {
                // Primero el virtual y luego la captura: asi nunca se queda el juego sin mando.
                if let Err(e) = self.fuente.capturar(id, true) {
                    log::warn!("no se pudo capturar el mando {id:?}: {e} (el juego puede verlo dos veces)");
                }
                self.activas.insert(id, Activa { dispositivo, ultimo: None });
            }
            Err(e) => {
                log::warn!("no se pudo crear el mando virtual {deseado:?}: {e}");
                self.errores_salida.insert(id, e.to_string());
            }
        }
    }

    fn sincronizar_todas(&mut self) {
        let ids: Vec<IdMando> = self.mapeos.keys().copied().collect();
        for id in ids {
            self.sincronizar_salida(id);
        }
    }

    pub fn vista_salida(&self, id: IdMando) -> VistaSalida {
        let activa = self.activas.get(&id);
        VistaSalida {
            tipo: self.efectivo(id).map_or(TipoSalida::Ninguna, |m| m.salida),
            activa: activa.is_some(),
            descripcion: activa.map(|a| a.dispositivo.descripcion()),
            error: self.errores_salida.get(&id).cloned(),
        }
    }

    pub fn mandos(&self) -> Vec<InfoMando> {
        self.fuente.mandos()
    }

    /// Mandos con su mando virtual (para la bandeja).
    pub fn resumen(&self) -> Vec<ResumenMando> {
        self.fuente
            .mandos()
            .into_iter()
            .map(|m| ResumenMando { salida: self.vista_salida(m.id), nombre: m.nombre })
            .collect()
    }

    fn info(&self, id: IdMando) -> Result<InfoMando, ErrorServicio> {
        self.fuente.mandos().into_iter().find(|m| m.id == id).ok_or(ErrorServicio::NoEncontrado)
    }

    pub fn instantanea(&self, id: IdMando) -> Option<Instantanea> {
        let crudo = self.fuente.estado(id)?;
        let estandar = self.efectivo(id).map(|m| aplicar(m, &crudo)).unwrap_or_default();
        let asistente = self.asistente.as_ref().filter(|(a, _)| *a == id).map(|(_, a)| a.vista());
        Some(Instantanea {
            id,
            crudo,
            estandar,
            asistente,
            pad: self.ultimas.get(&id).map(|s| s.pad).unwrap_or_default(),
            salida: self.vista_salida(id),
            juego: self.juego_de(id),
            grabando: self.motores.get(&id).is_some_and(Motor::grabando),
            pausado: self.pausado,
        })
    }

    pub fn mapeo(&self, id: IdMando) -> Result<EstadoMapeo, ErrorServicio> {
        self.mapeos.get(&id).cloned().ok_or(ErrorServicio::NoEncontrado)
    }

    fn poner(&mut self, id: IdMando, mut mapeo: MapeoMando, origen: OrigenMapeo) -> Result<EstadoMapeo, ErrorServicio> {
        let info = self.info(id)?;
        mapeo.guid = info.guid.clone();
        mapeo.nombre = info.nombre.clone();
        validar(&mut mapeo)?;
        let estado = self.estado_de(&info, mapeo, origen, true);
        self.mapeos.insert(id, estado.clone());
        if let Some(m) = self.motores.get_mut(&id) {
            m.reiniciar();
        }
        self.sincronizar_salida(id);
        Ok(estado)
    }

    /// Cambios hechos en la interfaz (selectores, zona muerta, salida...). Se validan aqui. No se
    /// guardan hasta `guardar` (pero el mando virtual cambia al momento).
    pub fn editar_mapeo(&mut self, id: IdMando, mapeo: MapeoMando) -> Result<EstadoMapeo, ErrorServicio> {
        self.poner(id, mapeo, OrigenMapeo::Manual)
    }

    pub fn guardar(&mut self, id: IdMando) -> Result<(EstadoMapeo, PathBuf), ErrorServicio> {
        let almacen = self.almacen.as_ref().ok_or(ErrorServicio::SinAlmacen)?;
        let estado = self.mapeos.get_mut(&id).ok_or(ErrorServicio::NoEncontrado)?;
        let ruta = almacen.guardar(&estado.mapeo)?;
        estado.sin_guardar = false;
        Ok((estado.clone(), ruta))
    }

    /// Mapeo automatico (base de datos o heuristica), sin guardar. Conserva la configuracion
    /// avanzada (salida, acciones, macros, ajustes).
    pub fn auto_mapear(&mut self, id: IdMando) -> Result<EstadoMapeo, ErrorServicio> {
        let info = self.info(id)?;
        let (auto, origen) = auto_mapear(&info, &self.base);
        let mut mapeo = self.mapeo(id)?.mapeo;
        mapeo.asignaciones = auto.asignaciones;
        mapeo.extras_sdl = auto.extras_sdl;
        self.poner(id, mapeo, origen.into())
    }

    /// Borra el mapeo guardado y vuelve al automatico (sin configuracion avanzada).
    pub fn restablecer(&mut self, id: IdMando) -> Result<EstadoMapeo, ErrorServicio> {
        let info = self.info(id)?;
        if let Some(almacen) = &self.almacen {
            almacen.borrar(&info.guid)?;
        }
        let (mapeo, origen) = auto_mapear(&info, &self.base);
        let estado = self.estado_de(&info, mapeo, origen.into(), false);
        self.mapeos.insert(id, estado.clone());
        self.sincronizar_salida(id);
        Ok(estado)
    }

    pub fn exportar_sdl(&self, id: IdMando) -> Result<String, ErrorServicio> {
        let estado = self.mapeos.get(&id).ok_or(ErrorServicio::NoEncontrado)?;
        Ok(LineaSdl::desde_mapeo(&estado.mapeo, Some(PLATAFORMA_SDL)).to_string())
    }

    pub fn importar_sdl(&mut self, id: IdMando, linea: &str) -> Result<EstadoMapeo, ErrorServicio> {
        let mut mapeo = self.mapeo(id)?.mapeo;
        let leido = mapeo_desde_texto(linea)?;
        mapeo.asignaciones = leido.asignaciones;
        mapeo.extras_sdl = leido.extras_sdl;
        self.poner(id, mapeo, OrigenMapeo::Manual)
    }

    /// Configuracion completa del mando en JSON (preset para copiar, pegar o guardar en archivo).
    pub fn exportar_config(&self, id: IdMando) -> Result<String, ErrorServicio> {
        let estado = self.mapeos.get(&id).ok_or(ErrorServicio::NoEncontrado)?;
        serde_json::to_string_pretty(&estado.mapeo).map_err(|_| ErrorValidacion::Json.into())
    }

    /// Aplica un preset (JSON, 1 MB como mucho) a este mando, sin guardar. El GUID y el nombre
    /// pasan a ser los de este mando (los presets se pueden copiar entre modelos).
    pub fn importar_config(&mut self, id: IdMando, texto: &str) -> Result<EstadoMapeo, ErrorServicio> {
        let mapeo = desde_json(texto)?;
        self.poner(id, mapeo, OrigenMapeo::Manual)
    }

    /// Anade a la base de datos el texto de un `gamecontrollerdb.txt`. Devuelve las entradas leidas.
    pub fn anadir_base_datos(&mut self, texto: &str) -> usize {
        self.base.anadir_texto(texto)
    }

    /// Sustituye la base de datos entera (tras actualizarla o anadir mandos en disco).
    pub fn reemplazar_base_datos(&mut self, base: BaseDatosSdl) {
        self.base = base;
    }

    pub fn probar_vibracion(&mut self, id: IdMando) -> Result<(), ErrorServicio> {
        Ok(self.fuente.vibrar(id, 0.8, 0.5, Duration::from_millis(600))?)
    }

    /// Prueba de vibracion con la configuracion del mando (intercambio e intensidades aplicados).
    pub fn probar_motores(&mut self, id: IdMando, fuerte: f32, debil: f32) -> Result<(), ErrorServicio> {
        let ajuste = self.efectivo(id).ok_or(ErrorServicio::NoEncontrado)?.vibracion;
        let (f, d) = ajuste.aplicar(fuerte.clamp(0.0, 1.0), debil.clamp(0.0, 1.0));
        Ok(self.fuente.vibrar(id, f, d, Duration::from_millis(600))?)
    }

    // ------------------------------------------------------------------ mandos virtuales

    pub fn disponibilidad(&self) -> Vec<Disponibilidad> {
        self.fabrica.disponibilidad()
    }

    pub fn pausado(&self) -> bool {
        self.pausado
    }

    /// Pausa (quita los mandos virtuales y libera los fisicos) o reanuda todos.
    pub fn pausar(&mut self, pausar: bool) {
        if self.pausado == pausar {
            return;
        }
        self.pausado = pausar;
        self.motores.values_mut().for_each(Motor::reiniciar);
        self.sincronizar_todas();
        log::info!("mandos virtuales {}", if pausar { "en pausa" } else { "reanudados" });
    }

    /// Vuelve a intentar crear el mando virtual (tras dar permisos o instalar ViGEmBus).
    pub fn reintentar_salida(&mut self, id: IdMando) -> Result<VistaSalida, ErrorServicio> {
        self.info(id)?;
        self.quitar_salida(id);
        self.sincronizar_salida(id);
        Ok(self.vista_salida(id))
    }

    pub fn grabar_macro_iniciar(&mut self, id: IdMando) -> Result<(), ErrorServicio> {
        self.info(id)?;
        let ahora = self.ms();
        self.motores.entry(id).or_default().empezar_grabacion(ahora);
        Ok(())
    }

    pub fn grabar_macro_terminar(&mut self, id: IdMando) -> Result<Vec<PasoMacro>, ErrorServicio> {
        let ahora = self.ms();
        self.motores.get_mut(&id).and_then(|m| m.terminar_grabacion(ahora)).ok_or(ErrorServicio::SinGrabacion)
    }

    // ------------------------------------------------------------------ juegos

    pub fn juegos(&self) -> &[Juego] {
        &self.juegos
    }

    /// Juego activo (identificador y nombre).
    pub fn juego_activo(&self) -> Option<(String, String)> {
        self.juego_activo.and_then(|j| self.juegos.get(j)).map(|j| (j.id.clone(), j.nombre.clone()))
    }

    fn guardar_juegos(&self) -> Result<(), ErrorServicio> {
        let almacen = self.almacen_juegos.as_ref().ok_or(ErrorServicio::SinAlmacen)?;
        Ok(almacen.guardar(&self.juegos)?)
    }

    /// Anade o sustituye un juego (por su identificador). Devuelve la lista nueva.
    pub fn guardar_juego(&mut self, mut juego: Juego) -> Result<Vec<Juego>, ErrorServicio> {
        validar_juego(&mut juego)?;
        let activo = self.juego_activo().map(|(id, _)| id);
        match self.juegos.iter().position(|j| j.id == juego.id) {
            Some(i) => self.juegos[i] = juego,
            None if self.juegos.len() >= MAX_JUEGOS => return Err(ErrorJuegos::Demasiados.into()),
            None => self.juegos.push(juego),
        }
        self.guardar_juegos()?;
        self.juego_activo = activo.and_then(|a| self.juegos.iter().position(|j| j.id == a));
        self.sincronizar_todas();
        Ok(self.juegos.clone())
    }

    pub fn borrar_juego(&mut self, id: &str) -> Result<Vec<Juego>, ErrorServicio> {
        let pos = self.juegos.iter().position(|j| j.id == id).ok_or(ErrorJuegos::NoExiste)?;
        let activo = self.juego_activo().map(|(a, _)| a);
        self.juegos.remove(pos);
        self.guardar_juegos()?;
        self.juego_activo = activo.and_then(|a| self.juegos.iter().position(|j| j.id == a));
        self.sincronizar_todas();
        Ok(self.juegos.clone())
    }

    /// Copia la configuracion actual de un mando conectado en un juego.
    pub fn copiar_a_juego(&mut self, juego: &str, id: IdMando) -> Result<Vec<Juego>, ErrorServicio> {
        let mapeo = self.mapeo(id)?.mapeo;
        let mut j = self.juegos.iter().find(|j| j.id == juego).cloned().ok_or(ErrorJuegos::NoExiste)?;
        if !j.mapeos.contains_key(&mapeo.guid) && j.mapeos.len() >= MAX_MANDOS_POR_JUEGO {
            return Err(ErrorJuegos::Demasiados.into());
        }
        j.mapeos.insert(mapeo.guid.clone(), mapeo);
        self.guardar_juego(j)
    }

    pub fn quitar_de_juego(&mut self, juego: &str, guid: &str) -> Result<Vec<Juego>, ErrorServicio> {
        let mut j = self.juegos.iter().find(|j| j.id == juego).cloned().ok_or(ErrorJuegos::NoExiste)?;
        j.mapeos.remove(guid);
        self.guardar_juego(j)
    }

    /// La ventana con el foco ha cambiado (o `None` si el cambio automatico esta apagado).
    /// Devuelve si ha cambiado el juego activo.
    pub fn poner_ventana(&mut self, ventana: Option<&Ventana>) -> bool {
        let nuevo = ventana.and_then(|v| self.juegos.iter().position(|j| j.coincide(v)));
        if nuevo == self.juego_activo {
            return false;
        }
        self.juego_activo = nuevo;
        log::info!("juego activo: {}", self.juego_activo().map_or("(ninguno)".into(), |(_, n)| n));
        self.motores.values_mut().for_each(Motor::reiniciar);
        self.sincronizar_todas();
        true
    }

    // ------------------------------------------------------------------ asistente

    pub fn asistente_iniciar(&mut self, id: IdMando) -> Result<VistaAsistente, ErrorServicio> {
        let estado = self.fuente.estado(id).ok_or(ErrorServicio::NoEncontrado)?;
        let a = Asistente::con_config(&estado, self.ms(), self.config_asistente);
        let vista = a.vista();
        self.asistente = Some((id, a));
        Ok(vista)
    }

    fn asistente_de(&mut self, id: IdMando) -> Result<&mut Asistente, ErrorServicio> {
        self.asistente.as_mut().filter(|(a, _)| *a == id).map(|(_, a)| a).ok_or(ErrorServicio::SinAsistente)
    }

    pub fn asistente_saltar(&mut self, id: IdMando) -> Result<VistaAsistente, ErrorServicio> {
        let a = self.asistente_de(id)?;
        a.saltar();
        Ok(a.vista())
    }

    pub fn asistente_atras(&mut self, id: IdMando) -> Result<VistaAsistente, ErrorServicio> {
        let a = self.asistente_de(id)?;
        a.atras();
        Ok(a.vista())
    }

    /// Cierra el asistente sin cambiar el mapeo.
    pub fn asistente_cancelar(&mut self, id: IdMando) -> Result<(), ErrorServicio> {
        self.asistente_de(id)?.cancelar();
        self.asistente = None;
        Ok(())
    }

    /// Usa lo asignado en el asistente (ya terminado) como mapeo del mando, sin guardar.
    pub fn asistente_aplicar(&mut self, id: IdMando) -> Result<EstadoMapeo, ErrorServicio> {
        let a = self.asistente_de(id)?;
        if a.fase() != Fase::Terminado {
            return Err(ErrorServicio::AsistenteSinTerminar);
        }
        let asignaciones = a.asignaciones().clone();
        self.asistente = None;
        let mut mapeo = self.mapeo(id)?.mapeo;
        mapeo.asignaciones = asignaciones;
        self.poner(id, mapeo, OrigenMapeo::Asistente)
    }
}

impl Drop for Servicio {
    fn drop(&mut self) {
        // Suelta los mandos fisicos y quita los virtuales de forma ordenada (si la app se cierra
        // de golpe, el kernel lo hace igualmente al cerrar los descriptores).
        let ids: Vec<IdMando> = self.activas.keys().copied().collect();
        for id in ids {
            self.quitar_salida(id);
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::asistente::PASOS;
    use crate::dispositivos::simulado::{info_ejemplo, ControlSimulado, FuenteSimulada};
    use crate::dispositivos::Cambio;
    use crate::mapeo::acciones::{Accion, SalidaPad};
    use crate::mapeo::{Control, Fuente};
    use crate::salida::ErrorSalida;

    fn preparar(nombre: &str) -> (Servicio, ControlSimulado, PathBuf) {
        let dir = std::env::temp_dir().join(format!("gpm-servicio-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let fuente = FuenteSimulada::default();
        let control = fuente.control();
        let s = Servicio::nuevo(Box::new(fuente), BaseDatosSdl::vacia("Linux"), Some(AlmacenMapeos::en(&dir)))
            .con_config_asistente(ConfigAsistente { calibracion_ms: 0, ventana_ms: 0, ..Default::default() });
        (s, control, dir)
    }

    #[test]
    fn conectar_editar_guardar_y_reconectar() {
        let (mut s, c, dir) = preparar("ciclo");
        let id = c.conectar(info_ejemplo("Pad"), &[0.0, 0.0, -1.0, 0.0, 0.0, -1.0]);
        assert!(matches!(s.sondear(Duration::ZERO).as_slice(), [Evento::Conectado { .. }]));
        let estado = s.mapeo(id).unwrap();
        assert_eq!(estado.origen, OrigenMapeo::Heuristica);

        let mut m = estado.mapeo;
        m.asignar(Control::A, Some(Fuente::Boton { indice: 1 }));
        m.stick_izquierdo.zona_muerta = 0.3;
        let editado = s.editar_mapeo(id, m).unwrap();
        assert!(editado.sin_guardar);
        let (guardado, ruta) = s.guardar(id).unwrap();
        assert!(!guardado.sin_guardar && ruta.exists());

        c.enviar(id, Cambio::Boton { indice: 1, pulsado: true });
        s.sondear(Duration::ZERO);
        assert!(s.instantanea(id).unwrap().estandar.botones[&Control::A]);

        c.desconectar(id);
        s.sondear(Duration::ZERO);
        assert!(s.mapeo(id).is_err());
        let id2 = c.conectar(info_ejemplo("Pad"), &[]);
        s.sondear(Duration::ZERO);
        let otra_vez = s.mapeo(id2).unwrap();
        assert_eq!(otra_vez.origen, OrigenMapeo::Guardado);
        assert_eq!(otra_vez.mapeo.asignaciones[&Control::A], Fuente::Boton { indice: 1 });

        let restablecido = s.restablecer(id2).unwrap();
        assert_eq!(restablecido.mapeo.asignaciones[&Control::A], Fuente::Boton { indice: 0 });
        assert!(!ruta.exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn asistente_de_principio_a_fin() {
        let (mut s, c, dir) = preparar("asistente");
        let id = c.conectar(info_ejemplo("Pad"), &[0.0, 0.0, -1.0, 0.0, 0.0, -1.0]);
        s.sondear(Duration::ZERO);
        s.asistente_iniciar(id).unwrap();
        s.sondear(Duration::ZERO);
        assert!(matches!(s.asistente_aplicar(id), Err(ErrorServicio::AsistenteSinTerminar)));
        // A en b3, el resto se salta.
        c.enviar(id, Cambio::Boton { indice: 3, pulsado: true });
        s.sondear(Duration::ZERO);
        c.enviar(id, Cambio::Boton { indice: 3, pulsado: false });
        s.sondear(Duration::ZERO);
        let vista = s.instantanea(id).unwrap().asistente.unwrap();
        assert_eq!(vista.paso, Some(Control::B));
        for _ in 1..PASOS.len() {
            s.asistente_saltar(id).unwrap();
        }
        let estado = s.asistente_aplicar(id).unwrap();
        assert_eq!(estado.origen, OrigenMapeo::Asistente);
        assert_eq!(estado.mapeo.asignaciones.len(), 1);
        assert_eq!(estado.mapeo.asignaciones[&Control::A], Fuente::Boton { indice: 3 });
        assert!(s.instantanea(id).unwrap().asistente.is_none());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn la_interfaz_traduce_los_mensajes_de_error() {
        // ui/src/dominio/errores.ts debe tener los mismos textos para traducirlos.
        let ts = include_str!("../../ui/src/dominio/errores.ts");
        let mut textos = vec![
            ErrorServicio::NoEncontrado.to_string(),
            ErrorServicio::SinAlmacen.to_string(),
            ErrorServicio::SinAsistente.to_string(),
            ErrorServicio::AsistenteSinTerminar.to_string(),
            ErrorServicio::SinGrabacion.to_string(),
            ErrorMandos::NoEncontrado.to_string(),
            ErrorMandos::SinVibracion.to_string(),
            ErrorSalida::SinPermisoUinput.to_string(),
            ErrorSalida::SinVigem.to_string(),
            ErrorSalida::SinClienteVigem.to_string(),
            ErrorSalida::NoDisponible.to_string(),
            ErrorJuegos::NoValido.to_string(),
            ErrorJuegos::Demasiados.to_string(),
            ErrorJuegos::NoExiste.to_string(),
            crate::opciones::ErrorOpciones::Atajo.to_string(),
        ];
        use ErrorValidacion as V;
        for v in [
            V::Guid,
            V::Nombre,
            V::Indice,
            V::Demasiadas,
            V::Macro,
            V::MacroInexistente,
            V::Tecla,
            V::Capa,
            V::Version,
            V::Grande,
            V::Json,
        ] {
            textos.push(v.to_string());
        }
        for e in textos {
            assert!(ts.contains(&format!("'{e}'")), "falta «{e}» en errores.ts");
        }
    }

    #[test]
    fn exportar_importar_y_vibrar() {
        let (mut s, c, dir) = preparar("sdl");
        let id = c.conectar(info_ejemplo("Pad"), &[]);
        s.sondear(Duration::ZERO);
        let linea = s.exportar_sdl(id).unwrap();
        assert!(linea.starts_with("0000000073696d756c61646f00000000,Pad,a:b0,"), "{linea}");
        let importado = s.importar_sdl(id, &linea.replace("a:b0", "a:b5")).unwrap();
        assert_eq!(importado.mapeo.asignaciones[&Control::A], Fuente::Boton { indice: 5 });
        s.probar_vibracion(id).unwrap();
        assert_eq!(c.vibraciones().len(), 1);
        assert!(s.importar_sdl(id, "no es una linea").is_err());
        let antes = s.entradas_base_datos();
        assert_eq!(s.anadir_base_datos("03000000aaaa0000bbbb000000000000,Otro,a:b0,platform:Linux,\n# fin"), 1);
        assert_eq!(s.entradas_base_datos(), antes + 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn mando_virtual_turbo_vibracion_y_pausa() {
        let (s, c, dir) = preparar("virtual");
        let fabrica = FabricaSimulada::default();
        let mut s = s.con_salidas(Box::new(fabrica.clone()));
        let id = c.conectar(info_ejemplo("Pad"), &[0.0, 0.0, -1.0, 0.0, 0.0, -1.0]);
        s.sondear(Duration::ZERO);
        assert!(fabrica.vivos().is_empty());
        let mut m = s.mapeo(id).unwrap().mapeo;
        m.salida = TipoSalida::Dualshock4;
        m.vibracion.intercambiar = true;
        m.acciones.insert("b8".parse().unwrap(), Accion::pad(SalidaPad::Touchpad));
        s.editar_mapeo(id, m.clone()).unwrap();
        assert_eq!(fabrica.vivos(), vec![TipoSalida::Dualshock4]);
        // La entrada llega al mando virtual.
        c.enviar(id, Cambio::Boton { indice: 0, pulsado: true });
        c.enviar(id, Cambio::Boton { indice: 8, pulsado: true });
        s.sondear(Duration::ZERO);
        let pad = fabrica.ultimo(0).unwrap();
        assert!(pad.pulsado(SalidaPad::A) && pad.pulsado(SalidaPad::Touchpad));
        let i = s.instantanea(id).unwrap();
        assert!(i.salida.activa && i.salida.tipo == TipoSalida::Dualshock4 && i.pad == pad);
        // Sin cambios no se reenvia.
        let enviados = fabrica.enviados(0).len();
        s.sondear(Duration::ZERO);
        assert_eq!(fabrica.enviados(0).len(), enviados);
        // La vibracion del juego vuelve al mando fisico (con los motores intercambiados).
        fabrica.pedir_vibracion(1.0, 0.25);
        s.sondear(Duration::ZERO);
        assert_eq!(c.vibraciones().last(), Some(&(id, 0.25, 1.0)));
        // Pausa: se quita el virtual; al reanudar vuelve.
        s.pausar(true);
        assert!(fabrica.vivos().is_empty());
        assert!(!s.instantanea(id).unwrap().salida.activa);
        s.pausar(false);
        assert_eq!(fabrica.vivos(), vec![TipoSalida::Dualshock4]);
        // Cambiar de tipo sustituye el mando virtual.
        m.salida = TipoSalida::Xbox360;
        s.editar_mapeo(id, m).unwrap();
        assert_eq!(fabrica.vivos(), vec![TipoSalida::Xbox360]);
        // Al desconectar desaparece.
        c.desconectar(id);
        s.sondear(Duration::ZERO);
        assert!(fabrica.vivos().is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn sin_permiso_teclas_y_presets() {
        let (s, c, dir) = preparar("permiso");
        let fabrica = FabricaSimulada::default();
        fabrica.sin_permiso(true);
        let mut s = s.con_salidas(Box::new(fabrica.clone()));
        let id = c.conectar(info_ejemplo("Pad"), &[]);
        s.sondear(Duration::ZERO);
        let mut m = s.mapeo(id).unwrap().mapeo;
        m.salida = TipoSalida::Xbox360;
        m.acciones.insert("b8".parse().unwrap(), Accion::Tecla { tecla: "F5".into() });
        s.editar_mapeo(id, m).unwrap();
        let vista = s.vista_salida(id);
        assert!(!vista.activa);
        assert_eq!(vista.error.as_deref(), Some(ErrorSalida::SinPermisoUinput.to_string().as_str()));
        assert!(!s.disponibilidad()[0].disponible);
        fabrica.sin_permiso(false);
        assert!(s.reintentar_salida(id).unwrap().activa);
        // Tecla: se pulsa y se suelta.
        c.enviar(id, Cambio::Boton { indice: 8, pulsado: true });
        s.sondear(Duration::ZERO);
        c.enviar(id, Cambio::Boton { indice: 8, pulsado: false });
        s.sondear(Duration::ZERO);
        let f5 = crate::mapeo::acciones::indice_tecla("F5").unwrap();
        assert_eq!(fabrica.teclas(), vec![(f5, true), (f5, false)]);
        // Preset: exportar, cambiar e importar en el mismo mando; los errores se explican.
        let json = s.exportar_config(id).unwrap();
        let otro = json.replace("\"xbox360\"", "\"switchpro\"");
        assert_eq!(s.importar_config(id, &otro).unwrap().mapeo.salida, TipoSalida::Switchpro);
        assert!(matches!(s.importar_config(id, "{}"), Err(ErrorServicio::Validacion(ErrorValidacion::Json))));
        // Grabar una macro.
        assert!(matches!(s.grabar_macro_terminar(id), Err(ErrorServicio::SinGrabacion)));
        s.grabar_macro_iniciar(id).unwrap();
        s.sondear(Duration::ZERO);
        c.enviar(id, Cambio::Boton { indice: 0, pulsado: true });
        s.sondear(Duration::ZERO);
        assert!(s.instantanea(id).unwrap().grabando);
        let pasos = s.grabar_macro_terminar(id).unwrap();
        assert_eq!(pasos.first(), Some(&PasoMacro::Pulsar { salida: SalidaPad::A }));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn juegos_cambian_la_configuracion() {
        let (s, c, dir) = preparar("juegos");
        let fabrica = FabricaSimulada::default();
        let mut s = s.con_salidas(Box::new(fabrica.clone())).con_juegos(AlmacenJuegos::en(dir.join("juegos.json")));
        let id = c.conectar(info_ejemplo("Pad"), &[]);
        s.sondear(Duration::ZERO);
        let juego = Juego {
            id: "celeste".into(),
            nombre: "Celeste".into(),
            coincidencia: "Celeste.exe".into(),
            mapeos: Default::default(),
        };
        s.guardar_juego(juego).unwrap();
        // La configuracion del juego: Switch Pro.
        let mut m = s.mapeo(id).unwrap().mapeo;
        m.salida = TipoSalida::Switchpro;
        s.editar_mapeo(id, m.clone()).unwrap();
        s.copiar_a_juego("celeste", id).unwrap();
        // La normal: sin mando virtual.
        m.salida = TipoSalida::Ninguna;
        s.editar_mapeo(id, m).unwrap();
        assert!(fabrica.vivos().is_empty());
        let v = Ventana { ejecutable: "celeste.exe".into(), ..Default::default() };
        assert!(s.poner_ventana(Some(&v)));
        assert!(!s.poner_ventana(Some(&v)));
        assert_eq!(fabrica.vivos(), vec![TipoSalida::Switchpro]);
        assert_eq!(s.instantanea(id).unwrap().juego.as_deref(), Some("Celeste"));
        assert!(s.poner_ventana(Some(&Ventana { ejecutable: "otro".into(), ..Default::default() })));
        assert!(fabrica.vivos().is_empty());
        // Se guardan en disco.
        assert_eq!(AlmacenJuegos::en(dir.join("juegos.json")).cargar().unwrap().len(), 1);
        let guid = s.mapeo(id).unwrap().mapeo.guid;
        assert!(s.quitar_de_juego("celeste", &guid).unwrap()[0].mapeos.is_empty());
        assert!(s.borrar_juego("celeste").unwrap().is_empty());
        assert!(matches!(s.borrar_juego("celeste"), Err(ErrorServicio::Juegos(ErrorJuegos::NoExiste))));
        let _ = std::fs::remove_dir_all(dir);
    }
}
