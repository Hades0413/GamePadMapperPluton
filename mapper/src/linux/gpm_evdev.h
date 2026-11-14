// gpm_evdev.h - mando por evdev y pantalla tactil virtual por uinput (Linux y Android).
// Lo comparten gpmapper (motor root de Android) y gpm-escritorio para Linux.
#ifndef GPM_EVDEV_H
#define GPM_EVDEV_H

#include <stddef.h>
#include "../core/gpm_core.h"

// ¿Es un mando? (botones de gamepad y ejes X/Y; nunca pantallas tactiles)
int gpm_evdev_es_mando(int fd);
// Busca el primer mando en /dev/input (cuyo nombre contenga 'filtro' si no esta vacio y que no
// se llame 'excluir'). Devuelve su descriptor (no bloqueante, lectura y escritura si se puede) o -1.
int gpm_evdev_buscar_mando(const char *filtro, const char *excluir, char *nombre, size_t nn, char *ruta, size_t nr);
// Ejes del mando (para gpm_mando_nuevo).
void gpm_evdev_ejes(int fd, gpm_eje_t ejes[ABS_CNT]);
// Captura exclusiva (want = 1) o liberar (0). Devuelve 0 si se pudo.
int gpm_evdev_capturar(int fd, int want);
// Vibracion corta (EV_FF). *ff_id: -1 al conectar; queda en -2 si el mando no vibra.
void gpm_evdev_vibrar(int fd, int *ff_id, double *ff_level, double nivel);

// Pantalla tactil multitactil virtual con coordenadas 0..max_x, 0..max_y. Devuelve el descriptor o -1.
int gpm_uinput_crear(const char *nombre, int vendor, int product, int max_x, int max_y);
void gpm_uinput_abajo(int fd, int slot, int tracking_id, int x, int y);
void gpm_uinput_mover(int fd, int slot, int x, int y);
void gpm_uinput_arriba(int fd, int slot);
// Fin de un grupo: BTN_TOUCH si cambio (*estado guarda el ultimo enviado) y SYN_REPORT.
void gpm_uinput_sync(int fd, int *estado, int tocando);
void gpm_uinput_destruir(int fd);

#endif
