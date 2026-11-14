//! Base de datos de mapeos de SDL GameControllerDB (un subconjunto incluido y, si el usuario la
//! carga, la base completa `gamecontrollerdb.txt`).

use super::sdl::{variantes_guid, LineaSdl, PLATAFORMA_SDL};
use std::collections::HashMap;
use std::io;
use std::path::Path;

/// Subconjunto incluido en la app (licencia zlib, ver `datos/LICENCIA-SDL_GameControllerDB.txt`).
pub const SUBCONJUNTO: &str = include_str!("../../datos/gamecontrollerdb-subconjunto.txt");

#[derive(Debug, Clone, Default)]
pub struct BaseDatosSdl {
    plataforma: String,
    entradas: HashMap<String, LineaSdl>,
}

impl BaseDatosSdl {
    pub fn vacia(plataforma: &str) -> Self {
        Self { plataforma: plataforma.to_owned(), entradas: HashMap::new() }
    }

    /// El subconjunto incluido, filtrado para este sistema.
    pub fn incluida() -> Self {
        let mut b = Self::vacia(PLATAFORMA_SDL);
        b.anadir_texto(SUBCONJUNTO);
        b
    }

    /// Anade (o sustituye) las lineas de la plataforma de la base o sin plataforma. Las lineas
    /// que no se entienden se ignoran, como hace SDL. Devuelve cuantas se anadieron.
    pub fn anadir_texto(&mut self, texto: &str) -> usize {
        let mut n = 0;
        for linea in texto.lines() {
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
    fn subconjunto_incluido_se_lee_entero() {
        let lineas = SUBCONJUNTO.lines().filter(|l| !l.trim().is_empty() && !l.starts_with('#')).count();
        let mut linux = BaseDatosSdl::vacia("Linux");
        let mut windows = BaseDatosSdl::vacia("Windows");
        let n = linux.anadir_texto(SUBCONJUNTO) + windows.anadir_texto(SUBCONJUNTO);
        assert_eq!(n, lineas, "todas las lineas incluidas deben entenderse");
        assert!(linux.len() > 50 && windows.len() > 50);
    }

    #[test]
    fn busca_con_el_guid_que_genera_evdev() {
        let base = {
            let mut b = BaseDatosSdl::vacia("Linux");
            b.anadir_texto(SUBCONJUNTO);
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
