//! Base de datos de mapeos de SDL GameControllerDB, por capas (cada una sustituye a la anterior
//! para el mismo mando):
//!  1. la base completa incluida en la app (Windows y Linux, version fijada);
//!  2. la ultima version descargada con «Buscar actualizaciones» (si existe);
//!  3. los mandos que anade el usuario (archivo o lineas sueltas).

use super::sdl::{variantes_guid, LineaSdl, PLATAFORMA_SDL};
use std::collections::HashMap;
use std::io;
use std::path::Path;

/// Base completa incluida en la app (licencia zlib, ver `datos/LICENCIA-SDL_GameControllerDB.txt`).
pub const INCLUIDA: &str = include_str!("../../datos/gamecontrollerdb.txt");

/// Plataformas que interesan a la app (el resto de lineas se descartan al guardar).
pub const PLATAFORMAS_APP: [&str; 2] = ["Windows", "Linux"];
/// Limites contra archivos maliciosos o rotos: una linea SDL real ocupa unos 300 bytes.
pub const MAX_LINEA: usize = 1024;
pub const MAX_ENTRADAS: usize = 20_000;

/// Version de la base incluida (de la cabecera del archivo: «commit <sha> (<fecha>)»).
pub fn version_incluida() -> &'static str {
    INCLUIDA
        .lines()
        .take_while(|l| l.starts_with('#'))
        .find_map(|l| l.split("commit ").nth(1))
        .and_then(|r| r.split(['(', ')']).nth(1))
        .unwrap_or("?")
}

/// Une dos textos de gamecontrollerdb: las lineas de `nuevo` sustituyen a las de `existente` con
/// el mismo mando y plataforma, y se anaden las demas. Solo se guardan lineas validas de Windows,
/// Linux o sin plataforma. Devuelve el texto resultante y cuantas lineas aporto `nuevo`.
pub fn fusionar(existente: &str, nuevo: &str) -> (String, usize) {
    let valida = |l: &LineaSdl| l.plataforma.as_deref().is_none_or(|p| PLATAFORMAS_APP.contains(&p));
    let mut orden: Vec<(String, Option<String>)> = Vec::new();
    let mut lineas: HashMap<(String, Option<String>), String> = HashMap::new();
    let mut aportadas = 0;
    for (texto, es_nuevo) in [(existente, false), (nuevo, true)] {
        for linea in texto.lines() {
            if linea.len() > MAX_LINEA {
                continue;
            }
            let Ok(Some(l)) = LineaSdl::leer(linea) else { continue };
            if !valida(&l)
                || (orden.len() >= MAX_ENTRADAS && !lineas.contains_key(&(l.guid.clone(), l.plataforma.clone())))
            {
                continue;
            }
            let clave = (l.guid.clone(), l.plataforma.clone());
            if !lineas.contains_key(&clave) {
                orden.push(clave.clone());
            }
            lineas.insert(clave, linea.trim().to_owned());
            if es_nuevo {
                aportadas += 1;
            }
        }
    }
    let mut salida = String::new();
    for clave in &orden {
        salida.push_str(&lineas[clave]);
        salida.push('\n');
    }
    (salida, aportadas)
}

#[derive(Debug, Clone, Default)]
pub struct BaseDatosSdl {
    plataforma: String,
    entradas: HashMap<String, LineaSdl>,
}

impl BaseDatosSdl {
    pub fn vacia(plataforma: &str) -> Self {
        Self { plataforma: plataforma.to_owned(), entradas: HashMap::new() }
    }

    /// La base completa incluida, filtrada para este sistema.
    pub fn incluida() -> Self {
        let mut b = Self::vacia(PLATAFORMA_SDL);
        b.anadir_texto(INCLUIDA);
        b
    }

    /// Anade (o sustituye) las lineas de la plataforma de la base o sin plataforma. Las lineas
    /// que no se entienden se ignoran, como hace SDL. Devuelve cuantas se anadieron.
    pub fn anadir_texto(&mut self, texto: &str) -> usize {
        let mut n = 0;
        for linea in texto.lines().filter(|l| l.len() <= MAX_LINEA) {
            if self.entradas.len() >= MAX_ENTRADAS {
                break;
            }
            match LineaSdl::leer(linea) {
                Ok(Some(l)) if l.plataforma.as_deref().is_none_or(|p| p == self.plataforma) => {
                    self.entradas.insert(l.guid.clone(), l);
                    n += 1;
                }
                Ok(_) => {}
                Err(e) => log::debug!("linea de gamecontrollerdb ignorada: {e}"),
            }
        }
        n
    }

