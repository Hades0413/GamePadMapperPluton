// nucleo_repeticion.c - la repeticion de guiones del nucleo (mapper/src/core/gpm_repeticion.c),
// para comprobar desde Rust que el nucleo compilado aqui da lo mismo que gpmapper -r (tests/engine).
#if defined(_MSC_VER) && !defined(__clang__)
#define __attribute__(x)
#define _CRT_SECURE_NO_WARNINGS
#endif
#include "../../../../mapper/src/core/gpm_repeticion.c"
