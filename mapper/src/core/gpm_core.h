// gpm_core.h - nucleo del mapeador: perfiles, adaptar a otra pantalla y logica mando -> toques.
//
// Portable (solo C estandar): lo comparten el motor root de Android (gpmapper) y las versiones de
// escritorio. Habla con el sistema a traves de gpm_plataforma_t (gpm_plataforma.h) y recibe los
// eventos del mando con los codigos de Linux (gpm_codigos.h).
//
// Uso tipico en el bucle de una plataforma:
//   gpm_plataforma(&p); gpm_cargar_perfil(...); gpm_usar_perfil(&perfil); gpm_destino_fijo(w, h);
//   al conectar un mando: gpm_mando_nuevo(ejes);
//   por cada evento: gpm_evento(tipo, codigo, valor, mapear);
//   tras cada vuelta: gpm_combo_pausa(), gpm_cambio_pedido(), gpm_macros(), gpm_ticks()
//   y esperar como mucho gpm_intervalo_ms() (o hasta la proxima macro).
#ifndef GPM_CORE_H
#define GPM_CORE_H

#include <stddef.h>
#include "gpm_codigos.h"
#include "gpm_plataforma.h"

#define GPM_NSLOTS 10
#define GPM_NCODES 0x300        // codigos EV_KEY cubiertos (incluye pseudo-codigos)
#define GPM_CODE_LS 0x2F0       // pseudo-codigos para sticks
#define GPM_CODE_RS 0x2F1
#define GPM_MAX_LAYERS 64       // botones en capas ("L2+A")
#define GPM_MAX_STEPS 16        // pasos por macro

enum { B_NONE = 0, B_TAP, B_STICK, B_LOOK, B_MACRO, B_TURBO, B_TOGGLE, B_SWIPE };

typedef struct {
    double x, y;
    double delay;     // ms desde el inicio del paso anterior (0 = a la vez)
    double hold;      // ms que dura el toque
} step_t;

typedef struct {
    int type;
    double x, y;      // pixeles en el sistema del perfil
    double r;         // radio (stick) o velocidad (look, px por fotograma a tope)
    int nsteps;       // macro
    step_t *steps;
    double rate;      // turbo: toques por segundo
    double x2, y2;    // deslizar: punto final
    double dur;       // deslizar: duracion (ms)
    int dpad;         // stick: la cruceta tambien lo mueve ("stick X Y R dpad")
} binding_t;

// Boton en una capa: mientras se mantiene 'mod', el boton (o eje) usa 'bd' en vez de su accion normal.
typedef struct {
    int mod;          // codigo del boton modificador
    int kind;         // 0 boton, 1 eje-boton
    int code, axis, dir;
    binding_t bd;
} layer_t;

typedef struct {
    char file[256];
    char pkg[160];
    char name[64];               // nombre visible del perfil (modo de juego)
    int is_active;               // perfil elegido para su juego (active.txt)
    double sw, sh;               // tamano de pantalla de referencia
    double deadzone;
    double look_y;               // multiplicador de sensibilidad vertical (camara)
    int look_invert;             // invertir eje Y de la camara
    int ls_ax[2], rs_ax[2];      // ejes de los sticks (-1 = automatico)
    double ls_dz, rs_dz;         // zona muerta de cada stick (-1 = deadzone)
    double ls_curve, rs_curve;   // curva de respuesta (1 = lineal)
    int aim_mod;                 // apuntar: mientras se mantiene este boton (-1 = no)...
    double aim_scale;            // ...la camara va a esta velocidad
    double look_accel;           // la camara acelera hasta (1 + look_accel) con el stick al tope
    char controller[48];         // al conectar un mando con este nombre se activa el perfil
    double rumble;               // vibracion del mando al pulsar (0 = no)
    binding_t *b;                // GPM_NCODES: botones + LS/RS
    binding_t ax[ABS_CNT][2];    // ejes como botones: [eje][0 = negativo, 1 = positivo]
    layer_t *layers;             // GPM_MAX_LAYERS
    int nlayers;
    unsigned char *is_mod;       // GPM_NCODES: boton usado como modificador (no toca por si solo)
} profile_t;

