//! Validacion de una configuracion de mando que llega de fuera (interfaz, preset pegado o archivo,
//! perfil de juego): tamanos, rangos y referencias. Los numeros fuera de rango se recortan con
//! [`MapeoMando::limitar`]; lo que no tiene arreglo se rechaza con un [`ErrorValidacion`].

use super::acciones::{indice_tecla, Accion, Entrada, PasoMacro};
use super::sdl::guid_valido;
use super::{Fuente, MapeoMando, VERSION_MAPEO};
use std::collections::BTreeSet;

pub const MAX_ACCIONES: usize = 256;
pub const MAX_CAPAS: usize = 4;
pub const MAX_MACROS: usize = 32;
pub const MAX_PASOS: usize = 64;
pub const MAX_MS_PASO: u32 = 10_000;
pub const MIN_MS_TOQUE: u32 = 10;
pub const MAX_NOMBRE: usize = 64;
pub const MAX_NOMBRE_MANDO: usize = 128;
pub const MAX_EXTRAS_SDL: usize = 64;
/// Indices de botones y ejes crudos (evdev numera menos de 1024 teclas y 64 ejes).
pub const MAX_INDICE: u16 = 1024;
pub const MAX_HATS: u8 = 16;
/// Tamano maximo de una configuracion en JSON (preset pegado o archivo).
pub const MAX_BYTES_PRESET: usize = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ErrorValidacion {
    #[error("La configuración no es válida: GUID incorrecto.")]
    Guid,
    #[error("La configuración no es válida: un nombre es demasiado largo o tiene caracteres de control.")]
    Nombre,
    #[error("La configuración no es válida: hay una entrada fuera de rango.")]
    Indice,
    #[error("La configuración tiene demasiadas acciones, capas o macros.")]
    Demasiadas,
    #[error("Una macro no es válida: como mucho 64 pasos y 10 s por paso.")]
    Macro,
    #[error("Una acción usa una macro que no existe.")]
    MacroInexistente,
    #[error("Una acción usa una tecla desconocida.")]
    Tecla,
    #[error("Una capa no es válida: modificador repetido o usado dentro de la propia capa.")]
    Capa,
    #[error("La configuración es de una versión más nueva: actualiza la app.")]
    Version,
    #[error("La configuración es demasiado grande (máximo 1 MB).")]
    Grande,
    #[error("El texto no es una configuración de mando válida.")]
    Json,
    #[error("El destino de los toques no es válido.")]
    Toques,
}

pub(crate) fn nombre_valido(s: &str, max: usize) -> bool {
    s.chars().count() <= max && !s.chars().any(char::is_control)
}

fn fuente_valida(f: &Fuente) -> bool {
    match *f {
        Fuente::Boton { indice } | Fuente::Eje { indice, .. } => indice < MAX_INDICE,
        Fuente::Hat { indice, .. } => indice < MAX_HATS,
    }
}

fn entrada_valida(e: &Entrada) -> bool {
    match e {
        Entrada::Control(_) => true,
        Entrada::Cruda(f) => fuente_valida(f),
    }
}

fn accion_valida(a: &Accion, macros: &BTreeSet<u32>) -> Result<(), ErrorValidacion> {
    match a {
        Accion::Macro { macro_id } if !macros.contains(macro_id) => Err(ErrorValidacion::MacroInexistente),
        Accion::Tecla { tecla } if indice_tecla(tecla).is_none() => Err(ErrorValidacion::Tecla),
        _ => Ok(()),
    }
}

