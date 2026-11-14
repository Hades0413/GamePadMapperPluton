// puente.c - lo poco que Rust necesita y el nucleo no exporta: reservar y leer un profile_t (sin
// copiar su disposicion en memoria a Rust) y repetir un guion escribiendo en un archivo.
#if defined(_MSC_VER) && !defined(__clang__)
#define __attribute__(x)
#define _CRT_SECURE_NO_WARNINGS
#endif
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../../../../mapper/src/core/gpm_core.h"
#include "../../../../mapper/src/core/gpm_repeticion.h"

#ifndef _WIN32
#include <fcntl.h>
#include <unistd.h>
#endif

profile_t *gpmr_perfil_nuevo(void) { return (profile_t *)calloc(1, sizeof(profile_t)); }

void gpmr_perfil_borrar(profile_t *p) {
    if (!p) return;
    gpm_liberar_perfil(p);
    free(p);
}

const char *gpmr_perfil_paquete(const profile_t *p) { return p->pkg; }
const char *gpmr_perfil_nombre(const profile_t *p) { return p->name; }
double gpmr_perfil_ancho(const profile_t *p) { return p->sw; }
double gpmr_perfil_alto(const profile_t *p) { return p->sh; }

// Repite un guion como gpmapper -r: lo que escribe en la salida estandar va a 'salida' y el
// registro (salida de errores) se descarta. Solo en sistemas POSIX (pruebas). Devuelve lo mismo
// que gpm_repetir (-1 si no se pudo redirigir).
int gpmr_repetir_a_archivo(const char *perfil, const char *guion, const char *salida) {
#ifdef _WIN32
    (void)perfil;
    (void)guion;
    (void)salida;
    return -1;
#else
    fflush(stdout);
    fflush(stderr);
    int fd = open(salida, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    int nulo = open("/dev/null", O_WRONLY);
    if (fd < 0 || nulo < 0) {
        if (fd >= 0) close(fd);
        if (nulo >= 0) close(nulo);
        return -1;
    }
    int out = dup(1), err = dup(2);
    dup2(fd, 1);
    dup2(nulo, 2);
    int r = gpm_repetir(perfil, guion, NULL);
    fflush(stdout);
    fflush(stderr);
    dup2(out, 1);
    dup2(err, 2);
    close(out);
    close(err);
    close(fd);
    close(nulo);
    return r;
#endif
}
