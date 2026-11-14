//! Formato SDL GameControllerDB: `GUID,nombre,salida:entrada,...,platform:Linux,` y el GUID que SDL
//! calcula para cada mando.

use super::{Control, Fuente, MapeoMando};
use std::fmt;

/// Una linea de SDL GameControllerDB tal cual (conserva el orden de los pares).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LineaSdl {
    pub guid: String,
    pub nombre: String,
    /// (salida, entrada) sin `platform`, en el orden de la linea.
    pub pares: Vec<(String, String)>,
    pub plataforma: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ErrorSdl {
    #[error("linea incompleta: faltan el GUID o el nombre")]
    Incompleta,
    #[error("GUID no valido: «{0}»")]
    GuidNoValido(String),
    #[error("par no valido: «{0}»")]
    ParNoValido(String),
}

/// ¿Es un GUID de SDL? (32 hexadecimales, o el especial `xinput`).
pub fn guid_valido(guid: &str) -> bool {
    guid == "xinput" || (guid.len() == 32 && guid.bytes().all(|b| b.is_ascii_hexdigit()))
}

impl LineaSdl {
    /// Lee una linea. Devuelve `Ok(None)` en lineas vacias y comentarios (`#`).
    pub fn leer(linea: &str) -> Result<Option<LineaSdl>, ErrorSdl> {
        let linea = linea.trim();
        if linea.is_empty() || linea.starts_with('#') {
            return Ok(None);
        }
        let mut partes = linea.split(',');
        let guid = partes.next().ok_or(ErrorSdl::Incompleta)?.trim().to_ascii_lowercase();
        let nombre = partes.next().ok_or(ErrorSdl::Incompleta)?.trim().to_owned();
        if !guid_valido(&guid) {
            return Err(ErrorSdl::GuidNoValido(guid));
        }
        let mut pares = Vec::new();
        let mut plataforma = None;
        for par in partes.map(str::trim).filter(|p| !p.is_empty()) {
            let (salida, entrada) = par.split_once(':').ok_or_else(|| ErrorSdl::ParNoValido(par.to_owned()))?;
            if salida.is_empty() || entrada.is_empty() {
                return Err(ErrorSdl::ParNoValido(par.to_owned()));
            }
            if salida == "platform" {
                plataforma = Some(entrada.to_owned());
            } else {
                pares.push((salida.to_owned(), entrada.to_owned()));
            }
        }
        Ok(Some(LineaSdl { guid, nombre, pares, plataforma }))
    }

    pub fn entrada(&self, salida: &str) -> Option<&str> {
        self.pares.iter().find(|(s, _)| s == salida).map(|(_, e)| e.as_str())
    }

    /// Convierte la linea en un mapeo. Lo que no es un control estandar (o no se entiende) va a
    /// `extras_sdl`.
    pub fn a_mapeo(&self) -> MapeoMando {
        let mut m = MapeoMando::vacio(&self.guid, &self.nombre);
        for (salida, entrada) in &self.pares {
            match (Control::desde_sdl(salida), entrada.parse::<Fuente>()) {
                (Some(c), Ok(f)) => {
                    m.asignaciones.insert(c, f);
                }
                _ => {
                    m.extras_sdl.insert(salida.clone(), entrada.clone());
                }
            }
        }
        m
    }

    /// Linea SDL de un mapeo (los controles en el orden de [`Control::TODOS`], luego los extras).
    pub fn desde_mapeo(m: &MapeoMando, plataforma: Option<&str>) -> LineaSdl {
        let mut pares: Vec<(String, String)> =
            m.asignaciones.iter().map(|(c, f)| (c.nombre_sdl().to_owned(), f.to_string())).collect();
        pares.extend(m.extras_sdl.iter().map(|(s, e)| (s.clone(), e.clone())));
        LineaSdl {
            guid: m.guid.clone(),
            // Las comas romperian la linea.
            nombre: m.nombre.replace(',', " "),
            pares,
            plataforma: plataforma.map(str::to_owned),
        }
    }
}

impl fmt::Display for LineaSdl {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{},{},", self.guid, self.nombre)?;
        for (s, e) in &self.pares {
            write!(f, "{s}:{e},")?;
        }
        if let Some(p) = &self.plataforma {
            write!(f, "platform:{p},")?;
        }
        Ok(())
    }
}

/// Plataforma de SDL del sistema actual (para filtrar la base de datos).
pub const PLATAFORMA_SDL: &str = if cfg!(windows) {
    "Windows"
} else if cfg!(target_os = "macos") {
    "Mac OS X"
} else {
    "Linux"
};

/// CRC-16 de SDL (`SDL_crc16`, polinomio 0xA001 reflejado: CRC-16/ARC).
pub fn crc16(datos: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &b in datos {
        crc ^= u16::from(b);
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xA001 } else { crc >> 1 };
        }
    }
    crc
}