/// Comprueba la configuracion y la deja lista para usar (version actual, numeros en rango).
pub fn validar(m: &mut MapeoMando) -> Result<(), ErrorValidacion> {
    if m.version > VERSION_MAPEO {
        return Err(ErrorValidacion::Version);
    }
    if !guid_valido(&m.guid.to_ascii_lowercase()) {
        return Err(ErrorValidacion::Guid);
    }
    if !nombre_valido(&m.nombre, MAX_NOMBRE_MANDO) {
        return Err(ErrorValidacion::Nombre);
    }
    if !m.asignaciones.values().all(fuente_valida) {
        return Err(ErrorValidacion::Indice);
    }
    if m.extras_sdl.len() > MAX_EXTRAS_SDL
        || m.acciones.len() > MAX_ACCIONES
        || m.capas.len() > MAX_CAPAS
        || m.macros.len() > MAX_MACROS
        || m.capas.iter().any(|c| c.acciones.len() > MAX_ACCIONES)
    {
        return Err(ErrorValidacion::Demasiadas);
    }
    if !m.extras_sdl.iter().all(|(k, v)| nombre_valido(k, 32) && nombre_valido(v, 32)) {
        return Err(ErrorValidacion::Nombre);
    }
    if !m.toques.valido() {
        return Err(ErrorValidacion::Toques);
    }

    let mut ids = BTreeSet::new();
    for mac in &m.macros {
        if !nombre_valido(&mac.nombre, MAX_NOMBRE) {
            return Err(ErrorValidacion::Nombre);
        }
        let pasos_validos = mac.pasos.iter().all(|p| match p {
            PasoMacro::Toque { ms, .. } => (MIN_MS_TOQUE..=MAX_MS_PASO).contains(ms),
            PasoMacro::Esperar { ms } => *ms <= MAX_MS_PASO,
            _ => true,
        });
        if mac.pasos.len() > MAX_PASOS || !pasos_validos || !ids.insert(mac.id) {
            return Err(ErrorValidacion::Macro);
        }
    }

    for (e, a) in &m.acciones {
        if !entrada_valida(e) {
            return Err(ErrorValidacion::Indice);
        }
        accion_valida(a, &ids)?;
    }
    let mut modificadores = BTreeSet::new();
    for c in &m.capas {
        if !nombre_valido(&c.nombre, MAX_NOMBRE) {
            return Err(ErrorValidacion::Nombre);
        }
        if !entrada_valida(&c.modificador) {
            return Err(ErrorValidacion::Indice);
        }
        if !modificadores.insert(c.modificador) || c.acciones.contains_key(&c.modificador) {
            return Err(ErrorValidacion::Capa);
        }
        for (e, a) in &c.acciones {
            if !entrada_valida(e) {
                return Err(ErrorValidacion::Indice);
            }
            accion_valida(a, &ids)?;
        }
    }
    m.guid = m.guid.to_ascii_lowercase();
    m.migrar();
    Ok(())
}

