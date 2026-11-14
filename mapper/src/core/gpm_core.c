// gpm_core.c - nucleo del mapeador (ver gpm_core.h). Solo C estandar: sin llamadas al sistema.
#include "gpm_core.h"

#include <ctype.h>
#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define NSLOTS GPM_NSLOTS
#define NCODES GPM_NCODES
#define CODE_LS GPM_CODE_LS
#define CODE_RS GPM_CODE_RS
#define MAX_LAYERS GPM_MAX_LAYERS
#define MAX_STEPS GPM_MAX_STEPS
#define AX_PRESS 0.5          // histeresis de ejes usados como botones
#define AX_RELEASE 0.35
#define MAX_TOGGLES 32        // interruptores apoyados a la vez
#define MAX_SWIPES 8          // deslizamientos en curso
#define MAX_QUEUE 64          // toques de macro en curso a la vez

typedef struct {
    int active;
    int slot;
    double cx, cy;    // posicion actual (look)
    const binding_t *b;   // accion elegida al pulsar (capa o normal)
    int down;             // turbo: dedo apoyado
    long long next;       // turbo: proximo cambio (us)
} runtime_t;

// ---------------------------------------------------------------- plataforma y utilidades
static const gpm_plataforma_t *plat;

void gpm_plataforma(const gpm_plataforma_t *p) { plat = p; }

long long gpm_ahora_us(void) { return plat->reloj_us(); }
long long gpm_ahora_ms(void) { return plat->reloj_us() / 1000; }
#define now_ms gpm_ahora_ms
#define now_us gpm_ahora_us

void gpm_log(const char *fmt, ...) {
    char buf[2048];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    if (plat && plat->log) plat->log(buf);
}
#define logf_ gpm_log

int gpm_depurar(void) {
    static long long last = -10000;
    static int cached = 0;
    long long n = now_ms();
    if (n - last > 2000) {
        cached = plat->depurar ? plat->depurar() : 0;
        last = n;
    }
    return cached;
}
#define debug_on gpm_depurar

int gpm_strncasecmp(const char *a, const char *b, size_t n) {
    for (; n; n--, a++, b++) {
        int d = tolower((unsigned char)*a) - tolower((unsigned char)*b);
        if (d || !*a) return d;
    }
    return 0;
}

int gpm_strcasecmp(const char *a, const char *b) {
    for (;; a++, b++) {
        int d = tolower((unsigned char)*a) - tolower((unsigned char)*b);
        if (d || !*a) return d;
    }
}
#define strcasecmp gpm_strcasecmp
#define strncasecmp gpm_strncasecmp

char *gpm_recortar(char *s) {
    while (isspace((unsigned char)*s)) s++;
    char *e = s + strlen(s);
    while (e > s && isspace((unsigned char)e[-1])) *--e = 0;
    return s;
}
#define trim gpm_recortar

static double clampd(double v, double lo, double hi) {
    return v != v ? lo : v < lo ? lo : v > hi ? hi : v;
}

// ¿'hay' contiene 'aguja' sin distinguir mayusculas?
int gpm_contiene(const char *hay, const char *needle) {
    size_t n = strlen(needle);
    if (!n) return 0;
    for (; *hay; hay++)
        if (!strncasecmp(hay, needle, n)) return 1;
    return 0;
}

const char *gpm_nombre_base(const char *path) {
    const char *s = strrchr(path, '/');
#ifdef _WIN32
    const char *s2 = strrchr(path, '\\');
    if (s2 && (!s || s2 > s)) s = s2;
#endif
    return s ? s + 1 : path;
}

const char *gpm_etiqueta(const profile_t *p) {
    return p->name[0] ? p->name : gpm_nombre_base(p->file);
}

// --------------------------------------------------------------- nombres
static const struct { const char *name; int code; } aliases[] = {
    {"A", BTN_SOUTH},   {"B", BTN_EAST},     {"C", BTN_C},          {"X", BTN_NORTH},       {"Y", BTN_WEST},
    {"Z", BTN_Z},       {"L1", BTN_TL},      {"R1", BTN_TR},        {"L2", BTN_TL2},        {"R2", BTN_TR2},
    {"SELECT", BTN_SELECT}, {"START", BTN_START}, {"HOME", BTN_MODE}, {"L3", BTN_THUMBL},   {"R3", BTN_THUMBR},
    {"DPAD_UP", BTN_DPAD_UP}, {"DPAD_DOWN", BTN_DPAD_DOWN}, {"DPAD_LEFT", BTN_DPAD_LEFT},
    {"DPAD_RIGHT", BTN_DPAD_RIGHT}, {"LS", CODE_LS}, {"RS", CODE_RS},
    // nombres alternativos (solo para leer perfiles)
    {"LB", BTN_TL}, {"RB", BTN_TR}, {"LT", BTN_TL2}, {"RT", BTN_TR2}, {"BACK", BTN_SELECT}, {"MODE", BTN_MODE},
};

const char *gpm_nombre_codigo(int code, char *buf, size_t n) {
    for (size_t i = 0; i < sizeof aliases / sizeof aliases[0]; i++)
        if (aliases[i].code == code) return aliases[i].name;
    snprintf(buf, n, "BTN_%X", code);
    return buf;
}
#define code_name gpm_nombre_codigo

// Devuelve 0 si es un boton (code), 1 si es un eje-boton (axis, dir), -1 si no se reconoce.
int gpm_leer_token(const char *name, int *code, int *axis, int *dir) {
    for (size_t i = 0; i < sizeof aliases / sizeof aliases[0]; i++)
        if (!strcasecmp(aliases[i].name, name)) { *code = aliases[i].code; return 0; }
    char *end;
    if (!strncasecmp(name, "BTN_", 4)) {
        long v = strtol(name + 4, &end, 16);
        if (end != name + 4 && *end == 0 && v > 0 && v < NCODES) { *code = (int)v; return 0; }
    }
    if (!strncasecmp(name, "AXIS_", 5)) {
        long v = strtol(name + 5, &end, 16);
        if (end != name + 5 && v >= 0 && v < ABS_CNT && (end[0] == '+' || end[0] == '-') && end[1] == 0) {
            *axis = (int)v;
            *dir = end[0] == '+' ? 1 : 0;
            return 1;
        }
    }
    return -1;
}
#define parse_token gpm_leer_token

