//! Declaraciones del nucleo en C (`mapper/src/core/gpm_core.h`, `gpm_plataforma.h`,
//! `gpm_repeticion.h`) y del puente (`nucleo/c/puente.c`). Solo las usa [`super::motor`], que es
//! quien garantiza que nadie mas toca el nucleo a la vez (tiene estado global).

use std::os::raw::{c_char, c_double, c_int, c_longlong};

/// Numero de ejes de Linux (`ABS_CNT`).
pub const ABS_CNT: usize = 0x40;
/// Dedos a la vez (`GPM_NSLOTS`).
pub const NSLOTS: usize = 10;

pub const EV_SYN: c_int = 0x00;
pub const EV_KEY: c_int = 0x01;
pub const EV_ABS: c_int = 0x03;
pub const SYN_REPORT: c_int = 0;

/// `gpm_plataforma_t`: lo que el nucleo necesita del sistema.
#[repr(C)]
pub struct Plataforma {
    pub reloj_us: extern "C" fn() -> c_longlong,
    pub log: Option<extern "C" fn(*const c_char)>,
    pub depurar: Option<extern "C" fn() -> c_int>,
    pub abajo: extern "C" fn(c_int, c_double, c_double),
    pub mover: extern "C" fn(c_int, c_double, c_double),
    pub arriba: extern "C" fn(c_int),
    pub sync: extern "C" fn(c_int),
    pub vibrar: Option<extern "C" fn(c_double)>,
    pub aprendido: Option<extern "C" fn(*const c_char)>,
}

/// `gpm_eje_t`: un eje del mando al conectarlo.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct Eje {
    pub tiene: c_int,
    pub minimo: c_int,
    pub maximo: c_int,
    pub valor: c_int,
}

/// `profile_t` (opaco: se reserva y se lee con el puente).
#[repr(C)]
pub struct PerfilC {
    _privado: [u8; 0],
}

#[cfg_attr(windows, allow(dead_code))]
extern "C" {
    pub fn gpm_plataforma(p: *const Plataforma);
    pub fn gpm_cargar_perfil(ruta: *const c_char, p: *mut PerfilC) -> c_int;
    pub fn gpm_usar_perfil(p: *const PerfilC);
    pub fn gpm_destino_fijo(w: c_double, h: c_double);
    pub fn gpm_mando_nuevo(ejes: *const Eje);
    pub fn gpm_evento(tipo: c_int, codigo: c_int, valor: c_int, mapear: c_int);
    pub fn gpm_soltar_todo();
    pub fn gpm_combo_pausa(vigilar: c_int) -> c_int;
    pub fn gpm_cambio_pedido() -> c_int;
    pub fn gpm_macros() -> c_longlong;
    pub fn gpm_reiniciar_ticks();
    pub fn gpm_ticks(activo: c_int);
    pub fn gpm_intervalo_ms() -> c_int;
    pub fn gpm_fit_x(x: c_double, sw: c_double, sh: c_double, w: c_double, h: c_double) -> c_double;
    pub fn gpm_fit_y(y: c_double, sw: c_double, sh: c_double, w: c_double, h: c_double) -> c_double;

    pub fn gpmr_perfil_nuevo() -> *mut PerfilC;
    pub fn gpmr_perfil_borrar(p: *mut PerfilC);
    pub fn gpmr_perfil_paquete(p: *const PerfilC) -> *const c_char;
    pub fn gpmr_perfil_nombre(p: *const PerfilC) -> *const c_char;
    pub fn gpmr_perfil_ancho(p: *const PerfilC) -> c_double;
    pub fn gpmr_perfil_alto(p: *const PerfilC) -> c_double;
    pub fn gpmr_repetir_a_archivo(perfil: *const c_char, guion: *const c_char, salida: *const c_char) -> c_int;
}
