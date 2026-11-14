//! Perfiles de toques (.conf, el mismo formato que la app de Android): validacion, carpeta local
//! y perfiles publicados de la comunidad.
//!
//! - [`validar_conf`] aplica las MISMAS reglas que la web (`web/src/domain/profile/conf/
//!   validateConf.ts`) y la base de datos (`private.validate_conf`): 16 KB, 400 lineas, 150
//!   botones, numeros con el formato de la web, botones dentro de `screen`... y ademas exige un
//!   nombre de paquete bien formado (da nombre al archivo y se compara con el juego detectado).
//! - [`AlmacenPerfiles`]: `<carpeta de configuracion>/perfiles/*.conf` (Linux
//!   `~/.config/gamepad-mapper-pluton/perfiles`, Windows `%APPDATA%\GamepadMapperPluton\perfiles`).
//!   Solo se guarda texto ya validado; el nombre del archivo lo pone la app (nunca la interfaz).
//! - [`url_comunidad`] y [`leer_comunidad`]: consulta de los perfiles publicados de un juego (la
//!   descarga la hace la app con HTTPS y limites; aqui solo se construye la direccion fija y se
//!   valida la respuesta).

use crate::mapeo::almacen::carpeta_config;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::io;
use std::path::{Path, PathBuf};

pub const MAX_BYTES_CONF: usize = 16 * 1024;
pub const MAX_LINEAS_CONF: usize = 400;
pub const MAX_BOTONES_CONF: usize = 150;
pub const MAX_PASOS_MACRO: usize = 16;
pub const MAX_PERFILES: usize = 500;
pub const MAX_PAQUETE: usize = 160;
/// Perfiles de la comunidad que se piden por juego y tamano maximo de la respuesta.
pub const MAX_COMUNIDAD: usize = 20;
pub const MAX_BYTES_COMUNIDAD: u64 = 512 * 1024;

const URL_PERFILES: &str = "https://gshyhrthaksriamjqdtf.supabase.co/rest/v1/game_profiles";
/// Clave publica de solo lectura (la misma que usa la web).
pub const CLAVE_PUBLICA: &str = "sb_publishable_QTPm_6jVyWGcvWILpDqJoA_skWLqjeD";

#[derive(Debug, thiserror::Error)]
pub enum ErrorPerfil {
    #[error("El perfil está vacío.")]
    Vacio,
    #[error("El perfil es demasiado grande (máximo 16 KB).")]
    Grande,
    #[error("El perfil tiene caracteres no permitidos.")]
    Caracteres,
    #[error("El perfil tiene demasiadas líneas (máximo 400).")]
    Lineas,
    #[error("Una línea del perfil no tiene «=».")]
    FaltaIgual,
    #[error("El perfil tiene un botón no válido.")]
    BotonNoValido,
    #[error("El perfil tiene un botón repetido.")]
    BotonRepetido,
    #[error("El perfil tiene una acción no válida.")]
    Accion,
    #[error("El perfil tiene un ajuste mal escrito o fuera de rango.")]
    Ajuste,
    #[error("Falta la línea «package = ...».")]
    SinPaquete,
    #[error("El nombre del paquete del juego no es válido.")]
    Paquete,
    #[error("El perfil es de otro juego.")]
    OtroPaquete,
    #[error("Falta la línea «screen = ANCHOxALTO».")]
    SinPantalla,
    #[error("El perfil no tiene ningún botón asignado.")]
    SinBotones,
    #[error("El perfil tiene demasiados botones (máximo 150).")]
    DemasiadosBotones,
    #[error("Hay botones fuera de la pantalla indicada en «screen».")]
    FueraDePantalla,
    #[error("Ese perfil de toques no existe.")]
    NoExiste,
    #[error("Hay demasiados perfiles de toques guardados.")]
    Demasiados,
    #[error("La respuesta de la comunidad no es válida.")]
    Respuesta,
    #[error(transparent)]
    Io(#[from] io::Error),
}

/// Un boton del perfil para dibujarlo (como `ProfilePreview` de la web).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BotonVista {
    /// Clave tal cual (`A`, `L2+A`, `AXIS_9+`).
    pub tecla: String,
    pub boton: String,
    pub modificador: Option<String>,
    /// tap, quick, burst, turbo, toggle, swipe, macro, stick, look
    pub tipo: String,
    pub x: f64,
    pub y: f64,
    /// Deslizar: punto final.
    pub hasta: Option<[f64; 2]>,
    /// Stick: radio.
    pub radio: Option<f64>,
    /// Macro: todos los puntos.
    pub pasos: Vec<[f64; 2]>,
}

