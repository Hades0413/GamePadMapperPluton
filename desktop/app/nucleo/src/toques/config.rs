//! Configuracion de los toques.
//!
//! - Por mando ([`AjusteToques`], dentro de su configuracion): donde caen los toques (pantalla
//!   entera, una ventana o un rectangulo) y si solo con la ventana en primer plano.
//! - De la app ([`ConfigToques`], `toques.json`): detectar el juego por adb (y en que dispositivo),
//!   el perfil fijado a mano y el perfil elegido para cada juego.

use super::android::serie_valida;
use super::perfiles::{id_valido, paquete_valido};
use super::ventanas::{ObjetivoVentana, Rect, MIN_LADO};
use crate::mapeo::almacen::carpeta_config;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

pub const MAX_LADO: u32 = 16_384;
pub const MAX_POSICION: i32 = 32_768;
pub const MAX_TEXTO_VENTANA: usize = 256;
pub const MAX_ELEGIDOS: usize = 500;

/// Donde caen los toques.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "snake_case")]
pub enum DestinoToques {
    /// Todo el escritorio (Windows: el monitor principal).
    #[default]
    PantallaCompleta,
    /// Una ventana (la sigue si se mueve o cambia de tamano).
    Ventana(ObjetivoVentana),
    /// Un rectangulo fijo del escritorio.
    Rectangulo(Rect),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct AjusteToques {
    pub destino: DestinoToques,
    /// Solo tocar mientras la ventana del juego tiene el foco (con destino ventana).
    pub solo_con_foco: bool,
}

impl Default for AjusteToques {
    fn default() -> Self {
        Self { destino: DestinoToques::default(), solo_con_foco: true }
    }
}

fn texto_valido(s: &str) -> bool {
    s.chars().count() <= MAX_TEXTO_VENTANA && !s.chars().any(char::is_control)
}

impl AjusteToques {
    /// ¿Es valido lo que llega de fuera?
    pub fn valido(&self) -> bool {
        match &self.destino {
            DestinoToques::PantallaCompleta => true,
            DestinoToques::Ventana(o) => texto_valido(&o.titulo) && texto_valido(&o.clase),
            DestinoToques::Rectangulo(r) => {
                (MIN_LADO..=MAX_LADO).contains(&r.ancho)
                    && (MIN_LADO..=MAX_LADO).contains(&r.alto)
                    && (-MAX_POSICION..=MAX_POSICION).contains(&r.x)
                    && (-MAX_POSICION..=MAX_POSICION).contains(&r.y)
            }
        }
    }
}

/// Configuracion de los toques de la app (`toques.json`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ConfigToques {
    /// Detectar el juego Android en primer plano por adb.
    pub adb: bool,
    /// Serie del dispositivo (None = el primero listo).
    pub dispositivo: Option<String>,
    /// Perfil elegido a mano: manda sobre el del juego detectado.
    pub fijo: Option<String>,
    /// Perfil elegido para cada juego (paquete -> perfil).
    pub elegidos: BTreeMap<String, String>,
}

impl Default for ConfigToques {
    fn default() -> Self {
        Self { adb: true, dispositivo: None, fijo: None, elegidos: BTreeMap::new() }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ErrorConfigToques {
    #[error("La configuración de los toques no es válida.")]
    NoValida,
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Io(#[from] io::Error),
}

impl ConfigToques {
    pub fn validar(&self) -> Result<(), ErrorConfigToques> {
        let ok = self.dispositivo.as_deref().is_none_or(serie_valida)
            && self.fijo.as_deref().is_none_or(id_valido)
            && self.elegidos.len() <= MAX_ELEGIDOS
            && self.elegidos.iter().all(|(p, id)| paquete_valido(p) && id_valido(id));
        if ok {
            Ok(())
        } else {
            Err(ErrorConfigToques::NoValida)
        }
    }

    pub fn ruta() -> Option<PathBuf> {
        carpeta_config().map(|d| d.join("toques.json"))
    }

    /// Lee la configuracion (la de por defecto si no hay o no es valida).
    pub fn cargar_de(ruta: &Path) -> Self {
        let leida = std::fs::metadata(ruta)
            .ok()
            .filter(|m| m.len() < 1024 * 1024)
            .and_then(|_| std::fs::read_to_string(ruta).ok())
            .and_then(|t| serde_json::from_str::<ConfigToques>(&t).ok());
        match leida {
            Some(c) if c.validar().is_ok() => c,
            Some(_) => {
                log::warn!("{} no es válido: se usa la configuración por defecto", ruta.display());
                Self::default()
            }
            None => Self::default(),
        }
    }

    pub fn guardar_en(&self, ruta: &Path) -> Result<(), ErrorConfigToques> {
        self.validar()?;
        if let Some(dir) = ruta.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = ruta.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(self)?)?;
        std::fs::rename(&tmp, ruta)?;
        Ok(())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn destinos_en_json_y_validacion() {
        let a = AjusteToques {
            destino: DestinoToques::Rectangulo(Rect { x: 10, y: 20, ancho: 800, alto: 600 }),
            solo_con_foco: false,
        };
        let json = serde_json::to_string(&a).unwrap();
        assert_eq!(
            json,
            r#"{"destino":{"tipo":"rectangulo","x":10,"y":20,"ancho":800,"alto":600},"solo_con_foco":false}"#
        );
        assert_eq!(serde_json::from_str::<AjusteToques>(&json).unwrap(), a);
        let v: AjusteToques =
            serde_json::from_str(r#"{"destino":{"tipo":"ventana","titulo":"Waydroid","clase":"Waydroid"}}"#).unwrap();
        assert!(v.solo_con_foco && v.valido());
        assert_eq!(serde_json::from_str::<AjusteToques>("{}").unwrap(), AjusteToques::default());
        let malo = |d| AjusteToques { destino: d, solo_con_foco: true }.valido();
        assert!(!malo(DestinoToques::Rectangulo(Rect { x: 0, y: 0, ancho: 10, alto: 600 })));
        assert!(!malo(DestinoToques::Rectangulo(Rect { x: 99_999, y: 0, ancho: 800, alto: 600 })));
        assert!(!malo(DestinoToques::Ventana(ObjetivoVentana { titulo: "a\nb".into(), clase: String::new() })));
    }

    #[test]
    fn config_de_la_app() {
        let dir = std::env::temp_dir().join(format!("gpm-config-toques-{}", std::process::id()));
        let ruta = dir.join("toques.json");
        assert_eq!(ConfigToques::cargar_de(&ruta), ConfigToques::default());
        let mut c = ConfigToques { dispositivo: Some("emulator-5554".into()), ..Default::default() };
        c.elegidos.insert("com.prueba.juego".into(), "com-prueba-juego-normal".into());
        c.guardar_en(&ruta).unwrap();
        assert_eq!(ConfigToques::cargar_de(&ruta), c);
        c.elegidos.insert("../x".into(), "y".into());
        assert!(c.guardar_en(&ruta).is_err());
        c.elegidos.clear();
        c.dispositivo = Some("x; reboot".into());
        assert!(c.validar().is_err());
        std::fs::write(&ruta, r#"{"fijo":"../../etc/passwd"}"#).unwrap();
        assert_eq!(ConfigToques::cargar_de(&ruta), ConfigToques::default());
        let _ = std::fs::remove_dir_all(dir);
    }
}