// --------------------------------------------------------------- perfiles
void gpm_liberar_perfil(profile_t *p) {
    if (p->b)
        for (int c = 0; c < NCODES; c++) free(p->b[c].steps);
    for (int a = 0; a < ABS_CNT; a++)
        for (int d = 0; d < 2; d++) free(p->ax[a][d].steps);
    if (p->layers)
        for (int i = 0; i < p->nlayers; i++) free(p->layers[i].bd.steps);
    free(p->b);
    free(p->layers);
    free(p->is_mod);
    p->b = NULL;
    p->layers = NULL;
    p->is_mod = NULL;
    p->nlayers = 0;
}

// "macro x y retraso duracion; x y retraso duracion; ..."  (retraso/duracion en ms, admiten decimales)
static int parse_macro(char *rest, binding_t *bd) {
    step_t tmp[MAX_STEPS];
    int ns = 0;
    // Pasos separados por ';' (los vacios no cuentan)
    for (char *tok = rest; tok && ns < MAX_STEPS;) {
        char *semi = strchr(tok, ';');
        if (semi) *semi = 0;
        double x, y, d = 0, h = 40;
        int k = sscanf(tok, "%lf %lf %lf %lf", &x, &y, &d, &h);
        tok = semi ? semi + 1 : NULL;
        if (k < 2) continue;
        tmp[ns].x = x;
        tmp[ns].y = y;
        tmp[ns].delay = d < 0 ? 0 : d;
        tmp[ns].hold = h < 1 ? 1 : h;
        ns++;
    }
    if (!ns) return -1;
    bd->steps = malloc(ns * sizeof(step_t));
    if (!bd->steps) return -1;
    memcpy(bd->steps, tmp, ns * sizeof(step_t));
    bd->nsteps = ns;
    bd->type = B_MACRO;
    bd->x = tmp[0].x;
    bd->y = tmp[0].y;
    return 0;
}

static int parse_axes(const char *val, int out[2]) {
    unsigned a, b;
    if (sscanf(val, "%x , %x", &a, &b) == 2 && a < ABS_CNT && b < ABS_CNT) { out[0] = (int)a; out[1] = (int)b; return 0; }
    return -1;
}