/// Resultado de validar un perfil.
#[derive(Debug, Clone, PartialEq)]
pub struct ConfValida {
    /// Texto normalizado (saltos `\n`, sin espacios al principio ni al final).
    pub texto: String,
    pub paquete: String,
    pub nombre: Option<String>,
    pub pantalla: (u32, u32),
    pub botones: Vec<BotonVista>,
}

fn es_numero(s: &str) -> bool {
    // ^-?[0-9]{1,6}(\.[0-9]{1,4})?$
    let s = s.strip_prefix('-').unwrap_or(s);
    let (ent, dec) = match s.split_once('.') {
        Some((e, d)) => (e, Some(d)),
        None => (s, None),
    };
    let digitos = |t: &str, max: usize| (1..=max).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_digit());
    digitos(ent, 6) && dec.is_none_or(|d| digitos(d, 4))
}

fn numero(s: &str) -> Option<f64> {
    es_numero(s).then(|| s.parse().ok()).flatten()
}

fn en_rango(s: &str, min: f64, max: f64) -> bool {
    numero(s).is_some_and(|n| (min..=max).contains(&n))
}

fn tecla_valida(k: &str) -> bool {
    // ^([A-Z0-9_]{1,20}\+)?[A-Z0-9_]{1,20}[+-]?$
    let parte = |t: &str| {
        (1..=20).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
    };
    let sin_signo = k.strip_suffix(['+', '-']).unwrap_or(k);
    match sin_signo.split_once('+') {
        Some((m, b)) => parte(m) && parte(b),
        None => parte(sin_signo) || (k.ends_with('+') && parte(&k[..k.len() - 1])),
    }
}

/// Nombre de paquete de Android: `com.ejemplo.juego` (letras, numeros y `_`, al menos un punto).
pub fn paquete_valido(p: &str) -> bool {
    let partes: Vec<&str> = p.split('.').collect();
    (3..=MAX_PAQUETE).contains(&p.len())
        && partes.len() >= 2
        && partes.iter().all(|t| {
            t.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
                && t.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        })
}

const AJUSTES: [&str; 22] = [
    "package",
    "name",
    "screen",
    "deadzone",
    "ls_deadzone",
    "rs_deadzone",
    "ls_curve",
    "rs_curve",
    "look_y",
    "look_invert",
    "ls_axes",
    "rs_axes",
    "aim_button",
    "aim_scale",
    "look_accel",
    "controller",
    "rumble",
    "gyro",
    "gyro_button",
    "gyro_invert",
    "mouse",
    "players",
];

fn pantalla_de(v: &str) -> Option<(u32, u32)> {
    let v = v.to_lowercase();
    let (w, h) = v.split_once('x')?;
    let lado = |t: &str| {
        let t = t.trim();
        ((3..=5).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_digit())).then(|| t.parse::<u32>().ok()).flatten()
    };
    Some((lado(w)?, lado(h)?))
}

