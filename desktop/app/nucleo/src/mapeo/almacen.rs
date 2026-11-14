//! Mapeos guardados, uno por modelo de mando: `<carpeta>/<guid>.json`.
//!
//! Carpeta por defecto: `$XDG_CONFIG_HOME/gamepad-mapper-pluton/mandos` (o `~/.config/...`) en
//! Linux y `%APPDATA%\GamepadMapperPluton\mandos` en Windows.

use super::sdl::guid_valido;
use super::{MapeoMando, VERSION_MAPEO};
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum ErrorAlmacen {
    #[error("GUID no válido: «{0}»")]
    GuidNoValido(String),
    #[error("El mapeo guardado es de una versión más nueva ({0}): actualiza la app.")]
    VersionNueva(u32),
    #[error("Archivo de mapeo no válido: {0}")]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] io::Error),
}

#[derive(Debug, Clone)]
pub struct AlmacenMapeos {
    dir: PathBuf,
}

/// Carpeta de configuracion de la app en este sistema.
pub fn carpeta_config() -> Option<PathBuf> {
    let no_vacia = |v: std::ffi::OsString| (!v.is_empty()).then(|| PathBuf::from(v));
    if cfg!(windows) {
        std::env::var_os("APPDATA").and_then(no_vacia).map(|d| d.join("GamepadMapperPluton"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .and_then(no_vacia)
            .or_else(|| std::env::var_os("HOME").and_then(no_vacia).map(|h| h.join(".config")))
            .map(|d| d.join("gamepad-mapper-pluton"))
    }
}

impl AlmacenMapeos {
    pub fn en(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn por_defecto() -> Option<Self> {
        carpeta_config().map(|d| Self::en(d.join("mandos")))
    }

    pub fn carpeta(&self) -> &Path {
        &self.dir
    }

    fn ruta(&self, guid: &str) -> Result<PathBuf, ErrorAlmacen> {
        // El GUID da nombre al archivo: solo hexadecimal (o «xinput»), nunca rutas.
        if !guid_valido(guid) {
            return Err(ErrorAlmacen::GuidNoValido(guid.to_owned()));
        }
        Ok(self.dir.join(format!("{}.json", guid.to_ascii_lowercase())))
    }

    pub fn cargar(&self, guid: &str) -> Result<Option<MapeoMando>, ErrorAlmacen> {
        let texto = match std::fs::read_to_string(self.ruta(guid)?) {
            Ok(t) => t,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        let mut m: MapeoMando = serde_json::from_str(&texto)?;
        if m.version > VERSION_MAPEO {
            return Err(ErrorAlmacen::VersionNueva(m.version));
        }
        m.stick_izquierdo = m.stick_izquierdo.limitado();
        m.stick_derecho = m.stick_derecho.limitado();
        Ok(Some(m))
    }

    /// Guarda de forma atomica (archivo temporal + renombrar).
    pub fn guardar(&self, m: &MapeoMando) -> Result<PathBuf, ErrorAlmacen> {
        let ruta = self.ruta(&m.guid)?;
        std::fs::create_dir_all(&self.dir)?;
        let tmp = ruta.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(m)?)?;
        std::fs::rename(&tmp, &ruta)?;
        Ok(ruta)
    }

    /// Borra el mapeo guardado. Devuelve si existia.
    pub fn borrar(&self, guid: &str) -> Result<bool, ErrorAlmacen> {
        match std::fs::remove_file(self.ruta(guid)?) {
            Ok(()) => Ok(true),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(e.into()),
        }
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::mapeo::Control;

    fn carpeta_temporal(nombre: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("gpm-almacen-{nombre}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn guarda_carga_y_borra() {
        let dir = carpeta_temporal("ciclo");
        let a = AlmacenMapeos::en(&dir);
        let guid = "030000005e0400008e02000014010000";
        assert!(a.cargar(guid).unwrap().is_none());
        let mut m = MapeoMando::vacio(guid, "Xbox 360");
        m.asignar(Control::A, Some("b0".parse().unwrap()));
        m.stick_derecho.curva = 2.0;
        let ruta = a.guardar(&m).unwrap();
        assert_eq!(ruta, dir.join(format!("{guid}.json")));
        assert_eq!(a.cargar(guid).unwrap(), Some(m));
        assert!(a.borrar(guid).unwrap());
        assert!(!a.borrar(guid).unwrap());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn rechaza_guid_que_no_es_hexadecimal() {
        let a = AlmacenMapeos::en(carpeta_temporal("guid"));
        for malo in ["../../etc/passwd", "", "0300", "zz000000000000000000000000000000"] {
            assert!(matches!(a.cargar(malo), Err(ErrorAlmacen::GuidNoValido(_))));
        }
    }

    #[test]
    fn rechaza_versiones_futuras_y_limita_ajustes() {
        let dir = carpeta_temporal("version");
        std::fs::create_dir_all(&dir).unwrap();
        let guid = "0300000000000000000000000000000a";
        let a = AlmacenMapeos::en(&dir);
        std::fs::write(
            dir.join(format!("{guid}.json")),
            format!(r#"{{"version":99,"guid":"{guid}","nombre":"x","asignaciones":{{}}}}"#),
        )
        .unwrap();
        assert!(matches!(a.cargar(guid), Err(ErrorAlmacen::VersionNueva(99))));
        std::fs::write(
            dir.join(format!("{guid}.json")),
            format!(r#"{{"version":1,"guid":"{guid}","nombre":"x","asignaciones":{{"A":"b0"}},"stick_izquierdo":{{"zona_muerta":5}}}}"#),
        )
        .unwrap();
        let m = a.cargar(guid).unwrap().unwrap();
        assert_eq!(m.stick_izquierdo.zona_muerta, 0.9);
        let _ = std::fs::remove_dir_all(dir);
    }
}