int gpm_cargar_perfil(const char *path, profile_t *p) {
    FILE *f = fopen(path, "r");
    if (!f) return -1;
    memset(p, 0, sizeof *p);
    snprintf(p->file, sizeof p->file, "%s", path);
    p->sw = 2340;
    p->sh = 1080;
    p->deadzone = 0.18;
    p->look_y = 1.0;
    p->ls_ax[0] = p->ls_ax[1] = p->rs_ax[0] = p->rs_ax[1] = -1;
    p->ls_dz = p->rs_dz = -1;
    p->ls_curve = p->rs_curve = 1;
    p->aim_mod = -1;
    p->aim_scale = 0.5;
    p->b = calloc(NCODES, sizeof(binding_t));
    p->layers = calloc(MAX_LAYERS, sizeof(layer_t));
    p->is_mod = calloc(NCODES, 1);
    if (!p->b || !p->layers || !p->is_mod) { fclose(f); gpm_liberar_perfil(p); return -1; }
    char line[512];
    int ln = 0;
    while (fgets(line, sizeof line, f)) {
        ln++;
        char *hash = strchr(line, '#');
        if (hash) *hash = 0;
        char *s = trim(line);
        if (!*s) continue;
        char *eq = strchr(s, '=');
        if (!eq) { logf_("%s:%d: falta '='", path, ln); continue; }
        *eq = 0;
        char *key = trim(s), *val = trim(eq + 1);
        if (!strcasecmp(key, "package")) { snprintf(p->pkg, sizeof p->pkg, "%s", val); continue; }
        if (!strcasecmp(key, "name")) { snprintf(p->name, sizeof p->name, "%s", val); continue; }
        if (!strcasecmp(key, "screen")) {
            double w, h;
            if (sscanf(val, "%lfx%lf", &w, &h) == 2 && w > 1 && h > 1) { p->sw = w; p->sh = h; }
            else logf_("%s:%d: screen debe ser ANCHOxALTO", path, ln);
            continue;
        }
        if (!strcasecmp(key, "deadzone")) { p->deadzone = atof(val); continue; }
        if (!strcasecmp(key, "look_y")) { p->look_y = atof(val); continue; }
        if (!strcasecmp(key, "look_invert")) { p->look_invert = atoi(val) != 0; continue; }
        if (!strcasecmp(key, "ls_axes")) { if (parse_axes(val, p->ls_ax)) logf_("%s:%d: ls_axes = EJE_X,EJE_Y (hex)", path, ln); continue; }
        if (!strcasecmp(key, "rs_axes")) { if (parse_axes(val, p->rs_ax)) logf_("%s:%d: rs_axes = EJE_X,EJE_Y (hex)", path, ln); continue; }
        if (!strcasecmp(key, "ls_deadzone")) { p->ls_dz = atof(val); continue; }
        if (!strcasecmp(key, "rs_deadzone")) { p->rs_dz = atof(val); continue; }
        if (!strcasecmp(key, "ls_curve")) { p->ls_curve = atof(val); continue; }
        if (!strcasecmp(key, "rs_curve")) { p->rs_curve = atof(val); continue; }
        if (!strcasecmp(key, "aim_button")) {
            int c = -1, ax = -1, dr = 0;
            if (parse_token(val, &c, &ax, &dr) == 0 && c != CODE_LS && c != CODE_RS) p->aim_mod = c;
            else logf_("%s:%d: aim_button debe ser un boton", path, ln);
            continue;
        }
        if (!strcasecmp(key, "aim_scale")) { p->aim_scale = clampd(atof(val), 0.1, 2); continue; }
        if (!strcasecmp(key, "look_accel")) { p->look_accel = clampd(atof(val), 0, 3); continue; }
        if (!strcasecmp(key, "controller")) { snprintf(p->controller, sizeof p->controller, "%s", val); continue; }
        if (!strcasecmp(key, "rumble")) { p->rumble = clampd(atof(val), 0, 1); continue; }
        // Solo para el modo sin root (giroscopio y raton): aqui no aplican.
        if (!strcasecmp(key, "gyro") || !strcasecmp(key, "gyro_button") || !strcasecmp(key, "gyro_invert")
            || !strcasecmp(key, "mouse") || !strcasecmp(key, "players")) continue;

        if (!strncasecmp(key, "P2_", 3) || !strncasecmp(key, "KB_", 3) || !strncasecmp(key, "MOUSE_", 6)) continue;  // solo sin root
        // Capa: "MOD+BOTON" (el '+' final de AXIS_9+ no cuenta).
        int mod = -1;
        char *plus = strchr(key + 1, '+');
        if (plus && plus[1]) {
            *plus = 0;
            int mc = -1, ma = -1, md = 0;
            if (parse_token(trim(key), &mc, &ma, &md) != 0 || mc == CODE_LS || mc == CODE_RS) {
                logf_("%s:%d: modificador invalido '%s' (debe ser un boton)", path, ln, key);
                continue;
            }
            mod = mc;
            key = trim(plus + 1);
        }

        // Teclado (KB_*) y raton (MOUSE_*): solo los usa el modo sin root.
        // y el jugador 2 (P2_*), que necesita distinguir mandos: solo sin root.
        if (!strncasecmp(key, "KB_", 3) || !strncasecmp(key, "MOUSE_", 6) || !strncasecmp(key, "P2_", 3)) continue;
        int code = -1, axis = -1, dir = 0;
        int kind = parse_token(key, &code, &axis, &dir);
        if (kind < 0) { logf_("%s:%d: boton desconocido '%s'", path, ln, key); continue; }
        char type[32] = "";
        double a = 0, b = 0, c = 0, d4 = 0, d5 = 0;
        int n = sscanf(val, "%31s %lf %lf %lf %lf %lf", type, &a, &b, &c, &d4, &d5);
        binding_t bd = {0};
        if (!strcasecmp(type, "macro")) {
            if (parse_macro(val + 5, &bd)) { logf_("%s:%d: macro vacia (usa: macro X Y RETRASO DURACION; ...)", path, ln); continue; }
        } else if (n >= 3 && !strcasecmp(type, "tap")) { bd.type = B_TAP; bd.x = a; bd.y = b; }
        else if (n >= 3 && !strcasecmp(type, "toggle")) { bd.type = B_TOGGLE; bd.x = a; bd.y = b; }
        else if (n >= 3 && !strcasecmp(type, "burst")) {   // rafaga = macro de N pasos en el mismo punto
            int cnt = n >= 4 ? (int)(c + 0.5) : 5;
            double gap = n >= 5 ? d4 : 80;
            if (cnt < 2) cnt = 2;
            if (cnt > MAX_STEPS) cnt = MAX_STEPS;
            if (gap < 40) gap = 40;
            if (gap > 500) gap = 500;
            bd.steps = malloc(cnt * sizeof(step_t));
            if (!bd.steps) continue;
            for (int i = 0; i < cnt; i++) bd.steps[i] = (step_t){a, b, i ? gap : 0, 25};
            bd.nsteps = cnt;
            bd.type = B_MACRO; bd.x = a; bd.y = b;
        }
        else if (n >= 3 && !strcasecmp(type, "quick")) {   // toque rapido = macro de un paso
            bd.steps = malloc(sizeof(step_t));
            if (!bd.steps) continue;
            bd.steps[0] = (step_t){a, b, 0, 40};
            bd.nsteps = 1;
            bd.type = B_MACRO; bd.x = a; bd.y = b;
        }
        else if (n >= 3 && !strcasecmp(type, "turbo")) {
            bd.type = B_TURBO; bd.x = a; bd.y = b;
            bd.rate = n >= 4 ? c : 10;
            if (bd.rate < 1) bd.rate = 1;
            if (bd.rate > 30) bd.rate = 30;
        } else if (n >= 5 && !strcasecmp(type, "swipe")) {
            bd.type = B_SWIPE; bd.x = a; bd.y = b; bd.x2 = c; bd.y2 = d4;
            bd.dur = n >= 6 ? d5 : 150;
            if (bd.dur < 20) bd.dur = 20;
        }
        else if (n >= 4 && !strcasecmp(type, "stick")) {
            bd.type = B_STICK; bd.x = a; bd.y = b; bd.r = c;
            bd.dpad = strstr(val, " dpad") != NULL;
        }
        else if (n >= 4 && !strcasecmp(type, "look")) { bd.type = B_LOOK; bd.x = a; bd.y = b; bd.r = c; }
        else if (n >= 1 && !strcasecmp(type, "none")) { bd.type = B_NONE; }
        else { logf_("%s:%d: accion invalida '%s' (usa: tap | quick | burst | turbo | toggle | swipe | macro | stick | look)", path, ln, val); continue; }
        int is_stick = kind == 0 && (code == CODE_LS || code == CODE_RS);
        if (mod >= 0) {
            if (is_stick || bd.type == B_STICK || bd.type == B_LOOK) {
                logf_("%s:%d: las capas son solo para botones", path, ln);
                free(bd.steps);
                continue;
            }
            if (p->nlayers >= MAX_LAYERS) { logf_("%s:%d: demasiadas capas", path, ln); free(bd.steps); continue; }
            layer_t *L = &p->layers[p->nlayers++];
            L->mod = mod; L->kind = kind; L->code = code; L->axis = axis; L->dir = dir; L->bd = bd;
            p->is_mod[mod] = 1;
            continue;
        }
        if ((bd.type == B_STICK || bd.type == B_LOOK) && !is_stick) {
            logf_("%s:%d: 'stick'/'look' solo valen para LS o RS", path, ln);
            free(bd.steps);
            continue;
        }
        if (bd.type == B_MACRO && is_stick) {
            logf_("%s:%d: 'macro' no vale para LS o RS", path, ln);
            free(bd.steps);
            continue;
        }
        binding_t *dst = kind == 0 ? &p->b[code] : &p->ax[axis][dir];
        free(dst->steps);  // si el boton aparece dos veces, gana la ultima linea
        *dst = bd;
    }
    fclose(f);
    if (!p->pkg[0]) { logf_("%s: sin 'package', se ignora", path); gpm_liberar_perfil(p); return -1; }
    return 0;
}