fn ajuste_valido(clave: &str, v: &str) -> bool {
    let boton = |v: &str| {
        (1..=16).contains(&v.len())
            && v.as_bytes()[0].is_ascii_alphabetic()
            && v.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
    };
    match clave {
        "name" => v.chars().count() <= 60,
        "screen" => pantalla_de(v).is_some(),
        "deadzone" | "ls_deadzone" | "rs_deadzone" => en_rango(v, 0.0, 0.95),
        "ls_curve" | "rs_curve" => en_rango(v, 0.1, 5.0),
        "look_y" => en_rango(v, 0.1, 10.0),
        "look_invert" | "gyro_invert" => v == "0" || v == "1",
        "aim_button" | "gyro_button" => boton(v),
        "aim_scale" => en_rango(v, 0.1, 2.0),
        "look_accel" => en_rango(v, 0.0, 3.0),
        "rumble" => en_rango(v, 0.0, 1.0),
        "gyro" | "mouse" => en_rango(v, 0.0, 5.0),
        "players" => v == "1" || v == "2",
        "controller" => {
            v.chars().count() <= 40 && v.bytes().all(|b| b.is_ascii_alphanumeric() || b" ._()+-".contains(&b))
        }
        "ls_axes" | "rs_axes" => {
            let s: String = v.chars().filter(|c| *c != ' ').collect();
            let hex = |t: &str| (1..=2).contains(&t.len()) && t.bytes().all(|b| b.is_ascii_hexdigit());
            s.split_once(',').is_some_and(|(a, b)| hex(a) && hex(b))
        }
        _ => true,
    }
}

fn leer_boton(tecla: &str, valor: &str) -> Option<BotonVista> {
    let (modificador, boton) = match tecla.get(1..).and_then(|r| r.find('+')).map(|i| i + 1) {
        Some(i) if i < tecla.len() - 1 => (Some(tecla[..i].to_owned()), tecla[i + 1..].to_owned()),
        _ => (None, tecla.to_owned()),
    };
    let args: Vec<&str> = valor.split_whitespace().collect();
    let tipo = args.first()?.to_lowercase();
    let nums = args.len() - 1;
    let mut b = BotonVista {
        tecla: tecla.to_owned(),
        boton,
        modificador,
        tipo: tipo.clone(),
        x: 0.0,
        y: 0.0,
        hasta: None,
        radio: None,
        pasos: Vec::new(),
    };
    if tipo == "macro" {
        let resto = valor.get(5..)?.trim();
        let partes: Vec<&str> = resto.split(';').collect();
        if partes.is_empty() || partes.len() > MAX_PASOS_MACRO {
            return None;
        }
        for p in partes {
            let s: Vec<&str> = p.split_whitespace().collect();
            if !(2..=4).contains(&s.len()) || !s.iter().all(|a| es_numero(a)) {
                return None;
            }
            let (x, y) = (numero(s[0])?, numero(s[1])?);
            if x < 0.0 || y < 0.0 {
                return None;
            }
            b.pasos.push([x, y]);
        }
        [b.x, b.y] = *b.pasos.first()?;
        return Some(b);
    }
    let cuenta_ok = match tipo.as_str() {
        "tap" | "toggle" | "quick" => nums == 2,
        "burst" => (2..=4).contains(&nums),
        "turbo" => (2..=3).contains(&nums),
        "swipe" => (4..=5).contains(&nums),
        "look" => nums == 3,
        "stick" => nums == 3 || (nums == 4 && args[4].eq_ignore_ascii_case("dpad")),
        _ => return None,
    };
    if !cuenta_ok {
        return None;
    }
    let revisados = if tipo == "stick" && nums == 4 { 3 } else { nums.min(5) };
    let n: Vec<f64> = args[1..=revisados].iter().map(|a| numero(a)).collect::<Option<_>>()?;
    b.x = n[0];
    b.y = n[1];
    if b.x < 0.0 || b.y < 0.0 {
        return None;
    }
    match tipo.as_str() {
        "swipe" => {
            if n[2] < 0.0 || n[3] < 0.0 {
                return None;
            }
            b.hasta = Some([n[2], n[3]]);
        }
        "stick" | "look" => b.radio = Some(n[2]),
        _ => {}
    }
    Some(b)
}

fn puntos(b: &BotonVista) -> Vec<[f64; 2]> {
    let mut p = vec![[b.x, b.y]];
    p.extend(b.pasos.iter().copied());
    p.extend(b.hasta);
    p
}

