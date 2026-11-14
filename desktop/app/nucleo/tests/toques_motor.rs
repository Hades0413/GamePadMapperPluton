//! El nucleo en C compilado dentro del crate (por FFI) da exactamente lo mismo que `gpmapper -r`:
//! cada guion de `tests/engine/*.txt` se repite con su perfil y se compara byte a byte con su
//! `.esperado` (las mismas pruebas que `make test`).
//!
//! Como `gpmapper -r`, cada guion se repite en un proceso nuevo (el nucleo tiene estado global):
//! la prueba se vuelve a lanzar a si misma con `GPM_GUION` para cada uno.
#![cfg(unix)]

use nucleo::toques::motor::repetir;
use std::path::{Path, PathBuf};
use std::process::Command;

fn carpeta_motor() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../tests/engine")
}

/// Repite un guion (solo cuando la lanza `guiones_del_motor_iguales_que_gpmapper`).
#[test]
fn repetir_un_guion() {
    let (Some(perfil), Some(guion), Some(salida)) =
        (std::env::var_os("GPM_PERFIL"), std::env::var_os("GPM_GUION"), std::env::var_os("GPM_SALIDA"))
    else {
        return;
    };
    repetir(Path::new(&perfil), Path::new(&guion), Path::new(&salida)).expect("repetir");
}

#[test]
fn guiones_del_motor_iguales_que_gpmapper() {
    if std::env::var_os("GPM_GUION").is_some() {
        return;
    }
    let dir = carpeta_motor();
    let mut guiones: Vec<PathBuf> = std::fs::read_dir(&dir)
        .expect("tests/engine")
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|e| e == "txt"))
        .collect();
    guiones.sort();
    assert!(guiones.len() >= 10, "solo {} guiones en {}", guiones.len(), dir.display());
    let yo = std::env::current_exe().unwrap();
    let mut fallos = Vec::new();
    for guion in &guiones {
        let nombre = guion.file_stem().unwrap().to_string_lossy().into_owned();
        let propio = dir.join(format!("{nombre}.conf"));
        let perfil = if propio.exists() { propio } else { dir.join("perfil.conf") };
        let salida = std::env::temp_dir().join(format!("gpm-repeticion-{nombre}-{}.txt", std::process::id()));
        let estado = Command::new(&yo)
            .args(["repetir_un_guion", "--exact", "--test-threads=1", "--quiet"])
            .env("GPM_PERFIL", &perfil)
            .env("GPM_GUION", guion)
            .env("GPM_SALIDA", &salida)
            .output()
            .unwrap();
        assert!(estado.status.success(), "{nombre}: {}", String::from_utf8_lossy(&estado.stderr));
        let esperado = std::fs::read_to_string(dir.join(format!("{nombre}.esperado"))).expect("esperado");
        let obtenido = std::fs::read_to_string(&salida).unwrap();
        let _ = std::fs::remove_file(&salida);
        if obtenido == esperado {
            println!("{nombre}: igual");
        } else {
            fallos.push(format!("{nombre}:\n--- esperado\n{esperado}\n+++ obtenido\n{obtenido}"));
        }
    }
    assert!(fallos.is_empty(), "{}", fallos.join("\n"));
}