/// GUID de SDL2 (>= 2.26) para un mando: bus, CRC16 del nombre, fabricante, producto y version
/// en little-endian. Sin fabricante ni producto, SDL pone el nombre en lugar de los ids.
pub fn guid_sdl(bus: u16, vendedor: u16, producto: u16, version: u16, nombre: &str) -> String {
    let mut g = [0u8; 16];
    g[0..2].copy_from_slice(&bus.to_le_bytes());
    let crc = if nombre.is_empty() { 0 } else { crc16(nombre.as_bytes()) };
    g[2..4].copy_from_slice(&crc.to_le_bytes());
    if vendedor != 0 || producto != 0 {
        g[4..6].copy_from_slice(&vendedor.to_le_bytes());
        g[8..10].copy_from_slice(&producto.to_le_bytes());
        g[12..14].copy_from_slice(&version.to_le_bytes());
    } else {
        // 11 bytes de nombre como maximo y un 0 final (SDL_strlcpy en 12 bytes).
        for (d, s) in g[4..15].iter_mut().zip(nombre.bytes()) {
            *d = s;
        }
    }
    g.iter().map(|b| format!("{b:02x}")).collect()
}

/// Variantes del GUID que SDL tambien acepta al buscar en la base de datos: sin CRC del nombre y,
/// ademas, sin version (las entradas antiguas no los llevan).
pub fn variantes_guid(guid: &str) -> Vec<String> {
    let mut v = vec![guid.to_owned()];
    if guid.len() == 32 && guid.is_ascii() {
        let sin_crc = format!("{}0000{}", &guid[..4], &guid[8..]);
        let sin_version = format!("{}0000{}", &sin_crc[..24], &sin_crc[28..]);
        for g in [sin_crc, sin_version] {
            if !v.contains(&g) {
                v.push(g);
            }
        }
    }
    v
}

