//! Servicio de la pestana «Mandos»: une la fuente de mandos, los mapeos (guardados, automaticos o
//! editados) y el asistente. La interfaz (Tauri o pruebas) solo habla con esto.

use crate::asistente::{Asistente, ConfigAsistente, Fase, VistaAsistente};
use crate::dispositivos::{ErrorMandos, EstadoCrudo, Evento, FuenteMandos, IdMando, InfoMando};
use crate::mapeo::ajustes::{aplicar, EstadoEstandar};
use crate::mapeo::almacen::{AlmacenMapeos, ErrorAlmacen};
use crate::mapeo::auto::{auto_mapear, OrigenAuto};
use crate::mapeo::basedatos::BaseDatosSdl;
use crate::mapeo::sdl::{mapeo_desde_texto, ErrorSdl, LineaSdl, PLATAFORMA_SDL};
use crate::mapeo::MapeoMando;
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
}

/// Todo lo que la vista en vivo necesita de un mando en un instante.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Instantanea {
    pub id: IdMando,
    pub crudo: EstadoCrudo,
    pub estandar: EstadoEstandar,
    pub asistente: Option<VistaAsistente>,
}

#[derive(Debug, thiserror::Error)]
pub enum ErrorServicio {
    #[error("el mando ya no esta conectado")]
    NoEncontrado,
    #[error("no hay carpeta de configuracion donde guardar")]
    SinAlmacen,
    #[error("el asistente no esta en marcha para este mando")]
    SinAsistente,
    #[error("el asistente aun no ha terminado")]
    AsistenteSinTerminar,
    #[error(transparent)]
    Mandos(#[from] ErrorMandos),
    #[error(transparent)]
    Almacen(#[from] ErrorAlmacen),
    #[error(transparent)]
    Sdl(#[from] ErrorSdl),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub struct Servicio {
    fuente: Box<dyn FuenteMandos>,
    base: BaseDatosSdl,
    almacen: Option<AlmacenMapeos>,
    config_asistente: ConfigAsistente,
    mapeos: HashMap<IdMando, EstadoMapeo>,
    asistente: Option<(IdMando, Asistente)>,
    reloj: Instant,
}

impl Servicio {
    /// Los mandos que la fuente ya conozca reciben su mapeo al crear el servicio.
    pub fn nuevo(fuente: Box<dyn FuenteMandos>, base: BaseDatosSdl, almacen: Option<AlmacenMapeos>) -> Self {
        let mut s = Self {
            fuente,
            base,
            almacen,
            config_asistente: ConfigAsistente::default(),
            mapeos: HashMap::new(),
            asistente: None,
            reloj: Instant::now(),
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

    pub fn carpeta_mapeos(&self) -> Option<&Path> {
        self.almacen.as_ref().map(AlmacenMapeos::carpeta)
    }

    pub fn entradas_base_datos(&self) -> usize {
        self.base.len()
    }

    fn ms(&self) -> u64 {
        self.reloj.elapsed().as_millis() as u64
    }

    /// Lee la fuente (espera como mucho `espera`) y devuelve los eventos para la interfaz.
    pub fn sondear(&mut self, espera: Duration) -> Vec<Evento> {
        let mut eventos = Vec::new();
        self.fuente.sondear(espera, &mut eventos);
        let ahora = self.ms();
        for ev in &eventos {
            match ev {
                Evento::Conectado { info } => {
                    let estado = self.mapeo_inicial(info);
                    self.mapeos.insert(info.id, estado);
                }
                Evento::Desconectado { id } => {
                    self.mapeos.remove(id);
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
        eventos
    }

    fn mapeo_inicial(&self, info: &InfoMando) -> EstadoMapeo {
        if let Some(almacen) = &self.almacen {
            match almacen.cargar(&info.guid) {
                Ok(Some(mut mapeo)) => {
                    mapeo.nombre.clone_from(&info.nombre);
                    return EstadoMapeo { mapeo, origen: OrigenMapeo::Guardado, sin_guardar: false };
                }
                Ok(None) => {}
                Err(e) => log::warn!("mapeo guardado de {} ignorado: {e}", info.nombre),
            }
        }
        let (mapeo, origen) = auto_mapear(info, &self.base);
        EstadoMapeo { mapeo, origen: origen.into(), sin_guardar: false }
    }

    pub fn mandos(&self) -> Vec<InfoMando> {
        self.fuente.mandos()
    }

    fn info(&self, id: IdMando) -> Result<InfoMando, ErrorServicio> {
        self.fuente.mandos().into_iter().find(|m| m.id == id).ok_or(ErrorServicio::NoEncontrado)
    }

    pub fn instantanea(&self, id: IdMando) -> Option<Instantanea> {
        let crudo = self.fuente.estado(id)?;
        let estandar = self.mapeos.get(&id).map(|m| aplicar(&m.mapeo, &crudo)).unwrap_or_default();
        let asistente = self.asistente.as_ref().filter(|(a, _)| *a == id).map(|(_, a)| a.vista());
        Some(Instantanea { id, crudo, estandar, asistente })
    }

    pub fn mapeo(&self, id: IdMando) -> Result<EstadoMapeo, ErrorServicio> {
        self.mapeos.get(&id).cloned().ok_or(ErrorServicio::NoEncontrado)
    }

    fn poner(&mut self, id: IdMando, mut mapeo: MapeoMando, origen: OrigenMapeo) -> Result<EstadoMapeo, ErrorServicio> {
        let info = self.info(id)?;
        mapeo.guid = info.guid;
        mapeo.nombre = info.nombre;
        mapeo.stick_izquierdo = mapeo.stick_izquierdo.limitado();
        mapeo.stick_derecho = mapeo.stick_derecho.limitado();
        let estado = EstadoMapeo { mapeo, origen, sin_guardar: true };
        self.mapeos.insert(id, estado.clone());
        Ok(estado)
    }

    /// Cambios hechos en la interfaz (selectores, zona muerta...). No se guardan hasta `guardar`.
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

    /// Mapeo automatico (base de datos o heuristica), sin guardar.
    pub fn auto_mapear(&mut self, id: IdMando) -> Result<EstadoMapeo, ErrorServicio> {
        let info = self.info(id)?;
        let (mapeo, origen) = auto_mapear(&info, &self.base);
        self.poner(id, mapeo, origen.into())
    }

    /// Borra el mapeo guardado y vuelve al automatico.
    pub fn restablecer(&mut self, id: IdMando) -> Result<EstadoMapeo, ErrorServicio> {
        let info = self.info(id)?;
        if let Some(almacen) = &self.almacen {
            almacen.borrar(&info.guid)?;
        }
        let (mapeo, origen) = auto_mapear(&info, &self.base);
        let estado = EstadoMapeo { mapeo, origen: origen.into(), sin_guardar: false };
        self.mapeos.insert(id, estado.clone());
        Ok(estado)
    }

    pub fn exportar_sdl(&self, id: IdMando) -> Result<String, ErrorServicio> {
        let estado = self.mapeos.get(&id).ok_or(ErrorServicio::NoEncontrado)?;
        Ok(LineaSdl::desde_mapeo(&estado.mapeo, Some(PLATAFORMA_SDL)).to_string())
    }

    pub fn importar_sdl(&mut self, id: IdMando, linea: &str) -> Result<EstadoMapeo, ErrorServicio> {
        let actual = self.mapeo(id)?.mapeo;
        let mut mapeo = mapeo_desde_texto(linea)?;
        mapeo.stick_izquierdo = actual.stick_izquierdo;
        mapeo.stick_derecho = actual.stick_derecho;
        self.poner(id, mapeo, OrigenMapeo::Manual)
    }

    /// Anade a la base de datos un `gamecontrollerdb.txt` completo. Devuelve las entradas leidas.
    pub fn cargar_base_datos(&mut self, ruta: &Path) -> Result<usize, ErrorServicio> {
        Ok(self.base.cargar_archivo(ruta)?)
    }

    pub fn probar_vibracion(&mut self, id: IdMando) -> Result<(), ErrorServicio> {
        Ok(self.fuente.vibrar(id, 0.8, 0.5, Duration::from_millis(600))?)
    }

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

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::asistente::PASOS;
    use crate::dispositivos::simulado::{info_ejemplo, ControlSimulado, FuenteSimulada};
    use crate::dispositivos::Cambio;
    use crate::mapeo::{Control, Fuente};

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
        let _ = std::fs::remove_dir_all(dir);
    }
}
