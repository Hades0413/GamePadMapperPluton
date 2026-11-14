// escritorio.h - parte comun de gpm-escritorio (Linux y Windows).
//
// gpm-escritorio juega con mando a juegos Android que se ven en el PC (scrcpy, Waydroid, un
// emulador...): convierte el mando en toques dentro del rectangulo de la ventana del juego, con
// el mismo nucleo (mapper/src/core) y los mismos perfiles que la app.
//
// escritorio.c tiene las opciones, la carga del perfil (tambien de la comunidad) y el bucle
// principal; cada sistema (linux/, windows/) implementa las funciones escr_plat_*.
#ifndef ESCRITORIO_H
#define ESCRITORIO_H

#include <signal.h>

#include "../../mapper/src/core/gpm_core.h"

typedef struct {
    int x, y, w, h;   // pixeles del escritorio
} escr_rect_t;

// ------------------------------------------------------------ lo que implementa cada sistema
long long escr_plat_reloj_us(void);
// Preparar la salida de toques (pantalla virtual / inyeccion). 0 = bien. ancho/alto: del escritorio.
int escr_plat_iniciar_salida(int ancho, int alto);
void escr_plat_terminar(void);
// Toques en pixeles del escritorio.
void escr_plat_abajo(int slot, int x, int y);
void escr_plat_mover(int slot, int x, int y);
void escr_plat_arriba(int slot);
void escr_plat_sync(int tocando);
void escr_plat_vibrar(double nivel);
// ¿Hay mando? Si no lo hay, lo busca (filtro: texto del nombre o numero, puede ser vacio).
int escr_plat_mando(const char *filtro);
void escr_plat_capturar(int on);                 // uso exclusivo del mando (si el sistema lo permite)
// Espera hasta 'us' microsegundos a eventos del mando y los pasa a gpm_evento(..., mapear).
// Devuelve 0 si el mando se desconecto.
int escr_plat_esperar(long long us, int mapear);
int escr_plat_pantalla(int *w, int *h);          // tamano del escritorio (0 = bien)
// Busca la ventana cuyo titulo contiene 'titulo'. 1 = encontrada (r: area de cliente,
// *activa: tiene el foco; -1 si no se puede saber). 0 = no esta. -1 = no se puede buscar.
int escr_plat_ventana(const char *titulo, escr_rect_t *r, int *activa);
void escr_plat_listar_mandos(void);
const char *escr_plat_ayuda(void);               // texto extra de --help (permisos, limites)
const char *escr_plat_cache(void);               // carpeta para perfiles descargados

// ------------------------------------------------------------ comun
int escr_main(int argc, char **argv);
void escr_log(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
extern int escr_verbose;
extern volatile sig_atomic_t escr_parar;         // Ctrl+C / SIGTERM: salir del bucle

#endif