    pub fn cargar_archivo(&mut self, ruta: &Path) -> io::Result<usize> {
        Ok(self.anadir_texto(&std::fs::read_to_string(ruta)?))
    }

    pub fn len(&self) -> usize {
        self.entradas.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entradas.is_empty()
    }

    /// Busca como SDL: el GUID exacto, luego sin CRC del nombre y luego tambien sin version.
    pub fn buscar(&self, guid: &str) -> Option<&LineaSdl> {
        variantes_guid(&guid.to_ascii_lowercase()).iter().find_map(|g| self.entradas.get(g))
    }
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::mapeo::sdl::guid_sdl;

    #[test]
    fn base_incluida_completa_se_lee_entera() {
        let lineas = INCLUIDA.lines().filter(|l| !l.trim().is_empty() && !l.starts_with('#')).count();
        let mut linux = BaseDatosSdl::vacia("Linux");
        let mut windows = BaseDatosSdl::vacia("Windows");
        let n = linux.anadir_texto(INCLUIDA) + windows.anadir_texto(INCLUIDA);
        assert_eq!(n, lineas, "todas las lineas incluidas deben entenderse");
        // La base completa: cientos de mandos en cada sistema, no un subconjunto.
        assert!(linux.len() > 500 && windows.len() > 600, "linux={} windows={}", linux.len(), windows.len());
        assert_eq!(version_incluida(), "2026-11-09");
    }

    #[test]
    fn fusionar_sustituye_anade_y_descarta_otras_plataformas() {
        let base = "\
03000000aaaa0000bbbb000000000000,Uno,a:b0,platform:Linux,
03000000cccc0000dddd000000000000,Dos,a:b0,platform:Windows,
";
        let nuevo = "\
# comentario
03000000aaaa0000bbbb000000000000,Uno nuevo,a:b3,platform:Linux,
03000000eeee0000ffff000000000000,Tres,a:b1,platform:Linux,
03000000eeee0000ffff000000000000,Tres mac,a:b1,platform:Mac OS X,
basura
";
        let (texto, aportadas) = fusionar(base, nuevo);
        assert_eq!(aportadas, 2);
        assert_eq!(texto.lines().count(), 3);
        assert!(texto.contains("Uno nuevo,a:b3") && !texto.contains("Uno,a:b0"));
        assert!(texto.contains("Dos,") && texto.contains("Tres,") && !texto.contains("Mac OS X"));
        // Lineas demasiado largas se ignoran.
        let larga = format!("03000000aaaa0000bbbb000000000001,{},a:b0,platform:Linux,", "x".repeat(MAX_LINEA));
        assert_eq!(fusionar("", &larga).1, 0);
        // Fusionar otra vez lo mismo no duplica nada.
        let (otra, _) = fusionar(&texto, nuevo);
        assert_eq!(otra, texto);
    }

    #[test]
    fn busca_con_el_guid_que_genera_evdev() {
        let base = {
            let mut b = BaseDatosSdl::vacia("Linux");
            b.anadir_texto(INCLUIDA);
            b
        };
        // Un Xbox 360 por USB con su nombre: el GUID lleva CRC, la base no.
        let guid = guid_sdl(0x03, 0x045e, 0x028e, 0x0114, "Microsoft X-Box 360 pad");
        let l = base.buscar(&guid).expect("deberia encontrar el mando de Xbox 360");
        assert_eq!(l.entrada("a"), Some("b0"));
        assert_eq!(base.buscar("ffffffffffffffffffffffffffffffff"), None);
    }

    #[test]
    fn filtra_por_plataforma_y_sustituye() {
        let mut b = BaseDatosSdl::vacia("Linux");
        let texto = "\
03000000aaaa0000bbbb000000000000,Uno,a:b0,platform:Windows,
03000000aaaa0000bbbb000000000000,Uno,a:b1,platform:Linux,
basura
03000000cccc0000dddd000000000000,Sin plataforma,a:b2,
";
        assert_eq!(b.anadir_texto(texto), 2);
        assert_eq!(b.buscar("03000000aaaa0000bbbb000000000000").unwrap().entrada("a"), Some("b1"));
        b.anadir_texto("03000000aaaa0000bbbb000000000000,Uno bis,a:b5,platform:Linux,");
        assert_eq!(b.buscar("03000000aaaa0000bbbb000000000000").unwrap().entrada("a"), Some("b5"));
    }
}