/// Valida un perfil con las reglas de la web y la base de datos. `paquete`: el juego que debe ser.
pub fn validar_conf(texto: &str, paquete: Option<&str>) -> Result<ConfValida, ErrorPerfil> {
    let normal = texto.replace("\r\n", "\n");
    let normal = normal.trim();
    if normal.is_empty() {
        return Err(ErrorPerfil::Vacio);
    }
    if normal.len() > MAX_BYTES_CONF {
        return Err(ErrorPerfil::Grande);
    }
    // Como la web (caracteres de control salvo tabulador y saltos) y ademas el 0 (el nucleo lee C).
    if normal.chars().any(|c| matches!(c, '\0'..='\u{8}' | '\u{b}' | '\u{c}' | '\u{e}'..='\u{1f}' | '\u{7f}')) {
        return Err(ErrorPerfil::Caracteres);
    }
    let lineas: Vec<&str> = normal.split('\n').collect();
    if lineas.len() > MAX_LINEAS_CONF {
        return Err(ErrorPerfil::Lineas);
    }
    let mut ajustes = BTreeMap::new();
    let mut botones = Vec::new();
    let mut vistas = BTreeSet::new();
    for linea in lineas {
        let linea = linea.split('#').next().unwrap_or("").trim();
        if linea.is_empty() {
            continue;
        }
        let (clave, valor) = linea.split_once('=').ok_or(ErrorPerfil::FaltaIgual)?;
        let (clave, valor) = (clave.trim(), valor.trim());
        let minus = clave.to_lowercase();
        if AJUSTES.contains(&minus.as_str()) {
            if !ajuste_valido(&minus, valor) {
                return Err(ErrorPerfil::Ajuste);
            }
            ajustes.insert(minus, valor.to_owned());
            continue;
        }
        let tecla: String = clave.chars().filter(|c| *c != ' ').collect::<String>().to_uppercase();
        if !tecla_valida(&tecla) {
            return Err(ErrorPerfil::BotonNoValido);
        }
        if !vistas.insert(tecla.clone()) {
            return Err(ErrorPerfil::BotonRepetido);
        }
        botones.push(leer_boton(&tecla, valor).ok_or(ErrorPerfil::Accion)?);
    }
    let paq = ajustes.get("package").ok_or(ErrorPerfil::SinPaquete)?.clone();
    if !paquete_valido(&paq) {
        return Err(ErrorPerfil::Paquete);
    }
    if paquete.is_some_and(|p| p != paq) {
        return Err(ErrorPerfil::OtroPaquete);
    }
    let pantalla = ajustes.get("screen").and_then(|s| pantalla_de(s)).ok_or(ErrorPerfil::SinPantalla)?;
    if botones.is_empty() {
        return Err(ErrorPerfil::SinBotones);
    }
    if botones.len() > MAX_BOTONES_CONF {
        return Err(ErrorPerfil::DemasiadosBotones);
    }
    let (w, h) = (f64::from(pantalla.0) * 1.05, f64::from(pantalla.1) * 1.05);
    if botones.iter().flat_map(puntos).any(|[x, y]| x > w || y > h) {
        return Err(ErrorPerfil::FueraDePantalla);
    }
    let nombre = ajustes.get("name").filter(|n| !n.is_empty()).cloned();
    Ok(ConfValida { texto: normal.to_owned(), paquete: paq, nombre, pantalla, botones })
}

// ---------------------------------------------------------------- carpeta local

/// Un perfil guardado.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PerfilLocal {
    /// Nombre del archivo sin `.conf` (lo pone la app).
    pub id: String,
    pub paquete: String,
    pub nombre: Option<String>,
    pub pantalla: [u32; 2],
    pub botones: usize,
}

/// Un perfil con sus botones (para dibujarlo).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct VistaPerfil {
    #[serde(flatten)]
    pub perfil: PerfilLocal,
    pub lista: Vec<BotonVista>,
}

fn local(id: &str, c: &ConfValida) -> PerfilLocal {
    PerfilLocal {
        id: id.to_owned(),
        paquete: c.paquete.clone(),
        nombre: c.nombre.clone(),
        pantalla: [c.pantalla.0, c.pantalla.1],
        botones: c.botones.len(),
    }
}

/// Identificador de un perfil guardado: minusculas, numeros, `.`, `_` y `-`; nunca rutas.
pub fn id_valido(id: &str) -> bool {
    (1..=120).contains(&id.len())
        && id.as_bytes()[0].is_ascii_alphanumeric()
        && !id.contains("..")
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-'))
}