// ------------------------------------------------------- toques
static int slot_used[NSLOTS];
static int dirty = 0;
static const profile_t *cur = NULL;   // perfil activo

void gpm_usar_perfil(const profile_t *p) { cur = p; }
const profile_t *gpm_perfil(void) { return cur; }
int gpm_slot_usado(int s) { return s >= 0 && s < NSLOTS && slot_used[s]; }

// Toque en coordenadas normalizadas del destino (0..1).
int gpm_toque_abajo_n(double u, double v) {
    int s = -1;
    for (int i = 0; i < NSLOTS; i++) if (!slot_used[i]) { s = i; break; }
    if (s < 0) return -1;
    slot_used[s] = 1;
    plat->abajo(s, u, v);
    dirty = 1;
    return s;
}
#define t_down_n gpm_toque_abajo_n

void gpm_toque_mover_n(int s, double u, double v) {
    if (s < 0) return;
    plat->mover(s, u, v);
    dirty = 1;
}
#define t_move_n gpm_toque_mover_n

// ------------------------------------------------------------ otras pantallas
// Adaptar el perfil a la pantalla real como los juegos adaptan su interfaz: el tamano sigue a la
// altura (en horizontal) y cada boton conserva su distancia al borde mas cercano, con transicion
// suave entre zonas. Misma formula que Profile.fitX/fitY en la app: si se cambia, cambiar las dos.
static double disp_long = 0, disp_short = 0;  // pantalla del movil (la escribe la app en <base>/display)
static double fixed_w = 0, fixed_h = 0;       // destino fijo (escritorio)

void gpm_pantalla(double w, double h) {
    disp_long = w > h ? w : h;
    disp_short = w > h ? h : w;
}

void gpm_destino_fijo(double w, double h) {
    fixed_w = w;
    fixed_h = h;
}

static double fit_anchor(double t) {
    double w = (t - 0.25) / 0.5;
    if (w < 0) w = 0;
    if (w > 1) w = 1;
    return w * w * (3 - 2 * w);
}

double gpm_fit_scale(double sw, double sh, double w, double h) {
    return sw >= sh ? h / sh : w / sw;
}

double gpm_fit_x(double x, double sw, double sh, double w, double h) {
    if (sw < sh) return x * w / sw;
    double s = h / sh;
    return x * s + fit_anchor(x / sw) * (w - sw * s);
}

double gpm_fit_y(double y, double sw, double sh, double w, double h) {
    if (sw >= sh) return y * h / sh;
    double s = w / sw;
    return y * s + fit_anchor(y / sh) * (h - sh * s);
}
#define fit_x gpm_fit_x
#define fit_y gpm_fit_y
#define fit_scale gpm_fit_scale

// Tamano de destino para el perfil activo (sin pantalla conocida: el del propio perfil = sin cambios).
void gpm_destino(double *w, double *h) {
    if (fixed_w > 0 && fixed_h > 0) { *w = fixed_w; *h = fixed_h; return; }
    if (disp_long <= 0) { *w = cur->sw; *h = cur->sh; return; }
    if (cur->sw >= cur->sh) { *w = disp_long; *h = disp_short; }
    else { *w = disp_short; *h = disp_long; }
}
#define target_size gpm_destino

// Toque en pixeles del perfil activo.
static int t_down(double x, double y) {
    double w, h;
    target_size(&w, &h);
    return t_down_n(fit_x(x, cur->sw, cur->sh, w, h) / (w - 1), fit_y(y, cur->sw, cur->sh, w, h) / (h - 1));
}

static void t_move(int s, double x, double y) {
    double w, h;
    target_size(&w, &h);
    t_move_n(s, fit_x(x, cur->sw, cur->sh, w, h) / (w - 1), fit_y(y, cur->sw, cur->sh, w, h) / (h - 1));
}

// Movimiento de un stick: centro adaptado + desplazamiento (en pixeles del perfil) a escala.
static void t_move_off(int s, double x, double y, double dx, double dy) {
    double w, h;
    target_size(&w, &h);
    double k = fit_scale(cur->sw, cur->sh, w, h);
    t_move_n(s, (fit_x(x, cur->sw, cur->sh, w, h) + dx * k) / (w - 1),
             (fit_y(y, cur->sw, cur->sh, w, h) + dy * k) / (h - 1));
}

void gpm_toque_arriba(int s) {
    if (s < 0 || s >= NSLOTS || !slot_used[s]) return;
    slot_used[s] = 0;
    plat->arriba(s);
    dirty = 1;
}
#define t_up gpm_toque_arriba

void gpm_sync(void) {
    if (!dirty) return;
    int any = 0;
    for (int i = 0; i < NSLOTS; i++) any |= slot_used[i];
    plat->sync(any);
    dirty = 0;
}
#define t_sync gpm_sync

// ------------------------------------------------------------ macros
// Cada paso de una macro en curso: pendiente -> abajo -> libre, con tiempos en microsegundos.
typedef struct {
    int state;                 // 0 libre, 1 pendiente, 2 pulsado
    long long t_down, t_up;    // us (reloj monotono)
    double x, y;
    int slot;
} mstep_t;
static mstep_t mq[MAX_QUEUE];