/// Mapeo a partir de una linea pegada por el usuario (importar).
pub fn mapeo_desde_texto(linea: &str) -> Result<MapeoMando, ErrorSdl> {
    Ok(LineaSdl::leer(linea)?.ok_or(ErrorSdl::Incompleta)?.a_mapeo())
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::mapeo::Mitad;
    use std::collections::BTreeMap;

    fn pares_ordenados(l: &LineaSdl) -> BTreeMap<&str, &str> {
        l.pares.iter().map(|(s, e)| (s.as_str(), e.as_str())).collect()
    }

    // Lineas reales de SDL_GameControllerDB (zlib).
    const XBOX360_LINUX: &str = "030000005e0400008e02000014010000,Xbox 360 Controller,a:b0,b:b1,back:b6,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1,guide:b8,leftshoulder:b4,leftstick:b9,lefttrigger:a2,leftx:a0,lefty:a1,rightshoulder:b5,rightstick:b10,righttrigger:a5,rightx:a3,righty:a4,start:b7,x:b2,y:b3,platform:Linux,";
    const PS4_LINUX: &str = "030000004c050000c405000011810000,PS4 Controller,a:b0,b:b1,back:b8,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1,guide:b10,leftshoulder:b4,leftstick:b11,lefttrigger:a2,leftx:a0,lefty:a1,rightshoulder:b5,rightstick:b12,righttrigger:a5,rightx:a3,righty:a4,start:b9,x:b3,y:b2,platform:Linux,";
    const PDP_BOTONES_CRUCETA: &str = "030000006f0e0000b20200000f010000,PDP Xbox One Controller,a:b0,b:b1,y:b3,x:b2,start:b7,back:b6,leftstick:b9,rightstick:b10,leftshoulder:b4,rightshoulder:b5,dpup:b12,dpleft:b14,dpdown:b13,dpright:b15,leftx:a0,lefty:a1,rightx:a3,righty:a4,lefttrigger:a2,righttrigger:a5,platform:Linux,";
    const BDA_PS4: &str = "03000000d62000002a79000011010000,BDA PS4 Fightpad,a:b1,b:b2,back:b8,dpdown:h0.4,dpleft:h0.8,dpright:h0.2,dpup:h0.1,guide:b12,leftshoulder:b4,leftstick:b10,lefttrigger:a3,leftx:a0,lefty:a1,rightshoulder:b5,rightstick:b11,righttrigger:a4,rightx:a2,righty:a5,start:b9,touchpad:b13,x:b0,y:b3,platform:Linux,";

    #[test]
    fn lee_lineas_reales() {
        let l = LineaSdl::leer(XBOX360_LINUX).unwrap().unwrap();
        assert_eq!(l.guid, "030000005e0400008e02000014010000");
        assert_eq!(l.nombre, "Xbox 360 Controller");
        assert_eq!(l.plataforma.as_deref(), Some("Linux"));
        assert_eq!(l.entrada("lefttrigger"), Some("a2"));
        let m = l.a_mapeo();
        assert_eq!(m.asignaciones.len(), 21);
        assert_eq!(m.asignaciones[&Control::DpadLeft], Fuente::Hat { indice: 0, mascara: 8 });
        assert_eq!(m.asignaciones[&Control::Home], Fuente::Boton { indice: 8 });
        assert!(m.extras_sdl.is_empty());

        let ps4 = LineaSdl::leer(PS4_LINUX).unwrap().unwrap().a_mapeo();
        assert_eq!(ps4.asignaciones[&Control::X], Fuente::Boton { indice: 3 });
        assert_eq!(ps4.asignaciones[&Control::Y], Fuente::Boton { indice: 2 });

        let pdp = LineaSdl::leer(PDP_BOTONES_CRUCETA).unwrap().unwrap().a_mapeo();
        assert_eq!(pdp.asignaciones[&Control::DpadRight], Fuente::Boton { indice: 15 });

        let bda = LineaSdl::leer(BDA_PS4).unwrap().unwrap().a_mapeo();
        assert_eq!(bda.extras_sdl.get("touchpad").map(String::as_str), Some("b13"));
    }

    #[test]
    fn ejes_partidos_e_invertidos() {
        let l = "0300000000000000000000000000000f,Prueba,dpleft:-a6,dpright:+a6,lefty:a1~,+leftx:b3,platform:Linux,";
        let m = LineaSdl::leer(l).unwrap().unwrap().a_mapeo();
        assert_eq!(
            m.asignaciones[&Control::DpadLeft],
            Fuente::Eje { indice: 6, mitad: Mitad::Negativa, invertido: false }
        );
        assert_eq!(m.asignaciones[&Control::LsY], Fuente::Eje { indice: 1, mitad: Mitad::Completa, invertido: true });
        // Media salida de eje: aun no se usa, se conserva.
        assert_eq!(m.extras_sdl.get("+leftx").map(String::as_str), Some("b3"));
    }

    #[test]
    fn ida_y_vuelta_exacta_de_la_linea() {
        for linea in [XBOX360_LINUX, PS4_LINUX, PDP_BOTONES_CRUCETA, BDA_PS4] {
            assert_eq!(LineaSdl::leer(linea).unwrap().unwrap().to_string(), linea);
        }
    }

    #[test]
    fn ida_y_vuelta_del_mapeo() {
        for linea in [XBOX360_LINUX, PS4_LINUX, PDP_BOTONES_CRUCETA, BDA_PS4] {
            let m = LineaSdl::leer(linea).unwrap().unwrap().a_mapeo();
            let texto = LineaSdl::desde_mapeo(&m, Some("Linux")).to_string();
            let otra = LineaSdl::leer(&texto).unwrap().unwrap();
            assert_eq!(otra.a_mapeo(), m);
            assert_eq!(pares_ordenados(&otra), pares_ordenados(&LineaSdl::leer(linea).unwrap().unwrap()));
        }
    }

    #[test]
    fn comentarios_y_errores() {
        assert_eq!(LineaSdl::leer("# comentario").unwrap(), None);
        assert_eq!(LineaSdl::leer("   ").unwrap(), None);
        assert!(matches!(LineaSdl::leer("zz,Nombre,a:b0"), Err(ErrorSdl::GuidNoValido(_))));
        assert!(matches!(LineaSdl::leer("030000005e0400008e02000014010000,X,a"), Err(ErrorSdl::ParNoValido(_))));
        assert!(matches!(LineaSdl::leer("030000005e0400008e02000014010000"), Err(ErrorSdl::Incompleta)));
        assert!(LineaSdl::leer("xinput,XInput Controller,a:b0,").unwrap().is_some());
    }

    #[test]
    fn crc16_de_sdl() {
        // Valor de comprobacion de CRC-16/ARC.
        assert_eq!(crc16(b"123456789"), 0xBB3D);
        assert_eq!(crc16(b""), 0);
    }

    #[test]
    fn guid_como_sdl() {
        // Mando de Xbox 360 por USB: la base de datos lo lista sin CRC.
        let g = guid_sdl(0x03, 0x045e, 0x028e, 0x0114, "");
        assert_eq!(g, "030000005e0400008e02000014010000");
        // Con nombre, SDL >= 2.26 mete el CRC16 del nombre en los bytes 2-3.
        let con_nombre = guid_sdl(0x03, 0x045e, 0x028e, 0x0114, "Microsoft X-Box 360 pad");
        let crc = crc16(b"Microsoft X-Box 360 pad").to_le_bytes();
        assert_eq!(&con_nombre[4..8], format!("{:02x}{:02x}", crc[0], crc[1]));
        assert_eq!(&con_nombre[8..], &g[8..]);
        // Bluetooth (bus 5) de un DualShock 4.
        assert_eq!(guid_sdl(0x05, 0x054c, 0x05c4, 0x8100, ""), "050000004c050000c405000000810000");
        // Sin fabricante ni producto: el nombre va en el GUID.
        let virtual_ = guid_sdl(0x06, 0, 0, 0, "Pad");
        assert!(virtual_.starts_with("0600"));
        assert_eq!(&virtual_[8..14], "506164");
    }

    #[test]
    fn variantes_para_buscar() {
        let v = variantes_guid("03001234 5e0400008e02000014010000".replace(' ', "").as_str());
        assert_eq!(v[1], "030000005e0400008e02000014010000");
        assert_eq!(v[2], "030000005e0400008e02000000000000");
    }

    #[test]
    fn importar_texto() {
        let m = mapeo_desde_texto(XBOX360_LINUX).unwrap();
        assert_eq!(m.nombre, "Xbox 360 Controller");
        assert_eq!(m.asignaciones[&Control::R2], Fuente::eje(5));
    }
}