fn trozo(s: &str, max: usize) -> String {
    let mut t = String::new();
    for c in s.to_lowercase().chars() {
        if t.len() >= max {
            break;
        }
        if c.is_ascii_alphanumeric() {
            t.push(c);
        } else if !t.ends_with('-') && !t.is_empty() {
            t.push('-');
        }
    }
    t.trim_end_matches('-').to_owned()
}

#[derive(Debug, Clone)]
pub struct AlmacenPerfiles {
    dir: PathBuf,
}

impl AlmacenPerfiles {
    pub fn en(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    pub fn por_defecto() -> Option<Self> {
        carpeta_config().map(|d| Self::en(d.join("perfiles")))
    }

    pub fn carpeta(&self) -> &Path {
        &self.dir
    }

    /// Ruta del archivo de un perfil (el id ya validado).
    pub fn ruta(&self, id: &str) -> Result<PathBuf, ErrorPerfil> {
        if !id_valido(id) {
            return Err(ErrorPerfil::NoExiste);
        }
        Ok(self.dir.join(format!("{id}.conf")))
    }

    fn leer_texto(ruta: &Path) -> Result<String, ErrorPerfil> {
        let m = std::fs::metadata(ruta).map_err(|e| match e.kind() {
            io::ErrorKind::NotFound => ErrorPerfil::NoExiste,
            _ => e.into(),
        })?;
        if !m.is_file() {
            return Err(ErrorPerfil::NoExiste);
        }
        // Margen para \r\n y espacios que la normalizacion quita.
        if m.len() > (MAX_BYTES_CONF as u64) * 2 {
            return Err(ErrorPerfil::Grande);
        }
        let bytes = std::fs::read(ruta)?;
        String::from_utf8(bytes).map_err(|_| ErrorPerfil::Caracteres)
    }

    /// Un perfil con sus botones.
    pub fn leer(&self, id: &str) -> Result<VistaPerfil, ErrorPerfil> {
        let c = validar_conf(&Self::leer_texto(&self.ruta(id)?)?, None)?;
        Ok(VistaPerfil { perfil: local(id, &c), lista: c.botones })
    }

    /// Los perfiles validos de la carpeta (los que no lo son se ignoran con un aviso).
    pub fn listar(&self) -> Vec<PerfilLocal> {
        let Ok(dir) = std::fs::read_dir(&self.dir) else { return Vec::new() };
        let mut lista = Vec::new();
        for e in dir.filter_map(Result::ok).take(MAX_PERFILES * 2) {
            let ruta = e.path();
            let Some(id) = ruta.file_stem().and_then(|s| s.to_str()).filter(|s| id_valido(s)) else { continue };
            if ruta.extension().is_none_or(|x| x != "conf") {
                continue;
            }
            match Self::leer_texto(&ruta).and_then(|t| validar_conf(&t, None)) {
                Ok(c) => lista.push(local(id, &c)),
                Err(err) => log::warn!("perfil de toques {} ignorado: {err}", ruta.display()),
            }
            if lista.len() >= MAX_PERFILES {
                break;
            }
        }
        lista.sort_by(|a, b| (&a.paquete, &a.nombre, &a.id).cmp(&(&b.paquete, &b.nombre, &b.id)));
        lista
    }

    /// Valida y guarda un perfil (importado de archivo o de la comunidad). Si ya hay uno con el
    /// mismo texto, devuelve ese.
    pub fn guardar(&self, texto: &str) -> Result<PerfilLocal, ErrorPerfil> {
        let c = validar_conf(texto, None)?;
        let lista = self.listar();
        for p in lista.iter().filter(|p| p.paquete == c.paquete) {
            if Self::leer_texto(&self.ruta(&p.id)?).ok().is_some_and(|t| t.trim() == c.texto) {
                return Ok(p.clone());
            }
        }
        if lista.len() >= MAX_PERFILES {
            return Err(ErrorPerfil::Demasiados);
        }
        let mut base = trozo(&c.paquete, 70);
        let detalle = trozo(c.nombre.as_deref().unwrap_or("perfil"), 30);
        if !detalle.is_empty() {
            base = format!("{base}-{detalle}");
        }
        let base = if id_valido(&base) { base } else { "perfil".to_owned() };
        let mut id = base.clone();
        let mut n = 2;
        while self.ruta(&id)?.exists() {
            id = format!("{base}-{n}");
            n += 1;
        }
        std::fs::create_dir_all(&self.dir)?;
        let ruta = self.ruta(&id)?;
        let tmp = ruta.with_extension("conf.tmp");
        std::fs::write(&tmp, format!("{}\n", c.texto))?;
        std::fs::rename(&tmp, &ruta)?;
        Ok(local(&id, &c))
    }

    pub fn borrar(&self, id: &str) -> Result<(), ErrorPerfil> {
        match std::fs::remove_file(self.ruta(id)?) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Err(ErrorPerfil::NoExiste),
            Err(e) => Err(e.into()),
        }
    }
}

