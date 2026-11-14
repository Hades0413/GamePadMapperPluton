//! Compila el nucleo en C de gpmapper (`mapper/src/core/`) dentro del crate: el modulo `toques`
//! lo usa por FFI. Son las mismas fuentes que el motor root de Android y gpm-escritorio, sin
//! cambios (los archivos de `c/` solo las incluyen y anaden un puente minimo).
//!
//! Comprobar el crate para Windows desde Linux (`cargo clippy --target x86_64-pc-windows-gnu`)
//! no necesita enlazar: si no hay compilador de C para ese destino (MinGW), se avisa y se sigue.
//! Una compilacion de verdad para Windows (MSVC en CI) compila el C con normalidad.

use std::path::PathBuf;

fn main() {
    let raiz = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let nucleo_c = raiz.join("../../../mapper/src/core");
    let fuentes = ["c/nucleo_core.c", "c/nucleo_repeticion.c", "c/puente.c"];
    for f in fuentes {
        println!("cargo:rerun-if-changed={f}");
    }
    for f in ["gpm_core.c", "gpm_core.h", "gpm_plataforma.h", "gpm_codigos.h", "gpm_repeticion.c", "gpm_repeticion.h"] {
        println!("cargo:rerun-if-changed={}", nucleo_c.join(f).display());
    }

    // Comprobacion desde otro sistema para Windows con MinGW: sin su compilador no se intenta
    // (no hace falta para clippy/check, que no enlazan).
    let objetivo = std::env::var("TARGET").unwrap_or_default();
    let cruzado = std::env::var("HOST").unwrap_or_default() != objetivo;
    if cruzado
        && objetivo.ends_with("windows-gnu")
        && std::env::var_os(format!("CC_{}", objetivo.replace('-', "_"))).is_none()
    {
        let gcc = "x86_64-w64-mingw32-gcc";
        let hay = std::env::var_os("PATH").is_some_and(|p| std::env::split_paths(&p).any(|d| d.join(gcc).is_file()));
        if !hay {
            println!("cargo:warning=sin {gcc}: el nucleo de toques en C no se compila (basta para clippy/check)");
            return;
        }
    }

    let mut b = cc::Build::new();
    b.files(fuentes.iter().map(|f| raiz.join(f))).warnings(false);
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        b.flag_if_supported("/std:c11");
    } else {
        b.flag_if_supported("-std=gnu11");
    }
    if let Err(e) = b.try_compile("gpm_nucleo_c") {
        let windows_gnu = std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
            && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("gnu");
        if windows_gnu && std::env::var("HOST") != std::env::var("TARGET") {
            println!("cargo:warning=sin compilador de C para Windows (MinGW): el nucleo de toques no se enlaza ({e})");
            return;
        }
        panic!("no se pudo compilar el nucleo en C: {e}");
    }
}