static void macro_start(const binding_t *b) {
    long long t = now_us();
    double acc = 0;
    for (int i = 0; i < b->nsteps; i++) {
        acc += b->steps[i].delay;
        int q = -1;
        for (int k = 0; k < MAX_QUEUE; k++) if (!mq[k].state) { q = k; break; }
        if (q < 0) { logf_("macro: demasiados pasos en curso, se omite el resto"); return; }
        mq[q].state = 1;
        mq[q].t_down = t + (long long)(acc * 1000.0);
        mq[q].t_up = mq[q].t_down + (long long)(b->steps[i].hold * 1000.0);
        mq[q].x = b->steps[i].x;
        mq[q].y = b->steps[i].y;
        mq[q].slot = -1;
    }
}

// Ejecuta los pasos que ya tocan. Devuelve el proximo instante (us) con trabajo, o -1.
long long gpm_macros(void) {
    long long t = now_us(), next = -1;
    // Primero las pulsaciones y luego las liberaciones, cada grupo en su propio SYN:
    // un toque de 1 ms debe verse como abajo y despues arriba, nunca en el mismo informe.
    for (int k = 0; k < MAX_QUEUE; k++) {
        if (mq[k].state == 1 && mq[k].t_down <= t) {
            mq[k].slot = t_down(mq[k].x, mq[k].y);
            mq[k].state = mq[k].slot >= 0 ? 2 : 0;
        }
    }
    t_sync();
    for (int k = 0; k < MAX_QUEUE; k++) {
        if (mq[k].state == 2 && mq[k].t_up <= t) {
            t_up(mq[k].slot);
            mq[k].state = 0;
        }
    }
    t_sync();
    for (int k = 0; k < MAX_QUEUE; k++) {
        long long due = mq[k].state == 1 ? mq[k].t_down : mq[k].state == 2 ? mq[k].t_up : -1;
        if (due >= 0 && (next < 0 || due < next)) next = due;
    }
    return next;
}

static void macro_clear(void) {
    for (int k = 0; k < MAX_QUEUE; k++) {
        if (mq[k].state == 2) t_up(mq[k].slot);
        mq[k].state = 0;
    }
}

// ------------------------------------------------------------ estado mando
static unsigned char keyp[NCODES];          // botones fisicos pulsados
static unsigned char virt[NCODES];          // botones derivados de ejes (cruceta, gatillos)
static runtime_t rt[NCODES];
static runtime_t axrt[ABS_CNT][2];
static unsigned char axdown[ABS_CNT][2];
static gpm_eje_t ai[ABS_CNT];
static int has_abs[ABS_CNT];
static int axraw[ABS_CNT], axrest[ABS_CNT];
static int def_rs_x = ABS_RX, def_rs_y = ABS_RY, trig_l = ABS_Z, trig_r = ABS_RZ;
static int learning = 0;
static double learn_prev[ABS_CNT];
static unsigned char prevp[NCODES], consumed[NCODES];  // combos SELECT+L1/R1
static int switch_req = 0;                             // -1 / +1: cambiar de perfil

static inline int pressed(int c) { return keyp[c] || virt[c]; }
int gpm_pulsado(int c) { return c >= 0 && c < NCODES && pressed(c); }

// Posicion respecto al centro del recorrido (-1..1): para sticks.
static double axis_center(int code) {
    if (code < 0 || code >= ABS_CNT || !has_abs[code]) return 0;
    double mn = ai[code].minimo, mx = ai[code].maximo;
    if (mx <= mn) return 0;
    double r = (axraw[code] - (mn + mx) / 2.0) / ((mx - mn) / 2.0);
    return r < -1 ? -1 : r > 1 ? 1 : r;
}

// Desviacion respecto al reposo (-1..1): para gatillos y ejes usados como botones.
static double axis_dev(int code) {
    if (code < 0 || code >= ABS_CNT || !has_abs[code]) return 0;
    double mn = ai[code].minimo, mx = ai[code].maximo;
    if (mx <= mn) return 0;
    double r = (axraw[code] - axrest[code]) / ((mx - mn) / 2.0);
    return r < -1 ? -1 : r > 1 ? 1 : r;
}

// Interruptores apoyados (accion -> dedo) y deslizamientos en curso.
static struct { const binding_t *b; int slot; } toggles[MAX_TOGGLES];
static struct { int slot; long long t0; double x1, y1, x2, y2, dur; } swipes[MAX_SWIPES];
static int nswipes = 0;

void gpm_soltar_todo(void) {
    // No usa 'cur': se llama tambien cuando el perfil ya se libero.
    macro_clear();
    for (int c = 0; c < NCODES; c++)
        if (rt[c].active) { t_up(rt[c].slot); rt[c].active = 0; rt[c].b = NULL; }
    for (int a = 0; a < ABS_CNT; a++)
        for (int d = 0; d < 2; d++)
            if (axrt[a][d].active) { t_up(axrt[a][d].slot); axrt[a][d].active = 0; axrt[a][d].b = NULL; }
    for (int i = 0; i < NSLOTS; i++) if (slot_used[i]) t_up(i);
    memset(toggles, 0, sizeof toggles);
    nswipes = 0;
    t_sync();
}
#define release_all gpm_soltar_todo