// ---------------------------------------------------------------- comunidad

/// Un perfil publicado de la comunidad (ya validado).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PerfilComunidad {
    /// uuid del perfil en la web.
    pub id: String,
    pub titulo: String,
    pub me_gusta: u32,
    /// Texto del perfil (se guarda con [`AlmacenPerfiles::guardar`], que lo vuelve a validar).
    pub conf: String,
    pub paquete: String,
    pub pantalla: [u32; 2],
    pub lista: Vec<BotonVista>,
}

/// Direccion fija de la consulta de un juego (el paquete ya validado: solo letras, numeros, `_` y
/// `.`, nada que codificar).
pub fn url_comunidad(paquete: &str) -> Option<String> {
    paquete_valido(paquete).then(|| {
        format!(
            "{URL_PERFILES}?select=id,title,conf,like_count,screen_w,screen_h&package=eq.{paquete}\
             &status=eq.published&order=like_count.desc&limit={MAX_COMUNIDAD}"
        )
    })
}

fn uuid_valido(s: &str) -> bool {
    s.len() == 36
        && s.bytes()
            .enumerate()
            .all(|(i, b)| if matches!(i, 8 | 13 | 18 | 23) { b == b'-' } else { b.is_ascii_hexdigit() })
}

/// Lee la respuesta de la consulta: solo los perfiles validos de ese juego.
pub fn leer_comunidad(json: &str, paquete: &str) -> Result<Vec<PerfilComunidad>, ErrorPerfil> {
    #[derive(Deserialize)]
    struct Fila {
        id: String,
        title: Option<String>,
        conf: String,
        like_count: Option<i64>,
    }
    if json.len() as u64 > MAX_BYTES_COMUNIDAD {
        return Err(ErrorPerfil::Respuesta);
    }
    let filas: Vec<Fila> = serde_json::from_str(json).map_err(|_| ErrorPerfil::Respuesta)?;
    let mut lista = Vec::new();
    for f in filas.into_iter().take(MAX_COMUNIDAD) {
        if !uuid_valido(&f.id) {
            continue;
        }
        let c = match validar_conf(&f.conf, Some(paquete)) {
            Ok(c) => c,
            Err(e) => {
                log::warn!("perfil de la comunidad {} ignorado: {e}", f.id);
                continue;
            }
        };
        let titulo: String = f.title.unwrap_or_default().chars().filter(|c| !c.is_control()).take(80).collect();
        let titulo =
            if titulo.trim().is_empty() { c.nombre.clone().unwrap_or_else(|| c.paquete.clone()) } else { titulo };
        lista.push(PerfilComunidad {
            id: f.id.to_lowercase(),
            titulo: titulo.trim().to_owned(),
            me_gusta: u32::try_from(f.like_count.unwrap_or(0).max(0)).unwrap_or(u32::MAX),
            conf: c.texto,
            paquete: c.paquete,
            pantalla: [c.pantalla.0, c.pantalla.1],
            lista: c.botones,
        });
    }
    Ok(lista)
}

#[cfg(test)]
mod pruebas {
    use super::*;

