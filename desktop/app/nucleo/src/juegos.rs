//! Configuraciones por juego (pestana «Juegos»): cada juego se reconoce por su ejecutable o por la
//! clase de su ventana y guarda, por modelo de mando (GUID), una configuracion completa que
//! sustituye a la normal mientras el juego tiene el foco. Es la base de los perfiles de toques de
//! la fase 2B (mismo juego, otro destino).
//!
//! Se guardan en `<carpeta de configuracion>/juegos.json`.

use crate::mapeo::almacen::carpeta_config;
use crate::mapeo::validar::{nombre_valido, validar, ErrorValidacion};
use crate::mapeo::MapeoMando;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

pub const VERSION_JUEGOS: u32 = 1;
pub const MAX_JUEGOS: usize = 200;
pub const MAX_MANDOS_POR_JUEGO: usize = 16;
pub const MAX_BYTES_JUEGOS: u64 = 8 * 1024 * 1024;

/// Ventana con el foco (lo que se compara con [`Juego::coincidencia`]).
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Ventana {
    /// Nombre del ejecutable sin ruta (`juego.exe`, `hl2_linux`).
    pub ejecutable: String,
    /// Clase de la ventana (WM_CLASS en X11; vacia en Windows).
    pub clase: String,
    pub titulo: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Juego {
    /// Identificador corto: letras minusculas, numeros y guiones.
    pub id: String,
    pub nombre: String,
    /// Ejecutable o clase de ventana (sin distinguir mayusculas; `.exe` opcional).
    pub coincidencia: String,
    /// Configuracion por GUID de mando.
    #[serde(default)]
    pub mapeos: BTreeMap<String, MapeoMando>,
    /// Perfil de toques de este juego (para juegos Android en una ventana sin adb).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub perfil_toques: Option<String>,
}

impl Juego {
    pub fn coincide(&self, v: &Ventana) -> bool {
        let quitar_exe = |s: &str| {
            let s = s.trim().to_lowercase();
            s.strip_suffix(".exe").map(str::to_owned).unwrap_or(s)
        };
        let buscado = quitar_exe(&self.coincidencia);
        !buscado.is_empty() && (quitar_exe(&v.ejecutable) == buscado || quitar_exe(&v.clase) == buscado)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ErrorJuegos {
    #[error("El juego no es válido: identificador, nombre o ejecutable incorrectos.")]
    NoValido,
    #[error("Hay demasiados juegos o mandos en un juego.")]
    Demasiados,
    #[error("Ese juego no existe.")]
    NoExiste,
    #[error(transparent)]
    Mapeo(#[from] ErrorValidacion),
    #[error("Archivo de juegos no válido: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] io::Error),
}

#[derive(Debug, Serialize, Deserialize)]
struct Archivo {
    version: u32,
    juegos: Vec<Juego>,
}

fn id_valido(id: &str) -> bool {
    (1..=40).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Comprueba un juego que llega de la interfaz (y sus configuraciones).
pub fn validar_juego(j: &mut Juego) -> Result<(), ErrorJuegos> {
    j.coincidencia = j.coincidencia.trim().to_owned();
    j.nombre = j.nombre.trim().to_owned();
    if !id_valido(&j.id)
        || j.nombre.is_empty()
        || !nombre_valido(&j.nombre, 80)
        || j.coincidencia.is_empty()
        || !nombre_valido(&j.coincidencia, 128)
        || j.coincidencia.contains(['/', '\\'])
        || j.perfil_toques.as_deref().is_some_and(|p| !crate::toques::perfiles::id_valido(p))
    {
        return Err(ErrorJuegos::NoValido);
    }
    if j.mapeos.len() > MAX_MANDOS_POR_JUEGO {
        return Err(ErrorJuegos::Demasiados);
    }
    let mut limpios = BTreeMap::new();
    for (_, mut m) in std::mem::take(&mut j.mapeos) {
        validar(&mut m)?;
        limpios.insert(m.guid.clone(), m);
    }
    j.mapeos = limpios;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct AlmacenJuegos {
    ruta: PathBuf,
}

impl AlmacenJuegos {
    pub fn en(ruta: impl Into<PathBuf>) -> Self {
        Self { ruta: ruta.into() }
    }

    pub fn por_defecto() -> Option<Self> {
        carpeta_config().map(|d| Self::en(d.join("juegos.json")))
    }

    pub fn ruta(&self) -> &Path {
        &self.ruta
    }

    /// Lee los juegos guardados; los que no son validos se descartan con un aviso.
    pub fn cargar(&self) -> Result<Vec<Juego>, ErrorJuegos> {
        match std::fs::metadata(&self.ruta) {
            Ok(m) if m.len() > MAX_BYTES_JUEGOS => return Err(ErrorJuegos::Demasiados),
            Ok(_) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e.into()),
        }
        let archivo: Archivo = serde_json::from_str(&std::fs::read_to_string(&self.ruta)?)?;
        let mut juegos = Vec::new();
        for mut j in archivo.juegos.into_iter().take(MAX_JUEGOS) {
            match validar_juego(&mut j) {
                Ok(()) => juegos.push(j),
                Err(e) => log::warn!("juego «{}» ignorado: {e}", j.id),
            }
        }
        Ok(juegos)
    }

    pub fn guardar(&self, juegos: &[Juego]) -> Result<(), ErrorJuegos> {
        if let Some(dir) = self.ruta.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = self.ruta.with_extension("json.tmp");
        let archivo = Archivo { version: VERSION_JUEGOS, juegos: juegos.to_vec() };
        std::fs::write(&tmp, serde_json::to_string_pretty(&archivo)?)?;
        std::fs::rename(&tmp, &self.ruta)?;
        Ok(())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    fn juego(id: &str, coincidencia: &str) -> Juego {
        Juego {
            id: id.into(),
            nombre: "Juego".into(),
            coincidencia: coincidencia.into(),
            mapeos: BTreeMap::new(),
            perfil_toques: None,
        }
    }

    #[test]
    fn coincide_por_ejecutable_o_clase() {
        let j = juego("hollow", "Hollow_Knight.exe");
        let v = |e: &str, c: &str| Ventana { ejecutable: e.into(), clase: c.into(), titulo: String::new() };
        assert!(j.coincide(&v("hollow_knight.EXE", "")));
        assert!(j.coincide(&v("", "hollow_knight")));
        assert!(!j.coincide(&v("otro.exe", "otro")));
        assert!(!juego("x", "  ").coincide(&v("", "")));
    }

    #[test]
    fn valida_y_guarda() {
        let dir = std::env::temp_dir().join(format!("gpm-juegos-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let a = AlmacenJuegos::en(dir.join("juegos.json"));
        assert!(a.cargar().unwrap().is_empty());
        let mut j = juego("celeste", " Celeste.exe ");
        let mut m = MapeoMando::vacio("030000005E0400008E02000014010000", "Pad");
        m.stick_izquierdo.zona_muerta = 3.0;
        j.mapeos.insert("cualquiera".into(), m);
        validar_juego(&mut j).unwrap();
        assert_eq!(j.coincidencia, "Celeste.exe");
        let guid = "030000005e0400008e02000014010000";
        assert_eq!(j.mapeos[guid].stick_izquierdo.zona_muerta, 0.9);
        a.guardar(std::slice::from_ref(&j)).unwrap();
        assert_eq!(a.cargar().unwrap(), vec![j]);
        for malo in [juego("Con Espacios", "x"), juego("ok", "../x"), juego("ok", ""), juego(&"a".repeat(41), "x")] {
            let mut malo = malo;
            assert!(matches!(validar_juego(&mut malo), Err(ErrorJuegos::NoValido)));
        }
        let _ = std::fs::remove_dir_all(dir);
    }
}