// Al conectar un mando: estado limpio y ejes (recorrido, reposo, stick derecho y gatillos).
void gpm_mando_nuevo(const gpm_eje_t ejes[ABS_CNT]) {
    memset(keyp, 0, sizeof keyp);
    memset(virt, 0, sizeof virt);
    memset(axdown, 0, sizeof axdown);
    memset(learn_prev, 0, sizeof learn_prev);
    memset(has_abs, 0, sizeof has_abs);
    for (int a = 0; a < ABS_CNT; a++) {
        if (ejes[a].tiene) {
            ai[a] = ejes[a];
            has_abs[a] = 1;
            axraw[a] = axrest[a] = ai[a].valor;
            // Sticks: el reposo es el centro aunque el valor inicial este algo desviado.
            int mid = (ai[a].minimo + ai[a].maximo) / 2, span = ai[a].maximo - ai[a].minimo;
            if (abs(ai[a].valor - mid) < span / 8) axrest[a] = mid;
        }
    }
    // Convencion de Android: si hay RX/RY son el stick derecho y Z/RZ los gatillos;
    // si no, Z/RZ son el stick derecho y BRAKE/GAS los gatillos.
    if (has_abs[ABS_RX] && has_abs[ABS_RY]) { def_rs_x = ABS_RX; def_rs_y = ABS_RY; trig_l = ABS_Z; trig_r = ABS_RZ; }
    else { def_rs_x = ABS_Z; def_rs_y = ABS_RZ; trig_l = ABS_BRAKE; trig_r = ABS_GAS; }
    char axes[320] = "";
    for (int a = 0; a < ABS_CNT; a++)
        if (has_abs[a])
            snprintf(axes + strlen(axes), sizeof axes - strlen(axes), " %X(%d..%d)", a, ai[a].minimo, ai[a].maximo);
    logf_("ejes:%s | stick derecho=%X/%X, gatillos=%X/%X", axes, def_rs_x, def_rs_y, trig_l, trig_r);
}

// ------------------------------------------------------------ modo aprender
void gpm_aprender(int on) {
    learning = on;
    release_all();
    memset(learn_prev, 0, sizeof learn_prev);
    for (int a = 0; a < ABS_CNT; a++) learn_prev[a] = fabs(axis_dev(a));  // ejes ya movidos no cuentan
}

int gpm_aprendiendo(void) { return learning; }

static void learn_report(const char *token) {
    if (plat->aprendido) plat->aprendido(token);
}

static void learn_event(int type, int code, int value) {
    char nb[16], tok[32];
    if (type == EV_KEY && code < NCODES && value == 1) {
        learn_report(code_name(code, nb, sizeof nb));
    } else if (type == EV_ABS && code < ABS_CNT) {
        int c = code;
        if (c == ABS_HAT0X || c == ABS_HAT0Y) {
            if (value)
                learn_report(c == ABS_HAT0X ? (value < 0 ? "DPAD_LEFT" : "DPAD_RIGHT")
                                            : (value < 0 ? "DPAD_UP" : "DPAD_DOWN"));
            return;
        }
        double d = axis_dev(c), m = fabs(d);
        if (m > 0.6 && learn_prev[c] < 0.3) {
            snprintf(tok, sizeof tok, "AXIS_%X%c", c, d > 0 ? '+' : '-');
            learn_report(tok);
        }
        if (m > 0.6 || m < 0.3) learn_prev[c] = m;
    }
}

// ------------------------------------------------------------ logica
static long long half_period_us(const binding_t *b) {
    double r = b->rate > 0 ? b->rate : 10;
    long long h = (long long)(500000.0 / r);
    return h < 15000 ? 15000 : h;
}

// Si hay un modificador pulsado con capa para este boton (o eje), esa accion; si no, la normal.
static const binding_t *resolve(int kind, int code, int axis, int dir) {
    for (int i = 0; i < cur->nlayers; i++) {
        const layer_t *L = &cur->layers[i];
        if (L->kind != kind || !pressed(L->mod)) continue;
        if (kind == 0 ? L->code == code : (L->axis == axis && L->dir == dir)) return &L->bd;
    }
    return kind == 0 ? &cur->b[code] : &cur->ax[axis][dir];
}

// Vibracion corta del mando al pulsar (si el perfil la pide y el mando la admite).
static void rumble_pulse(void) {
    if (!cur || cur->rumble <= 0 || !plat->vibrar) return;
    plat->vibrar(cur->rumble);
}

static void press_action(const binding_t *b, runtime_t *r) {
    rumble_pulse();
    r->b = b;
    r->active = 1;
    r->slot = -1;
    if (debug_on()) {
        static const char *names[] = {"none", "tap", "stick", "look", "macro", "turbo", "toggle", "swipe"};
        logf_("accion %s en %.0f,%.0f", b->type >= 0 && b->type <= B_SWIPE ? names[b->type] : "?", b->x, b->y);
    }
    switch (b->type) {
        case B_TAP:
            r->slot = t_down(b->x, b->y);
            break;
        case B_TURBO:
            r->slot = t_down(b->x, b->y);
            r->down = 1;
            r->next = now_us() + half_period_us(b);
            break;
        case B_TOGGLE: {   // una pulsacion apoya el dedo, la siguiente lo levanta
            int i, freei = -1;
            for (i = 0; i < MAX_TOGGLES; i++) {
                if (toggles[i].b == b) break;
                if (!toggles[i].b && freei < 0) freei = i;
            }
            if (i < MAX_TOGGLES) { t_up(toggles[i].slot); toggles[i].b = NULL; }
            else if (freei >= 0) { toggles[freei].b = b; toggles[freei].slot = t_down(b->x, b->y); }
            break;
        }
        case B_SWIPE:
            if (nswipes < MAX_SWIPES) {
                int s = t_down(b->x, b->y);
                if (s >= 0) {
                    swipes[nswipes].slot = s;
                    swipes[nswipes].t0 = now_us();
                    swipes[nswipes].x1 = b->x; swipes[nswipes].y1 = b->y;
                    swipes[nswipes].x2 = b->x2; swipes[nswipes].y2 = b->y2;
                    swipes[nswipes].dur = b->dur > 0 ? b->dur : 150;
                    nswipes++;
                }
            }
            break;
        case B_MACRO:   // se ejecuta entera aunque se suelte el boton
            macro_start(b);
            break;
        default:
            break;
    }
}

static void release_action(runtime_t *r) {
    if (r->b && (r->b->type == B_TAP || r->b->type == B_TURBO) && r->slot >= 0) t_up(r->slot);
    r->active = 0;
    r->b = NULL;
    r->slot = -1;
}