    const BUENO: &str = "# Perfil de prueba\r\npackage = com.prueba.juego\nname = Normal\nscreen = 2400x1080\n\
        deadzone = 0.15\nls_axes = 0, 1\nA = tap 1932 960\nB = quick 2034 686\nX = turbo 1729 790 10\n\
        R1 = swipe 1800 500 1800 200 150\nR3 = macro 1980 895 0 40; 1705 398 1.5 40\nL2+A = tap 1000 300\n\
        AXIS_9+ = tap 372 398\nLS = stick 344 828 112 dpad\nRS = look 1500 500 14\n";

    #[test]
    fn valida_como_la_web() {
        let c = validar_conf(BUENO, Some("com.prueba.juego")).unwrap();
        assert_eq!(c.paquete, "com.prueba.juego");
        assert_eq!(c.nombre.as_deref(), Some("Normal"));
        assert_eq!(c.pantalla, (2400, 1080));
        assert_eq!(c.botones.len(), 9);
        assert!(!c.texto.contains('\r'));
        let capa = c.botones.iter().find(|b| b.tecla == "L2+A").unwrap();
        assert_eq!((capa.modificador.as_deref(), capa.boton.as_str()), (Some("L2"), "A"));
        let eje = c.botones.iter().find(|b| b.tecla == "AXIS_9+").unwrap();
        assert_eq!((eje.modificador.as_deref(), eje.boton.as_str()), (None, "AXIS_9+"));
        let macro_ = c.botones.iter().find(|b| b.tipo == "macro").unwrap();
        assert_eq!(macro_.pasos, vec![[1980.0, 895.0], [1705.0, 398.0]]);
        let stick = c.botones.iter().find(|b| b.tecla == "LS").unwrap();
        assert_eq!(stick.radio, Some(112.0));
        assert_eq!(c.botones.iter().find(|b| b.tipo == "swipe").unwrap().hasta, Some([1800.0, 200.0]));
    }

    #[test]
    fn rechaza_lo_que_rechaza_la_web() {
        use ErrorPerfil as E;
        let con = |extra: &str| format!("package = com.prueba.juego\nscreen = 2400x1080\n{extra}");
        type Comprobar = fn(&ErrorPerfil) -> bool;
        let casos: Vec<(String, Comprobar)> = vec![
            ("  \n ".into(), |e| matches!(e, E::Vacio)),
            (format!("{}{}", con("A = tap 1 1\n"), "#x\n".repeat(400)), |e| matches!(e, E::Lineas)),
            (format!("{}{}", con("A = tap 1 1\n"), "#".repeat(17_000)), |e| matches!(e, E::Grande)),
            (con("A = tap 1 1\u{1}\n"), |e| matches!(e, E::Caracteres)),
            (con("A tap 1 1\n"), |e| matches!(e, E::FaltaIgual)),
            (con("A! = tap 1 1\n"), |e| matches!(e, E::BotonNoValido)),
            (con("A = tap 1 1\na = tap 2 2\n"), |e| matches!(e, E::BotonRepetido)),
            (con("A = tap 1\n"), |e| matches!(e, E::Accion)),
            (con("A = tap 1 1e3\n"), |e| matches!(e, E::Accion)),
            (con("A = tap -1 1\n"), |e| matches!(e, E::Accion)),
            (con("A = zap 1 1\n"), |e| matches!(e, E::Accion)),
            (con("A = macro 1 1;2 2;3 3;4 4;5 5;6 6;7 7;8 8;9 9;1 1;1 1;1 1;1 1;1 1;1 1;1 1;1 1\n"), |e| {
                matches!(e, E::Accion)
            }),
            (con("deadzone = 0.99\nA = tap 1 1\n"), |e| matches!(e, E::Ajuste)),
            (con("controller = <x>\nA = tap 1 1\n"), |e| matches!(e, E::Ajuste)),
            ("screen = 2400x1080\nA = tap 1 1\n".into(), |e| matches!(e, E::SinPaquete)),
            ("package = ../../etc\nscreen = 2400x1080\nA = tap 1 1\n".into(), |e| matches!(e, E::Paquete)),
            ("package = com.prueba.juego\nA = tap 1 1\n".into(), |e| matches!(e, E::SinPantalla)),
            (con(""), |e| matches!(e, E::SinBotones)),
            (con("A = tap 2600 100\n"), |e| matches!(e, E::FueraDePantalla)),
        ];
        for (texto, esperado) in casos {
            let r = validar_conf(&texto, None);
            assert!(r.as_ref().is_err_and(esperado), "{texto:.80?} -> {r:?}");
        }
        assert!(matches!(validar_conf(BUENO, Some("com.otro")), Err(E::OtroPaquete)));
        let muchos: String = (0..151).map(|i| format!("BTN_{i} = tap 1 1\n")).collect();
        assert!(matches!(validar_conf(&con(&muchos), None), Err(E::DemasiadosBotones)));
    }

