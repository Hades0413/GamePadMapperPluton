// gpm_repeticion.h - repetir un guion de eventos del mando con un reloj virtual (pruebas).
//
// Lee un guion (ver gpm_repeticion.c), ejecuta la logica real del nucleo y escribe cada toque.
// Sin mando ni pantalla: lo usan gpmapper -r (tests/engine) y gpm-escritorio --repetir.
#ifndef GPM_REPETICION_H
#define GPM_REPETICION_H

#include "gpm_plataforma.h"

// salida: abajo/mover/arriba/sync/vibrar/log de quien llama (NULL = escribir en stdout el
// formato de las pruebas). El reloj siempre es el virtual (gpm_ahora_us() avanza con el guion).
// Devuelve 0 si todo fue bien.
int gpm_repetir(const char *perfil, const char *guion, const gpm_plataforma_t *salida);

// Milisegundos de la repeticion desde el inicio del guion (para escribir la hora).
double gpm_repeticion_ms(void);

#endif