/// Lee una configuracion completa en JSON (preset copiado o archivo) y la valida.
pub fn desde_json(texto: &str) -> Result<MapeoMando, ErrorValidacion> {
    if texto.len() > MAX_BYTES_PRESET {
        return Err(ErrorValidacion::Grande);
    }
    let mut m: MapeoMando = serde_json::from_str(texto).map_err(|_| ErrorValidacion::Json)?;
    validar(&mut m)?;
    Ok(m)
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use crate::mapeo::acciones::{Capa, Macro, SalidaPad};
    use crate::mapeo::Control;

    fn base() -> MapeoMando {
        MapeoMando::vacio("030000005e0400008e02000014010000", "Pad")
    }

    #[test]
    fn acepta_una_configuracion_completa() {
        let mut m = base();
        m.macros.push(Macro {
            id: 7,
            nombre: "combo".into(),
            pasos: vec![PasoMacro::Toque { salida: SalidaPad::A, ms: 40 }, PasoMacro::Esperar { ms: 100 }],
            repetir: true,
        });
        m.acciones.insert("b14".parse().unwrap(), Accion::Macro { macro_id: 7 });
        m.acciones.insert("b15".parse().unwrap(), Accion::Tecla { tecla: "F5".into() });
        m.acciones.insert(
            Entrada::Control(Control::A),
            Accion::Pad { salida: SalidaPad::A, modo: crate::mapeo::acciones::Modo::Turbo, turbo_hz: 500.0 },
        );
        m.capas.push(Capa {
            nombre: "shift".into(),
            modificador: "b16".parse().unwrap(),
            acciones: [(Entrada::Control(Control::B), Accion::pad(SalidaPad::Y))].into(),
        });
        m.stick_derecho.zona_muerta = 7.0;
        m.version = 1;
        validar(&mut m).unwrap();
        assert_eq!(m.version, VERSION_MAPEO);
        assert_eq!(m.stick_derecho.zona_muerta, 0.9);
        assert!(matches!(m.acciones[&Entrada::Control(Control::A)], Accion::Pad { turbo_hz, .. } if turbo_hz == 30.0));
        // Ida y vuelta por JSON.
        let json = serde_json::to_string(&m).unwrap();
        assert_eq!(desde_json(&json).unwrap(), m);
    }

    #[test]
    fn rechaza_lo_que_no_tiene_arreglo() {
        let mut m = base();
        m.acciones.insert("b1".parse().unwrap(), Accion::Macro { macro_id: 1 });
        assert_eq!(validar(&mut m), Err(ErrorValidacion::MacroInexistente));

        let mut m = base();
        m.acciones.insert("b1".parse().unwrap(), Accion::Tecla { tecla: "rm -rf".into() });
        assert_eq!(validar(&mut m), Err(ErrorValidacion::Tecla));

        let mut m = base();
        m.acciones.insert("b5000".parse().unwrap(), Accion::Ignorar);
        assert_eq!(validar(&mut m), Err(ErrorValidacion::Indice));

        let mut m = base();
        let mac = Macro { id: 1, nombre: "x".into(), pasos: vec![PasoMacro::Esperar { ms: 60_000 }], repetir: false };
        m.macros.push(mac.clone());
        assert_eq!(validar(&mut m), Err(ErrorValidacion::Macro));
        let mut m = base();
        m.macros.push(Macro { pasos: vec![PasoMacro::Esperar { ms: 1 }; 65], ..mac.clone() });
        assert_eq!(validar(&mut m), Err(ErrorValidacion::Macro));
        let mut m = base();
        m.macros.push(Macro { pasos: vec![], ..mac.clone() });
        m.macros.push(Macro { pasos: vec![], ..mac });
        assert_eq!(validar(&mut m), Err(ErrorValidacion::Macro));

        let mut m = base();
        let capa = Capa { nombre: "c".into(), modificador: "b3".parse().unwrap(), acciones: Default::default() };
        m.capas = vec![capa.clone(), capa];
        assert_eq!(validar(&mut m), Err(ErrorValidacion::Capa));

        let mut m = base();
        m.guid = "../../etc".into();
        assert_eq!(validar(&mut m), Err(ErrorValidacion::Guid));

        let mut m = base();
        m.nombre = "a\u{0}b".into();
        assert_eq!(validar(&mut m), Err(ErrorValidacion::Nombre));

        let mut m = base();
        m.version = 99;
        assert_eq!(validar(&mut m), Err(ErrorValidacion::Version));

        assert_eq!(desde_json("{"), Err(ErrorValidacion::Json));
        assert_eq!(desde_json(&" ".repeat(MAX_BYTES_PRESET + 1)), Err(ErrorValidacion::Grande));
        // Campos con tipos incorrectos.
        assert_eq!(
            desde_json(r#"{"version":2,"guid":"0300","nombre":"x","asignaciones":{"A":"zz"}}"#),
            Err(ErrorValidacion::Json)
        );
    }

    #[test]
    fn lee_un_mapeo_de_la_version_1() {
        let v1 = r#"{"version":1,"guid":"03000000aaaa0000bbbb000000000000","nombre":"Viejo",
            "asignaciones":{"A":"b0","LS_X":"a0"},"stick_izquierdo":{"zona_muerta":0.2,"curva":1.5,"invertir_x":true,"invertir_y":false}}"#;
        let m = desde_json(v1).unwrap();
        assert_eq!(m.version, VERSION_MAPEO);
        assert_eq!(m.stick_izquierdo.zona_muerta, 0.2);
        assert!(m.stick_izquierdo.invertir_x);
        assert_eq!(m.salida, crate::salida::TipoSalida::Ninguna);
        assert!(m.acciones.is_empty() && m.macros.is_empty());
    }
}