    #[test]
    fn numeros_y_paquetes() {
        for s in ["0", "-1", "123456", "1.5", "0.1234"] {
            assert!(es_numero(s), "{s}");
        }
        for s in ["", "-", "1234567", "1.", ".5", "1.23456", "1e3", "+1", "0x1"] {
            assert!(!es_numero(s), "{s}");
        }
        for p in ["com.a", "com.supercell.clashroyale", "org.ppsspp.ppsspp", "com.Juego_2.x1"] {
            assert!(paquete_valido(p), "{p}");
        }
        for p in ["", "com", ".com.a", "com..a", "com.1a", "com.a/b", "com.a b", "com.a;rm"] {
            assert!(!paquete_valido(p), "{p}");
        }
    }

    #[test]
    fn carpeta_guardar_listar_y_borrar() {
        let dir = std::env::temp_dir().join(format!("gpm-perfiles-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let a = AlmacenPerfiles::en(&dir);
        assert!(a.listar().is_empty());
        let p = a.guardar(BUENO).unwrap();
        assert_eq!(p.id, "com-prueba-juego-normal");
        assert_eq!(a.guardar(BUENO).unwrap(), p, "el mismo texto no se duplica");
        let otro = a.guardar(&BUENO.replace("name = Normal", "name = Normal\nC = tap 1 1")).unwrap();
        assert_eq!(otro.id, "com-prueba-juego-normal-2");
        assert_eq!(a.listar().len(), 2);
        assert_eq!(a.leer(&p.id).unwrap().lista.len(), 9);
        // Archivos no validos y rutas: se ignoran o se rechazan.
        std::fs::write(dir.join("roto.conf"), "nada").unwrap();
        assert_eq!(a.listar().len(), 2);
        for malo in ["../x", "a/b", "", "A", ".oculto"] {
            assert!(matches!(a.leer(malo), Err(ErrorPerfil::NoExiste)), "{malo}");
        }
        a.borrar(&p.id).unwrap();
        assert!(matches!(a.borrar(&p.id), Err(ErrorPerfil::NoExiste)));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn comunidad() {
        assert_eq!(
            url_comunidad("com.prueba.juego").unwrap(),
            "https://gshyhrthaksriamjqdtf.supabase.co/rest/v1/game_profiles?select=id,title,conf,like_count,\
             screen_w,screen_h&package=eq.com.prueba.juego&status=eq.published&order=like_count.desc&limit=20"
        );
        assert!(url_comunidad("com.a&status=eq.draft").is_none());
        let conf = serde_json::to_string(BUENO).unwrap();
        let json = format!(
            r#"[{{"id":"0F8FAD5B-D9CB-469F-A165-70867728950E","title":"Bueno\u0007","conf":{conf},"like_count":7,"screen_w":2400,"screen_h":1080}},
               {{"id":"no-es-uuid","title":"x","conf":{conf},"like_count":1}},
               {{"id":"0f8fad5b-d9cb-469f-a165-70867728950f","title":"Otro juego","conf":"package = com.otro\nscreen = 2400x1080\nA = tap 1 1","like_count":null}}]"#
        );
        let l = leer_comunidad(&json, "com.prueba.juego").unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(
            (l[0].id.as_str(), l[0].titulo.as_str(), l[0].me_gusta),
            ("0f8fad5b-d9cb-469f-a165-70867728950e", "Bueno", 7)
        );
        assert!(matches!(leer_comunidad("{}", "com.a.b"), Err(ErrorPerfil::Respuesta)));
    }
}