// Eje del mando al conectarlo (como input_absinfo de Linux).
typedef struct {
    int tiene;        // el mando tiene este eje
    int minimo, maximo, valor;
} gpm_eje_t;

// ------------------------------------------------------------ plataforma y utilidades
void gpm_plataforma(const gpm_plataforma_t *p);
void gpm_log(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
int gpm_depurar(void);                 // registro detallado (consulta a la plataforma cada 2 s)
long long gpm_ahora_ms(void);
long long gpm_ahora_us(void);
int gpm_strcasecmp(const char *a, const char *b);
int gpm_strncasecmp(const char *a, const char *b, size_t n);
char *gpm_recortar(char *s);           // quita espacios al principio y al final (modifica s)
int gpm_contiene(const char *hay, const char *needle);   // sin distinguir mayusculas
const char *gpm_nombre_base(const char *ruta);

// ------------------------------------------------------------ nombres de botones y ejes
const char *gpm_nombre_codigo(int code, char *buf, size_t n);   // A, L2, BTN_13A...
// 0 = boton (code), 1 = eje-boton (axis, dir: 0 negativo, 1 positivo), -1 = desconocido
int gpm_leer_token(const char *name, int *code, int *axis, int *dir);

// ------------------------------------------------------------ perfiles
int gpm_cargar_perfil(const char *ruta, profile_t *p);   // 0 = bien (necesita 'package')
void gpm_liberar_perfil(profile_t *p);
const char *gpm_etiqueta(const profile_t *p);            // nombre visible o archivo
void gpm_usar_perfil(const profile_t *p);                // perfil activo (NULL = ninguno)
const profile_t *gpm_perfil(void);

// ------------------------------------------------------------ pantalla de destino
// Adaptar el perfil a otra pantalla: misma formula que Profile.fitX/fitY en la app.
double gpm_fit_scale(double sw, double sh, double w, double h);
double gpm_fit_x(double x, double sw, double sh, double w, double h);
double gpm_fit_y(double y, double sw, double sh, double w, double h);
// Pantalla de un movil (gira con el juego: se usa en la orientacion del perfil). 0 = la del perfil.
void gpm_pantalla(double w, double h);
// Destino de tamano fijo (ventana del juego en el escritorio). 0 = la del perfil.
void gpm_destino_fijo(double w, double h);
void gpm_destino(double *w, double *h);                  // tamano de destino para el perfil activo

// ------------------------------------------------------------ mando y logica
void gpm_mando_nuevo(const gpm_eje_t ejes[ABS_CNT]);     // al conectar un mando
// Un evento del mando (EV_KEY / EV_ABS / EV_SYN). mapear: generar toques (mando capturado).
void gpm_evento(int type, int code, int value, int mapear);
int gpm_pulsado(int code);
void gpm_aprender(int on);                               // modo aprender (suelta los toques)
int gpm_aprendiendo(void);
void gpm_soltar_todo(void);                              // levantar todos los dedos
// SELECT+START mantenidos 1 s: devuelve 1 una vez (la plataforma pausa o reanuda).
// vigilar = 0 reinicia la cuenta (sin mando o aprendiendo).
int gpm_combo_pausa(int vigilar);
int gpm_cambio_pedido(void);                             // SELECT+R1/L1: +1 / -1 (0 = nada); lo borra
long long gpm_macros(void);                              // pasos de macro pendientes; proximo (us) o -1
void gpm_reiniciar_ticks(void);
void gpm_ticks(int activo);                              // camara, turbo y deslizar
int gpm_intervalo_ms(void);                              // 0 = sin trabajo periodico; si no, cada cuantos ms

// ------------------------------------------------------------ toques directos (u, v: 0..1 del destino)
int gpm_toque_abajo_n(double u, double v);               // devuelve el hueco o -1
void gpm_toque_mover_n(int slot, double u, double v);
void gpm_toque_arriba(int slot);
void gpm_sync(void);
int gpm_slot_usado(int slot);

#endif