static void button_logic(int kind, int code, int axis, int dir, runtime_t *r, int on) {
    if (on && !r->active) {
        const binding_t *b = resolve(kind, code, axis, dir);
        if (b->type == B_NONE || b->type == B_STICK || b->type == B_LOOK) return;
        press_action(b, r);
    } else if (!on && r->active) {
        release_action(r);
    }
}

static void apply_buttons(void) {
    for (int c = 0; c < NCODES; c++) {
        if (c == CODE_LS || c == CODE_RS) continue;
        int on = pressed(c) && !consumed[c] && !cur->is_mod[c];
        if (!on && !rt[c].active) continue;
        button_logic(0, c, 0, 0, &rt[c], on);
    }
    for (int a = 0; a < ABS_CNT; a++) {
        if (!has_abs[a]) continue;
        for (int d = 0; d < 2; d++) {
            if (!axdown[a][d] && !axrt[a][d].active) continue;
            button_logic(1, 0, a, d, &axrt[a][d], axdown[a][d]);
        }
    }
}

// Turbo (apoyar/levantar a su ritmo) y deslizamientos (mover y levantar al acabar).
static int timed_actions(void) {
    long long n = now_us();
    int any = 0;
    for (int c = 0; c < NCODES + ABS_CNT * 2; c++) {
        runtime_t *r = c < NCODES ? &rt[c] : &axrt[(c - NCODES) / 2][(c - NCODES) % 2];
        if (!r->active || !r->b || r->b->type != B_TURBO) continue;
        any = 1;
        if (n < r->next) continue;
        if (r->down) { t_up(r->slot); r->slot = -1; }
        else {
            r->slot = t_down(r->b->x, r->b->y);
            if (debug_on()) logf_("turbo: toque en %.0f,%.0f", r->b->x, r->b->y);
        }
        r->down = !r->down;
        r->next = n + half_period_us(r->b);
    }
    for (int i = 0; i < nswipes; i++) {
        double k = (n - swipes[i].t0) / (swipes[i].dur * 1000.0);
        if (k > 1) k = 1;
        t_move(swipes[i].slot, swipes[i].x1 + (swipes[i].x2 - swipes[i].x1) * k,
               swipes[i].y1 + (swipes[i].y2 - swipes[i].y1) * k);
        if (k >= 1) {
            t_up(swipes[i].slot);
            swipes[i] = swipes[--nswipes];
            i--;
        }
        any = 1;
    }
    return any;
}

static void stick_axes(int code, int *ax, int *ay) {
    const int *o = code == CODE_LS ? cur->ls_ax : cur->rs_ax;
    if (o[0] >= 0 && o[1] >= 0) { *ax = o[0]; *ay = o[1]; return; }
    if (code == CODE_LS) { *ax = ABS_X; *ay = ABS_Y; }
    else { *ax = def_rs_x; *ay = def_rs_y; }
}

static void stick_vec(int code, double *vx, double *vy) {
    int ax, ay;
    stick_axes(code, &ax, &ay);
    *vx = axis_center(ax);
    *vy = axis_center(ay);
}

// Vector del stick tras zona muerta y curva. Devuelve 0 dentro de la zona muerta.
// keep_offset: el joystick empieza en la zona muerta (no en 0) para no caer en la del juego.
static int shaped(int code, int keep_offset, double *vx, double *vy) {
    stick_vec(code, vx, vy);
    double mag = sqrt(*vx * *vx + *vy * *vy);
    double dz = code == CODE_LS ? cur->ls_dz : cur->rs_dz;
    if (dz < 0) dz = cur->deadzone;
    double curve = code == CODE_LS ? cur->ls_curve : cur->rs_curve;
    if (curve < 0.3) curve = 0.3;
    if (mag <= dz || mag < 1e-3) return 0;
    double m = (mag - dz) / (1 - dz > 0.01 ? 1 - dz : 0.01);
    if (m > 1) m = 1;
    m = pow(m, curve);
    if (keep_offset) m = dz + (1 - dz) * m;
    *vx = *vx / mag * m;
    *vy = *vy / mag * m;
    return 1;
}

// Cruceta -> joystick: solo las flechas sin accion propia. Diagonales incluidas, longitud 1.
static int dpad_vec(double *vx, double *vy) {
    static const int arrows[4] = {BTN_DPAD_LEFT, BTN_DPAD_RIGHT, BTN_DPAD_UP, BTN_DPAD_DOWN};
    int on[4];
    for (int i = 0; i < 4; i++) {
        int c = arrows[i];
        on[i] = cur->b[c].type == B_NONE && !cur->is_mod[c] && pressed(c);
    }
    double x = on[1] - on[0], y = on[3] - on[2];
    if (x == 0 && y == 0) return 0;
    double m = sqrt(x * x + y * y);
    *vx = x / m;
    *vy = y / m;
    return 1;
}

static void apply_stick(int code) {
    const binding_t *b = &cur->b[code];
    runtime_t *r = &rt[code];
    if (b->type != B_STICK) return;
    double vx, vy;
    if (shaped(code, 1, &vx, &vy) || (b->dpad && dpad_vec(&vx, &vy))) {
        if (!r->active) {
            r->slot = t_down(b->x, b->y);
            r->active = r->slot >= 0;
            t_sync();  // el juego necesita ver el toque en el centro antes de arrastrar
        }
        t_move_off(r->slot, b->x, b->y, vx * b->r, vy * b->r);
    } else if (r->active) {
        t_up(r->slot);
        r->active = 0;
    }
}

// Multiplicador de la camara: apuntar (aim_button) y aceleracion con el stick al tope.
static long long look_full_since[2];
static double look_speed(int code, double vx, double vy) {
    double m = 1;
    if (cur->aim_mod >= 0 && pressed(cur->aim_mod)) m *= cur->aim_scale;
    int i = code == CODE_RS;
    if (cur->look_accel > 0 && vx * vx + vy * vy >= 0.81) {
        long long n = now_ms();
        if (!look_full_since[i]) look_full_since[i] = n;
        double k = (n - look_full_since[i]) / 600.0;
        m *= 1 + cur->look_accel * (k > 1 ? 1 : k);
    } else look_full_since[i] = 0;
    return m;
}

