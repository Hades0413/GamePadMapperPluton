// nucleo_core.c - el nucleo portable de gpmapper (mapper/src/core/gpm_core.c) tal cual, compilado
// dentro del crate gpm-nucleo (build.rs). Mismas fuentes que el motor root de Android y que
// gpm-escritorio: el mismo perfil da los mismos toques.
//
// MSVC no conoce __attribute__ (gpm_core.h lo usa para comprobar formatos de printf).
#if defined(_MSC_VER) && !defined(__clang__)
#define __attribute__(x)
#define _CRT_SECURE_NO_WARNINGS
#endif
#include "../../../../mapper/src/core/gpm_core.c"
