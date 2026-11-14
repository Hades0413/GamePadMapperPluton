//! Opciones de la app (pestana «Opciones»), en `<carpeta de configuracion>/opciones.json`.

use crate::mapeo::almacen::carpeta_config;
use serde::{Deserialize, Serialize};
use std::io;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tema {
    #[default]
    Oscuro,
    Claro,
    Sistema,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IdiomaApp {
    #[default]
    Auto,
    Es,
    En,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Opciones {
    /// Cerrar la ventana la esconde en la bandeja (los mandos virtuales siguen funcionando).
    pub minimizar_a_bandeja: bool,
    /// Arrancar con el sistema (se aplica en el sistema; aqui se recuerda lo elegido).
    pub iniciar_con_sistema: bool,
    /// Al arrancar, ir directo a la bandeja.
    pub iniciar_minimizado: bool,
    pub tema: Tema,
    pub idioma: IdiomaApp,
    /// Cambiar de configuracion al cambiar de juego (pestana «Juegos»).
    pub cambio_automatico: bool,
    /// Atajo de teclado global para pausar o reanudar todos los mandos virtuales.
    pub atajo_pausa: String,
    /// Guardar el registro en un archivo (`registro.log`).
    pub registro: bool,
    /// Buscar actualizaciones de la app al arrancar.
    pub buscar_actualizaciones: bool,
}

impl Default for Opciones {
    fn default() -> Self {
        Self {
            minimizar_a_bandeja: true,
            iniciar_con_sistema: false,
            iniciar_minimizado: false,
            tema: Tema::Oscuro,
            idioma: IdiomaApp::Auto,
            cambio_automatico: true,
            atajo_pausa: "Ctrl+Alt+P".into(),
            registro: false,
            buscar_actualizaciones: true,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ErrorOpciones {
    #[error("El atajo de teclado no es válido (por ejemplo: Ctrl+Alt+P).")]
    Atajo,
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

/// Modificadores y teclas aceptados en el atajo (lo que entiende el plugin de atajos globales).
const MODIFICADORES: [&str; 6] = ["Ctrl", "Alt", "Shift", "Super", "CommandOrControl", "Cmd"];

/// `Ctrl+Alt+P`: al menos un modificador y una tecla (letra, numero o F1..F12). Vacio = sin atajo.
pub fn atajo_valido(a: &str) -> bool {
    if a.is_empty() {
        return true;
    }
    if a.len() > 40 {
        return false;
    }
    let partes: Vec<&str> = a.split('+').collect();
    let Some((tecla, mods)) = partes.split_last() else { return false };
    let tecla_ok = (tecla.len() == 1 && tecla.bytes().all(|b| b.is_ascii_alphanumeric()))
        || tecla.strip_prefix('F').and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| (1..=12).contains(&n));
    !mods.is_empty() && tecla_ok && mods.iter().all(|m| MODIFICADORES.contains(m))
}

impl Opciones {
    pub fn validar(&self) -> Result<(), ErrorOpciones> {
        if atajo_valido(&self.atajo_pausa) {
            Ok(())
        } else {
            Err(ErrorOpciones::Atajo)
        }
    }

    pub fn ruta() -> Option<PathBuf> {
        carpeta_config().map(|d| d.join("opciones.json"))
    }

    /// Lee las opciones (o las de por defecto si no hay o no valen).
    pub fn cargar() -> Self {
        let Some(ruta) = Self::ruta() else { return Self::default() };
        let leidas = std::fs::read_to_string(ruta)
            .ok()
            .filter(|t| t.len() < 64 * 1024)
            .and_then(|t| serde_json::from_str::<Opciones>(&t).ok());
        match leidas {
            Some(o) if o.validar().is_ok() => o,
            _ => Self::default(),
        }
    }

    pub fn guardar(&self) -> Result<(), ErrorOpciones> {
        self.validar()?;
        let ruta = Self::ruta().ok_or_else(|| io::Error::other("sin carpeta de configuración"))?;
        if let Some(dir) = ruta.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = ruta.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(self)?)?;
        std::fs::rename(tmp, ruta)?;
        Ok(())
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn atajos() {
        for bien in ["", "Ctrl+Alt+P", "Shift+F9", "CommandOrControl+Shift+1"] {
            assert!(atajo_valido(bien), "{bien}");
        }
        for mal in ["P", "Ctrl+", "Ctrl+Alt+PP", "Hyper+P", "Ctrl+F13", "Ctrl+;rm"] {
            assert!(!atajo_valido(mal), "{mal}");
        }
    }

    #[test]
    fn json_con_valores_por_defecto() {
        let o: Opciones = serde_json::from_str(r#"{"tema":"claro"}"#).unwrap();
        assert_eq!(o.tema, Tema::Claro);
        assert!(o.minimizar_a_bandeja && o.cambio_automatico);
    }
}