// Camara: arrastre continuo mientras el stick esta inclinado.
static void look_tick(int code, double dt_ticks) {
    const binding_t *b = &cur->b[code];
    runtime_t *r = &rt[code];
    if (b->type != B_LOOK) return;
    double vx, vy;
    if (!shaped(code, 0, &vx, &vy)) {
        if (r->active) { t_up(r->slot); r->active = 0; }
        return;
    }
    if (!r->active) {
        r->slot = t_down(b->x, b->y);
        r->active = r->slot >= 0;
        r->cx = b->x;
        r->cy = b->y;
        t_sync();
        return;
    }
    double ys = cur->look_y * (cur->look_invert ? -1 : 1);
    double m = look_speed(code, vx, vy);
    r->cx += vx * b->r * m * dt_ticks;
    r->cy += vy * b->r * ys * m * dt_ticks;
    double dx = r->cx - b->x, dy = r->cy - b->y, lim = (cur->sw < cur->sh ? cur->sw : cur->sh) * 0.28;
    int out = r->cx < 0 || r->cy < 0 || r->cx >= cur->sw || r->cy >= cur->sh;
    if (out || dx * dx + dy * dy > lim * lim) {  // demasiado lejos: levantar y volver al centro
        t_up(r->slot);
        t_sync();
        r->slot = t_down(b->x, b->y);
        r->active = r->slot >= 0;
        r->cx = b->x;
        r->cy = b->y;
        t_sync();
        return;
    }
    t_move(r->slot, r->cx, r->cy);
}

static int needs_ticks(void) {
    if (!cur) return 0;
    if (nswipes > 0) return 1;
    for (int c = 0; c < NCODES; c++) if (rt[c].active && rt[c].b && rt[c].b->type == B_TURBO) return 1;
    for (int a = 0; a < ABS_CNT; a++)
        for (int d = 0; d < 2; d++) if (axrt[a][d].active && axrt[a][d].b && axrt[a][d].b->type == B_TURBO) return 1;
    return cur->b[CODE_LS].type == B_LOOK || cur->b[CODE_RS].type == B_LOOK;
}

int gpm_intervalo_ms(void) {
    return needs_ticks() ? (nswipes ? 8 : 10) : 0;
}

static void update_derived(void) {
    // Ejes como botones (con histeresis) y gatillos analogicos -> L2/R2.
    for (int a = 0; a < ABS_CNT; a++) {
        if (!has_abs[a] || a == ABS_HAT0X || a == ABS_HAT0Y) continue;
        double d = axis_dev(a);
        axdown[a][1] = axdown[a][1] ? d > AX_RELEASE : d > AX_PRESS;
        axdown[a][0] = axdown[a][0] ? -d > AX_RELEASE : -d > AX_PRESS;
    }
    if (has_abs[trig_l]) virt[BTN_TL2] = axdown[trig_l][1];
    if (has_abs[trig_r]) virt[BTN_TR2] = axdown[trig_r][1];
}

void gpm_evento(int type, int code, int value, int grabbed) {
    char nb[16];
    if (type == EV_ABS && code >= 0 && code < ABS_CNT) {
        axraw[code] = value;
        if (code == ABS_HAT0X) { virt[BTN_DPAD_LEFT] = value < 0; virt[BTN_DPAD_RIGHT] = value > 0; }
        else if (code == ABS_HAT0Y) { virt[BTN_DPAD_UP] = value < 0; virt[BTN_DPAD_DOWN] = value > 0; }
    } else if (type == EV_KEY && code >= 0 && code < NCODES) {
        keyp[code] = value ? 1 : 0;
        if (debug_on() && value != 2) logf_("boton %s %s", code_name(code, nb, sizeof nb), value ? "pulsado" : "soltado");
    }

    if (learning) { learn_event(type, code, value); return; }

    if (type == EV_SYN && code == SYN_REPORT) {
        update_derived();
        if (grabbed && cur) {
            // SELECT + R1 / L1: siguiente / anterior perfil del juego (R1/L1 no llegan al juego).
            // Si el perfil usa SELECT como modificador de capa, SELECT+R1/L1 es la capa.
            if (pressed(BTN_SELECT) && !cur->is_mod[BTN_SELECT]) {
                if (pressed(BTN_TR) && !prevp[BTN_TR]) { switch_req = 1; consumed[BTN_TR] = 1; }
                if (pressed(BTN_TL) && !prevp[BTN_TL]) { switch_req = -1; consumed[BTN_TL] = 1; }
            }
            for (int k = 0; k < 2; k++) {
                int c = k ? BTN_TR : BTN_TL;
                if (!pressed(c)) consumed[c] = 0;
                prevp[c] = pressed(c);
            }
            apply_buttons();
            apply_stick(CODE_LS);
            apply_stick(CODE_RS);
            t_sync();
        }
    }
}

// ------------------------------------------------------------ vuelta del bucle
static long long combo_since = 0;
static int combo_fired = 0;

int gpm_combo_pausa(int vigilar) {
    if (vigilar && pressed(BTN_SELECT) && pressed(BTN_START)) {
        if (!combo_since) combo_since = now_ms();
        else if (!combo_fired && now_ms() - combo_since >= 1000) {
            combo_fired = 1;
            return 1;
        }
    } else { combo_since = 0; combo_fired = 0; }
    return 0;
}

int gpm_cambio_pedido(void) {
    int d = switch_req;
    switch_req = 0;
    return d;
}

static long long last_tick = 0;

void gpm_reiniciar_ticks(void) { last_tick = now_ms(); }

void gpm_ticks(int activo) {
    long long t = now_ms();
    if (activo && needs_ticks()) {
        double dt = (t - last_tick) / 16.0;  // fotogramas de ~60 Hz
        if (dt > 4) dt = 4;
        look_tick(CODE_LS, dt);
        look_tick(CODE_RS, dt);
        timed_actions();   // turbo y deslizar
        t_sync();
    }
    last_tick = t;
}
