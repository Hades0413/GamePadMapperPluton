// gpmapper - mapeador de mando a toques de pantalla con perfiles por juego.
//
// Lee un gamepad (cualquier mando HID; p. ej. el GamepadPlus V3 en modo Home+X) y,
// cuando la app en primer plano tiene un perfil, captura el mando en exclusiva y
// convierte botones, ejes y sticks en toques sobre una pantalla tactil virtual (uinput).
// Si la app no tiene perfil, suelta el mando para que funcione como gamepad normal.
//
// La pantalla virtual usa coordenadas 0..RAW_MAX; el modulo instala un IDC
// (Vendor_1949_Product_7a01.idc) con touch.orientationAware=0 para que Android las
// interprete en la orientacion visible: los perfiles se escriben en pixeles "tal como se
// ve la pantalla" y funcionan en cualquier rotacion.
//
// Modo aprender: si existe <base>/learn (lo crea la app editora), no se generan toques y
// cada boton/eje que se pulse se escribe en <base>/learn_result como su nombre de perfil
// (A, B, BTN_13A, AXIS_9+, DPAD_UP...). Asi se puede mapear cualquier mando.
//
// Macros: "BOTON = macro X Y RETRASO DURACION; X Y RETRASO DURACION; ..." (ms, con decimales).
// RETRASO cuenta desde el inicio del paso anterior (0 = a la vez).
//
// Sin root (lanzado por adb como usuario shell): no hay IDC, asi que se usa -R (girar segun
// <base>/rotation, que escribe la app), -p 7a02 y -t (reenviar mandos en modo tactil).
//
// Uso: gpmapper [-d DIR_PERFILES] [-v] [-R] [-t] [-p PRODUCTO_HEX] [-T u,v]
#define _GNU_SOURCE  // ppoll
#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <linux/uinput.h>
#include <math.h>
#include <poll.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#define RAW_MAX 32767
#define NSLOTS 10
#define NCODES 0x300          // codigos EV_KEY cubiertos (incluye pseudo-codigos)
#define CODE_LS 0x2F0         // pseudo-codigos para sticks
#define CODE_RS 0x2F1
#define MAX_PROFILES 64
#define VDEV_NAME "Gamepad Mapper Touch"
#define VDEV_VENDOR 0x1949
#define VDEV_PRODUCT 0x7a01
#define AX_PRESS 0.5          // histeresis de ejes usados como botones
#define AX_RELEASE 0.35

enum { B_NONE = 0, B_TAP, B_STICK, B_LOOK, B_MACRO, B_TURBO, B_TOGGLE, B_SWIPE };
#define MAX_LAYERS 64         // botones en capas ("L2+A")
#define MAX_TOGGLES 32        // interruptores apoyados a la vez
#define MAX_SWIPES 8          // deslizamientos en curso

#define MAX_STEPS 16          // pasos por macro
// Numero de compilacion del motor: la app lo compara con el del modulo que lleva dentro para
// avisar si el instalado esta desactualizado. Subirlo con cada cambio del formato de perfil.
// 2 = toque rapido, rafaga, joystick + cruceta (v1.1).
// 3 = carpeta de la app (Android/data/com.gamepadmapper.app/files) (v1.2).
#define GPM_BUILD 5
#define MAX_QUEUE 64          // toques de macro en curso a la vez

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
    binding_t *b;                // NCODES: botones + LS/RS
    binding_t ax[ABS_CNT][2];    // ejes como botones: [eje][0 = negativo, 1 = positivo]
    layer_t *layers;             // MAX_LAYERS
    int nlayers;
    unsigned char *is_mod;       // NCODES: boton usado como modificador (no toca por si solo)
} profile_t;

typedef struct {
    int active;
    int slot;
    double cx, cy;    // posicion actual (look)
    const binding_t *b;   // accion elegida al pulsar (capa o normal)
    int down;             // turbo: dedo apoyado
    long long next;       // turbo: proximo cambio (us)
} runtime_t;

// ---------------------------------------------------------------- utilidades
static int verbose = 0;
// Carpeta de perfiles por defecto: la de la app 1.2+ (o la antigua si la app es 1.0/1.1).
// service.sh la pasa siempre con -d.
#define APP_PROFILES "/sdcard/Android/data/com.gamepadmapper.app/files/profiles"
static char prof_dir[256] = APP_PROFILES;
static char debug_flag[300], learn_flag[300], learn_result[300], active_file[300];
/* <base>/paused: lo crea/borra el boton de Ajustes rapidos de la app (pausar el mando). */
static char paused_flag[300];

static long long now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static void logf_(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
static void logf_(const char *fmt, ...) {
    time_t t = time(NULL);
    struct tm tm;
    gmtime_r(&t, &tm);
    printf("%04d-%02d-%02d %02d:%02d:%02dZ ", tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min,
           tm.tm_sec);
    va_list ap;
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
    printf("\n");
    fflush(stdout);
}

static int debug_on(void) {
    static long long last = -10000;
    static int cached = 0;
    long long n = now_ms();
    if (n - last > 2000) {
        cached = verbose || access(debug_flag, F_OK) == 0;
        last = n;
    }
    return cached;
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

static const char *code_name(int code, char *buf, size_t n) {
    for (size_t i = 0; i < sizeof aliases / sizeof aliases[0]; i++)
        if (aliases[i].code == code) return aliases[i].name;
    snprintf(buf, n, "BTN_%X", code);
    return buf;
}

// Devuelve 0 si es un boton (code), 1 si es un eje-boton (axis, dir), -1 si no se reconoce.
static int parse_token(const char *name, int *code, int *axis, int *dir) {
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

// --------------------------------------------------------------- perfiles
static profile_t profiles[MAX_PROFILES];
static int nprofiles = 0;
static unsigned long long prof_sig = 0;

static char *trim(char *s) {
    while (isspace((unsigned char)*s)) s++;
    char *e = s + strlen(s);
    while (e > s && isspace((unsigned char)e[-1])) *--e = 0;
    return s;
}

static void free_profile(profile_t *p) {
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

static void free_profiles(void) {
    for (int i = 0; i < nprofiles; i++) free_profile(&profiles[i]);
    nprofiles = 0;
}

// "macro x y retraso duracion; x y retraso duracion; ..."  (retraso/duracion en ms, admiten decimales)
static int parse_macro(char *rest, binding_t *bd) {
    step_t tmp[MAX_STEPS];
    int ns = 0;
    char *save = NULL;
    for (char *tok = strtok_r(rest, ";", &save); tok && ns < MAX_STEPS; tok = strtok_r(NULL, ";", &save)) {
        double x, y, d = 0, h = 40;
        int k = sscanf(tok, "%lf %lf %lf %lf", &x, &y, &d, &h);
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

static int load_profile(const char *path, profile_t *p) {
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
    p->b = calloc(NCODES, sizeof(binding_t));
    p->layers = calloc(MAX_LAYERS, sizeof(layer_t));
    p->is_mod = calloc(NCODES, 1);
    if (!p->b || !p->layers || !p->is_mod) { fclose(f); free_profile(p); return -1; }
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
    if (!p->pkg[0]) { logf_("%s: sin 'package', se ignora", path); free_profile(p); return -1; }
    return 0;
}

static unsigned long long dir_signature(void) {
    DIR *d = opendir(prof_dir);
    if (!d) return 1;
    unsigned long long sig = 0;
    struct dirent *e;
    while ((e = readdir(d))) {
        size_t l = strlen(e->d_name);
        if (l < 6 || strcmp(e->d_name + l - 5, ".conf")) continue;
        char path[600];
        snprintf(path, sizeof path, "%s/%s", prof_dir, e->d_name);
        struct stat st;
        if (stat(path, &st) == 0)
            sig += (unsigned long long)st.st_mtime * 1000003ULL + (unsigned long long)st.st_size * 31ULL + l;
    }
    closedir(d);
    struct stat ast;  // tambien recargar si cambia el perfil activo
    if (stat(active_file, &ast) == 0) sig += (unsigned long long)ast.st_mtime * 7919ULL + (unsigned long long)ast.st_size;
    return sig ? sig : 2;
}

// active.txt: una linea "paquete = archivo.conf" por juego con el perfil elegido.
static const char *base_name(const char *path) {
    const char *s = strrchr(path, '/');
    return s ? s + 1 : path;
}

static void load_active(void) {
    for (int i = 0; i < nprofiles; i++) profiles[i].is_active = 0;
    FILE *f = fopen(active_file, "r");
    if (!f) return;
    char line[512];
    while (fgets(line, sizeof line, f)) {
        char *eq = strchr(line, '=');
        if (!eq) continue;
        *eq = 0;
        char *pkg = trim(line), *file = trim(eq + 1);
        for (int i = 0; i < nprofiles; i++)
            if (!strcmp(profiles[i].pkg, pkg)) profiles[i].is_active = !strcmp(base_name(profiles[i].file), file);
    }
    fclose(f);
}

static void save_active(const char *pkg, const char *file) {
    char lines[64][320];
    int n = 0, found = 0;
    FILE *f = fopen(active_file, "r");
    if (f) {
        char line[320];
        while (n < 64 && fgets(line, sizeof line, f)) {
            char copy[320];
            snprintf(copy, sizeof copy, "%s", line);
            char *eq = strchr(copy, '=');
            if (!eq) continue;
            *eq = 0;
            if (!strcmp(trim(copy), pkg)) { snprintf(lines[n++], sizeof lines[0], "%s = %s\n", pkg, file); found = 1; }
            else snprintf(lines[n++], sizeof lines[0], "%s", line);
        }
        fclose(f);
    }
    if (!found && n < 64) snprintf(lines[n++], sizeof lines[0], "%s = %s\n", pkg, file);
    char tmp[320];
    snprintf(tmp, sizeof tmp, "%s.tmp", active_file);
    f = fopen(tmp, "w");
    if (!f) { logf_("no se puede escribir %s: %s", tmp, strerror(errno)); return; }
    for (int i = 0; i < n; i++) fputs(lines[i], f);
    fclose(f);
    rename(tmp, active_file);
}

static int cmp_profile(const void *a, const void *b) {
    return strcmp(((const profile_t *)a)->file, ((const profile_t *)b)->file);
}

// Perfil a usar para un paquete: el activo, o el primero por nombre de archivo.
static int profile_for_pkg(const char *pkg, size_t len) {
    int first = -1;
    for (int i = 0; i < nprofiles; i++) {
        if (strlen(profiles[i].pkg) != len || strncmp(profiles[i].pkg, pkg, len)) continue;
        if (profiles[i].is_active) return i;
        if (first < 0) first = i;
    }
    return first;
}

static const char *profile_label(const profile_t *p) {
    return p->name[0] ? p->name : base_name(p->file);
}

// Aviso en la barra de notificaciones (sin esperar al proceso).
static void notify(const char *msg) {
    pid_t pid = fork();
    if (pid == 0) {
        int nul = open("/dev/null", O_RDWR);
        if (nul >= 0) { dup2(nul, 1); dup2(nul, 2); }
        execl("/system/bin/cmd", "cmd", "notification", "post", "-S", "bigtext", "-t", "Gamepad Mapper",
              "gpmapper", msg, (char *)NULL);
        _exit(127);
    }
}

static int reload_profiles_if_changed(void) {
    unsigned long long sig = dir_signature();
    if (sig == prof_sig) return 0;
    prof_sig = sig;
    free_profiles();
    DIR *d = opendir(prof_dir);
    if (!d) { logf_("no se puede abrir %s: %s", prof_dir, strerror(errno)); return 1; }
    struct dirent *e;
    while ((e = readdir(d)) && nprofiles < MAX_PROFILES) {
        size_t l = strlen(e->d_name);
        if (l < 6 || strcmp(e->d_name + l - 5, ".conf")) continue;
        char path[600];
        snprintf(path, sizeof path, "%s/%s", prof_dir, e->d_name);
        if (load_profile(path, &profiles[nprofiles]) == 0) {
            logf_("perfil cargado: %s -> %s (%gx%g)", e->d_name, profiles[nprofiles].pkg, profiles[nprofiles].sw,
                  profiles[nprofiles].sh);
            nprofiles++;
        }
    }
    closedir(d);
    qsort(profiles, nprofiles, sizeof profiles[0], cmp_profile);
    load_active();
    logf_("%d perfil(es) cargados", nprofiles);
    return 1;
}

// App en primer plano: procesos con oom_score_adj == 0 cuyo nombre es un paquete con perfil.
static int foreground_profile(void) {
    if (!nprofiles) return -1;
    DIR *d = opendir("/proc");
    if (!d) return -1;
    struct dirent *e;
    int found = -1;
    while ((e = readdir(d)) && found < 0) {
        if (!isdigit((unsigned char)e->d_name[0])) continue;
        char path[64], buf[256];
        snprintf(path, sizeof path, "/proc/%s/oom_score_adj", e->d_name);
        int fd = open(path, O_RDONLY);
        if (fd < 0) continue;
        ssize_t n = read(fd, buf, sizeof buf - 1);
        close(fd);
        if (n <= 0) continue;
        buf[n] = 0;
        if (buf[0] != '0' || atoi(buf) != 0) continue;
        snprintf(path, sizeof path, "/proc/%s/cmdline", e->d_name);
        fd = open(path, O_RDONLY);
        if (fd < 0) continue;
        n = read(fd, buf, sizeof buf - 1);
        close(fd);
        if (n <= 0) continue;
        buf[n] = 0;
        for (int i = 0; i < nprofiles; i++) {
            size_t pl = strlen(profiles[i].pkg);
            if (!strncmp(buf, profiles[i].pkg, pl) && (buf[pl] == 0 || buf[pl] == ':')) {
                found = profile_for_pkg(profiles[i].pkg, pl);
                break;
            }
        }
    }
    closedir(d);
    return found;
}

// ------------------------------------------------------- pantalla virtual
static int ufd = -1;
static int slot_used[NSLOTS];
static int tracking_id = 0;
static int dirty = 0, touch_state = 0;
static const profile_t *cur = NULL;   // perfil activo

// Orientacion. Con root, el modulo instala un IDC (orientationAware=0) y las coordenadas
// van tal cual. Sin root no hay IDC: Android interpreta la pantalla virtual en vertical,
// asi que hay que girar nosotros segun la rotacion actual (la escribe la app en 'rotation').
static int rot_mode = 0;              // -R: girar coordenadas segun la rotacion
static int cur_rot = 0;               // 0..3 (Surface.ROTATION_*)
static int vdev_product = VDEV_PRODUCT;
static char rotation_file[300];

static void read_rotation(void) {
    if (!rot_mode) return;
    int fd = open(rotation_file, O_RDONLY);
    if (fd < 0) return;
    char b[8] = {0};
    if (read(fd, b, sizeof b - 1) > 0 && b[0] >= '0' && b[0] <= '3') cur_rot = b[0] - '0';
    close(fd);
}

// Punto en la pantalla tal como se ve (u,v en 0..1) -> coordenadas crudas de la pantalla virtual.
static void map_point(double u, double v, int *rx, int *ry) {
    double a = u, b = v;
    if (rot_mode) {
        switch (cur_rot & 3) {
            case 1: a = 1.0 - v; b = u; break;   // ROTATION_90
            case 2: a = 1.0 - u; b = 1.0 - v; break;
            case 3: a = v; b = 1.0 - u; break;   // ROTATION_270
            default: break;
        }
    }
    if (a < 0) a = 0;
    if (a > 1) a = 1;
    if (b < 0) b = 0;
    if (b > 1) b = 1;
    *rx = (int)(a * RAW_MAX + 0.5);
    *ry = (int)(b * RAW_MAX + 0.5);
}

static void emit(int type, int code, int value) {
    struct input_event ev;
    memset(&ev, 0, sizeof ev);
    ev.type = type;
    ev.code = code;
    ev.value = value;
    if (write(ufd, &ev, sizeof ev) != (ssize_t)sizeof ev && debug_on()) logf_("uinput write: %s", strerror(errno));
}

static void abs_setup(int code, int min, int max) {
    struct uinput_abs_setup a;
    memset(&a, 0, sizeof a);
    a.code = code;
    a.absinfo.minimum = min;
    a.absinfo.maximum = max;
    ioctl(ufd, UI_ABS_SETUP, &a);
}

static int create_vdev(void) {
    ufd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (ufd < 0) { logf_("no se puede abrir /dev/uinput: %s", strerror(errno)); return -1; }
    ioctl(ufd, UI_SET_EVBIT, EV_KEY);
    ioctl(ufd, UI_SET_KEYBIT, BTN_TOUCH);
    ioctl(ufd, UI_SET_EVBIT, EV_ABS);
    int axes[] = {ABS_MT_SLOT, ABS_MT_TRACKING_ID, ABS_MT_POSITION_X, ABS_MT_POSITION_Y, ABS_MT_TOUCH_MAJOR,
                  ABS_MT_PRESSURE};
    for (size_t i = 0; i < sizeof axes / sizeof axes[0]; i++) ioctl(ufd, UI_SET_ABSBIT, axes[i]);
    ioctl(ufd, UI_SET_PROPBIT, INPUT_PROP_DIRECT);
    abs_setup(ABS_MT_SLOT, 0, NSLOTS - 1);
    abs_setup(ABS_MT_TRACKING_ID, 0, 65535);
    abs_setup(ABS_MT_POSITION_X, 0, RAW_MAX);
    abs_setup(ABS_MT_POSITION_Y, 0, RAW_MAX);
    abs_setup(ABS_MT_TOUCH_MAJOR, 0, 255);
    abs_setup(ABS_MT_PRESSURE, 0, 255);
    struct uinput_setup us;
    memset(&us, 0, sizeof us);
    us.id.bustype = BUS_VIRTUAL;
    us.id.vendor = VDEV_VENDOR;
    us.id.product = vdev_product;
    us.id.version = 1;
    snprintf(us.name, UINPUT_MAX_NAME_SIZE, "%s", VDEV_NAME);
    if (ioctl(ufd, UI_DEV_SETUP, &us) < 0 || ioctl(ufd, UI_DEV_CREATE) < 0) {
        logf_("no se pudo crear la pantalla virtual: %s", strerror(errno));
        return -1;
    }
    return 0;
}

// Toque en coordenadas normalizadas de la pantalla visible (0..1).
static int t_down_n(double u, double v) {
    int s = -1;
    for (int i = 0; i < NSLOTS; i++) if (!slot_used[i]) { s = i; break; }
    if (s < 0) return -1;
    slot_used[s] = 1;
    if (++tracking_id > 65535) tracking_id = 1;
    int rx, ry;
    map_point(u, v, &rx, &ry);
    emit(EV_ABS, ABS_MT_SLOT, s);
    emit(EV_ABS, ABS_MT_TRACKING_ID, tracking_id);
    emit(EV_ABS, ABS_MT_POSITION_X, rx);
    emit(EV_ABS, ABS_MT_POSITION_Y, ry);
    emit(EV_ABS, ABS_MT_TOUCH_MAJOR, 6);
    emit(EV_ABS, ABS_MT_PRESSURE, 60);
    dirty = 1;
    return s;
}

static void t_move_n(int s, double u, double v) {
    if (s < 0) return;
    int rx, ry;
    map_point(u, v, &rx, &ry);
    emit(EV_ABS, ABS_MT_SLOT, s);
    emit(EV_ABS, ABS_MT_POSITION_X, rx);
    emit(EV_ABS, ABS_MT_POSITION_Y, ry);
    dirty = 1;
}

// ------------------------------------------------------------ otras pantallas
// Adaptar el perfil a la pantalla real como los juegos adaptan su interfaz: el tamano sigue a la
// altura (en horizontal) y cada boton conserva su distancia al borde mas cercano, con transicion
// suave entre zonas. Misma formula que Profile.fitX/fitY en la app: si se cambia, cambiar las dos.
static double disp_long = 0, disp_short = 0;  // pantalla real (la escribe la app en <base>/display)
static char display_file[300];

static void read_display(void) {
    FILE *f = fopen(display_file, "r");
    if (!f) return;
    double w = 0, h = 0;
    if (fscanf(f, "%lfx%lf", &w, &h) == 2 && w >= 100 && h >= 100 && w <= 20000 && h <= 20000) {
        disp_long = w > h ? w : h;
        disp_short = w > h ? h : w;
    }
    fclose(f);
}

static double fit_anchor(double t) {
    double w = (t - 0.25) / 0.5;
    if (w < 0) w = 0;
    if (w > 1) w = 1;
    return w * w * (3 - 2 * w);
}

static double fit_scale(double sw, double sh, double w, double h) {
    return sw >= sh ? h / sh : w / sw;
}

static double fit_x(double x, double sw, double sh, double w, double h) {
    if (sw < sh) return x * w / sw;
    double s = h / sh;
    return x * s + fit_anchor(x / sw) * (w - sw * s);
}

static double fit_y(double y, double sw, double sh, double w, double h) {
    if (sw >= sh) return y * h / sh;
    double s = w / sw;
    return y * s + fit_anchor(y / sh) * (h - sh * s);
}

// Tamano de destino para el perfil activo (sin <base>/display: el del propio perfil = sin cambios).
static void target_size(double *w, double *h) {
    if (disp_long <= 0) { *w = cur->sw; *h = cur->sh; return; }
    if (cur->sw >= cur->sh) { *w = disp_long; *h = disp_short; }
    else { *w = disp_short; *h = disp_long; }
}

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

static void t_up(int s) {
    if (s < 0 || !slot_used[s]) return;
    slot_used[s] = 0;
    emit(EV_ABS, ABS_MT_SLOT, s);
    emit(EV_ABS, ABS_MT_TRACKING_ID, -1);
    dirty = 1;
}

static void t_sync(void) {
    if (!dirty) return;
    int any = 0;
    for (int i = 0; i < NSLOTS; i++) any |= slot_used[i];
    if (any != touch_state) { emit(EV_KEY, BTN_TOUCH, any); touch_state = any; }
    emit(EV_SYN, SYN_REPORT, 0);
    dirty = 0;
}

// ------------------------------------------------------------ macros
// Cada paso de una macro en curso: pendiente -> abajo -> libre, con tiempos en microsegundos.
typedef struct {
    int state;                 // 0 libre, 1 pendiente, 2 pulsado
    long long t_down, t_up;    // us (CLOCK_MONOTONIC)
    double x, y;
    int slot;
} mstep_t;
static mstep_t mq[MAX_QUEUE];

static long long now_us(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000000 + ts.tv_nsec / 1000;
}

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
static long long macro_process(void) {
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
static int gfd = -1;
static char gname[128];
static int grabbed = 0;
static unsigned char keyp[NCODES];          // botones fisicos pulsados
static unsigned char virt[NCODES];          // botones derivados de ejes (cruceta, gatillos)
static runtime_t rt[NCODES];
static runtime_t axrt[ABS_CNT][2];
static unsigned char axdown[ABS_CNT][2];
static struct input_absinfo ai[ABS_CNT];
static int has_abs[ABS_CNT];
static int axraw[ABS_CNT], axrest[ABS_CNT];
static int def_rs_x = ABS_RX, def_rs_y = ABS_RY, trig_l = ABS_Z, trig_r = ABS_RZ;
static int learning = 0;
static double learn_prev[ABS_CNT];
static unsigned char prevp[NCODES], consumed[NCODES];  // combos SELECT+L1/R1
static int switch_req = 0;                             // -1 / +1: cambiar de perfil

static inline int pressed(int c) { return keyp[c] || virt[c]; }

// Posicion respecto al centro del recorrido (-1..1): para sticks.
static double axis_center(int code) {
    if (code < 0 || code >= ABS_CNT || !has_abs[code]) return 0;
    double mn = ai[code].minimum, mx = ai[code].maximum;
    if (mx <= mn) return 0;
    double r = (axraw[code] - (mn + mx) / 2.0) / ((mx - mn) / 2.0);
    return r < -1 ? -1 : r > 1 ? 1 : r;
}

// Desviacion respecto al reposo (-1..1): para gatillos y ejes usados como botones.
static double axis_dev(int code) {
    if (code < 0 || code >= ABS_CNT || !has_abs[code]) return 0;
    double mn = ai[code].minimum, mx = ai[code].maximum;
    if (mx <= mn) return 0;
    double r = (axraw[code] - axrest[code]) / ((mx - mn) / 2.0);
    return r < -1 ? -1 : r > 1 ? 1 : r;
}

// Interruptores apoyados (accion -> dedo) y deslizamientos en curso.
static struct { const binding_t *b; int slot; } toggles[MAX_TOGGLES];
static struct { int slot; long long t0; double x1, y1, x2, y2, dur; } swipes[MAX_SWIPES];
static int nswipes = 0;

static void release_all(void) {
    // No usa 'cur': se llama tambien cuando el perfil ya se libero.
    if (ufd < 0) return;
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

#define TB(arr, b) ((arr[(b) / (8 * sizeof(long))] >> ((b) % (8 * sizeof(long)))) & 1)

static int is_gamepad(int fd) {
    unsigned long keys[NCODES / (8 * sizeof(long)) + 1];
    unsigned long abs_bits[ABS_CNT / (8 * sizeof(long)) + 1];
    memset(keys, 0, sizeof keys);
    memset(abs_bits, 0, sizeof abs_bits);
    if (ioctl(fd, EVIOCGBIT(EV_KEY, sizeof keys), keys) < 0) return 0;
    ioctl(fd, EVIOCGBIT(EV_ABS, sizeof abs_bits), abs_bits);
    if (TB(keys, BTN_TOUCH)) return 0;   // pantallas tactiles y digitalizadores
    int buttons = 0;
    for (int c = BTN_JOYSTICK; c <= BTN_THUMBR; c++) buttons += TB(keys, c);
    for (int c = BTN_TRIGGER_HAPPY; c < BTN_TRIGGER_HAPPY + 40; c++) buttons += TB(keys, c);
    return buttons >= 4 && TB(abs_bits, ABS_X) && TB(abs_bits, ABS_Y);
}

static void setup_gamepad_axes(void) {
    unsigned long abs_bits[ABS_CNT / (8 * sizeof(long)) + 1];
    memset(abs_bits, 0, sizeof abs_bits);
    ioctl(gfd, EVIOCGBIT(EV_ABS, sizeof abs_bits), abs_bits);
    memset(has_abs, 0, sizeof has_abs);
    for (int a = 0; a < ABS_CNT; a++) {
        if (TB(abs_bits, a) && ioctl(gfd, EVIOCGABS(a), &ai[a]) == 0) {
            has_abs[a] = 1;
            axraw[a] = axrest[a] = ai[a].value;
            // Sticks: el reposo es el centro aunque el valor inicial este algo desviado.
            int mid = (ai[a].minimum + ai[a].maximum) / 2, span = ai[a].maximum - ai[a].minimum;
            if (abs(ai[a].value - mid) < span / 8) axrest[a] = mid;
        }
    }
    // Convencion de Android: si hay RX/RY son el stick derecho y Z/RZ los gatillos;
    // si no, Z/RZ son el stick derecho y BRAKE/GAS los gatillos.
    if (has_abs[ABS_RX] && has_abs[ABS_RY]) { def_rs_x = ABS_RX; def_rs_y = ABS_RY; trig_l = ABS_Z; trig_r = ABS_RZ; }
    else { def_rs_x = ABS_Z; def_rs_y = ABS_RZ; trig_l = ABS_BRAKE; trig_r = ABS_GAS; }
    char axes[320] = "";
    for (int a = 0; a < ABS_CNT; a++)
        if (has_abs[a])
            snprintf(axes + strlen(axes), sizeof axes - strlen(axes), " %X(%d..%d)", a, ai[a].minimum, ai[a].maximum);
    logf_("ejes:%s | stick derecho=%X/%X, gatillos=%X/%X", axes, def_rs_x, def_rs_y, trig_l, trig_r);
}

static char pad_filter[64] = "";   // -g: usar solo el mando cuyo nombre contenga esto

static void scan_gamepad(void) {
    DIR *d = opendir("/dev/input");
    if (!d) return;
    struct dirent *e;
    while ((e = readdir(d))) {
        if (strncmp(e->d_name, "event", 5)) continue;
        char p[64];
        snprintf(p, sizeof p, "/dev/input/%s", e->d_name);
        int fd = open(p, O_RDONLY | O_NONBLOCK);
        if (fd < 0) continue;
        char nm[128] = {0};
        ioctl(fd, EVIOCGNAME(sizeof nm - 1), nm);
        if (strcmp(nm, VDEV_NAME) && is_gamepad(fd) && (!pad_filter[0] || strstr(nm, pad_filter))) {
            gfd = fd;
            snprintf(gname, sizeof gname, "%s", nm);
            grabbed = 0;
            memset(keyp, 0, sizeof keyp);
            memset(virt, 0, sizeof virt);
            memset(axdown, 0, sizeof axdown);
            memset(learn_prev, 0, sizeof learn_prev);
            setup_gamepad_axes();
            logf_("mando conectado: \"%s\" (%s)", gname, p);
            break;
        }
        close(fd);
    }
    closedir(d);
}

static void set_grab(int want) {
    if (gfd < 0 || want == grabbed) return;
    if (ioctl(gfd, EVIOCGRAB, (void *)(long)want) == 0) {
        grabbed = want;
        logf_(want ? "mando capturado (modo mapeo)" : "mando liberado (modo gamepad normal)");
    } else logf_("EVIOCGRAB %d: %s", want, strerror(errno));
}

// ------------------------------------------------------------ modo aprender
static void learn_report(const char *token) {
    char tmp[320];
    snprintf(tmp, sizeof tmp, "%s.tmp", learn_result);
    FILE *f = fopen(tmp, "w");
    if (!f) { logf_("no se puede escribir %s: %s", tmp, strerror(errno)); return; }
    fprintf(f, "%s\n", token);
    fclose(f);
    rename(tmp, learn_result);
    logf_("aprender: %s", token);
}

static void learn_event(const struct input_event *ev) {
    char nb[16], tok[32];
    if (ev->type == EV_KEY && ev->code < NCODES && ev->value == 1) {
        learn_report(code_name(ev->code, nb, sizeof nb));
    } else if (ev->type == EV_ABS && ev->code < ABS_CNT) {
        int c = ev->code;
        if (c == ABS_HAT0X || c == ABS_HAT0Y) {
            if (ev->value)
                learn_report(c == ABS_HAT0X ? (ev->value < 0 ? "DPAD_LEFT" : "DPAD_RIGHT")
                                            : (ev->value < 0 ? "DPAD_UP" : "DPAD_DOWN"));
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

static void press_action(const binding_t *b, runtime_t *r) {
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
    r->cx += vx * b->r * dt_ticks;
    r->cy += vy * b->r * ys * dt_ticks;
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

static void handle_event(const struct input_event *ev) {
    char nb[16];
    if (ev->type == EV_ABS && ev->code < ABS_CNT) {
        axraw[ev->code] = ev->value;
        if (ev->code == ABS_HAT0X) { virt[BTN_DPAD_LEFT] = ev->value < 0; virt[BTN_DPAD_RIGHT] = ev->value > 0; }
        else if (ev->code == ABS_HAT0Y) { virt[BTN_DPAD_UP] = ev->value < 0; virt[BTN_DPAD_DOWN] = ev->value > 0; }
    } else if (ev->type == EV_KEY && ev->code < NCODES) {
        keyp[ev->code] = ev->value ? 1 : 0;
        if (debug_on() && ev->value != 2) logf_("boton %s %s", code_name(ev->code, nb, sizeof nb), ev->value ? "pulsado" : "soltado");
    }

    if (learning) { learn_event(ev); return; }

    if (ev->type == EV_SYN && ev->code == SYN_REPORT) {
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

// ------------------------------------------------- mando en modo tactil (-t)
// Algunos mandos (GamepadPlus V3 en Home+A) se presentan como "pantalla tactil" sin
// INPUT_PROP_DIRECT: Android los trata como raton/lapiz (sale una flecha). Sin root no se
// puede instalar un IDC, asi que se captura el dispositivo y se reenvian sus toques a la
// pantalla virtual. Sus coordenadas ya vienen en la orientacion visible.
static int touch_fwd = 0;
static int tfd = -1;
static char tname[128];
static struct input_absinfo tai_x, tai_y;
static int tx, ty, tdown, tdown_prev, tslot = -1;

static int is_touch_accessory(int fd) {
    unsigned long keys[KEY_CNT / (8 * sizeof(long)) + 1];
    unsigned long abs_bits[ABS_CNT / (8 * sizeof(long)) + 1];
    unsigned long props[INPUT_PROP_CNT / (8 * sizeof(long)) + 1];
    memset(keys, 0, sizeof keys);
    memset(abs_bits, 0, sizeof abs_bits);
    memset(props, 0, sizeof props);
    if (ioctl(fd, EVIOCGBIT(EV_KEY, sizeof keys), keys) < 0) return 0;
    ioctl(fd, EVIOCGBIT(EV_ABS, sizeof abs_bits), abs_bits);
    ioctl(fd, EVIOCGPROP(sizeof props), props);
    struct input_id id;
    if (ioctl(fd, EVIOCGID, &id) < 0) return 0;
    if (id.bustype != BUS_BLUETOOTH && id.bustype != BUS_USB) return 0;  // nunca la pantalla del movil
    if (TB(props, INPUT_PROP_DIRECT) || TB(props, INPUT_PROP_POINTER)) return 0;  // ya es tactil / touchpad
    if (TB(keys, BTN_TOOL_FINGER) && !TB(keys, BTN_TOOL_PEN)) return 0;          // touchpad de portatil
    return TB(keys, BTN_TOUCH) && TB(abs_bits, ABS_X) && TB(abs_bits, ABS_Y);
}

static void scan_touch(void) {
    DIR *d = opendir("/dev/input");
    if (!d) return;
    struct dirent *e;
    while ((e = readdir(d))) {
        if (strncmp(e->d_name, "event", 5)) continue;
        char p[64];
        snprintf(p, sizeof p, "/dev/input/%s", e->d_name);
        int fd = open(p, O_RDONLY | O_NONBLOCK);
        if (fd < 0) continue;
        char nm[128] = {0};
        ioctl(fd, EVIOCGNAME(sizeof nm - 1), nm);
        if (fd != gfd && strcmp(nm, VDEV_NAME) && is_touch_accessory(fd) &&
            ioctl(fd, EVIOCGABS(ABS_X), &tai_x) == 0 && ioctl(fd, EVIOCGABS(ABS_Y), &tai_y) == 0 &&
            tai_x.maximum > tai_x.minimum && tai_y.maximum > tai_y.minimum) {
            if (ioctl(fd, EVIOCGRAB, (void *)1L) < 0) logf_("EVIOCGRAB tactil: %s", strerror(errno));
            tfd = fd;
            snprintf(tname, sizeof tname, "%s", nm);
            tx = tai_x.value;
            ty = tai_y.value;
            tdown = tdown_prev = 0;
            tslot = -1;
            logf_("mando en modo tactil: \"%s\" (%s) %d..%d x %d..%d -> se reenvia como toques", tname, p,
                  tai_x.minimum, tai_x.maximum, tai_y.minimum, tai_y.maximum);
            break;
        }
        close(fd);
    }
    closedir(d);
}

static void touch_event(const struct input_event *ev) {
    if (ev->type == EV_ABS && ev->code == ABS_X) tx = ev->value;
    else if (ev->type == EV_ABS && ev->code == ABS_Y) ty = ev->value;
    else if (ev->type == EV_KEY && ev->code == BTN_TOUCH) tdown = ev->value != 0;
    else if (ev->type == EV_SYN && ev->code == SYN_REPORT) {
        double u = (double)(tx - tai_x.minimum) / (tai_x.maximum - tai_x.minimum);
        double v = (double)(ty - tai_y.minimum) / (tai_y.maximum - tai_y.minimum);
        if (tslot >= 0 && !slot_used[tslot]) tslot = -1;  // lo solto release_all()
        if (tdown) {
            if (tslot < 0) tslot = t_down_n(u, v);
            else t_move_n(tslot, u, v);
        } else if (tslot >= 0) {
            t_up(tslot);
            tslot = -1;
        }
        tdown_prev = tdown;
        t_sync();
    }
}

static void touch_lost(void) {
    logf_("mando tactil desconectado: \"%s\"", tname);
    if (tslot >= 0) { t_up(tslot); t_sync(); }
    tslot = -1;
    close(tfd);
    tfd = -1;
}

// ------------------------------------------------------------ estado
// <base>/status.txt: la app lo lee para saber si el servicio esta en marcha (se reescribe cada 2 s).
static char status_file[300];

static void write_status(int enabled) {
    char tmp[320];
    snprintf(tmp, sizeof tmp, "%s.tmp", status_file);
    FILE *f = fopen(tmp, "w");
    if (!f) return;
    fprintf(f, "time=%lld\nuid=%d\nversion=gpmapper 1.5\nbuild=%d\ngamepad=%s\ntouch=%s\nprofile=%s\npackage=%s\nenabled=%d\nrotate=%d\nrotation=%d\n",
            (long long)time(NULL), (int)getuid(), GPM_BUILD, gfd >= 0 ? gname : "", tfd >= 0 ? tname : "",
            cur ? profile_label(cur) : "", cur ? cur->pkg : "", enabled, rot_mode, cur_rot);
    fclose(f);
    rename(tmp, status_file);
}

// ------------------------------------------------------------ comprobar un perfil (-c)
// Imprime como se entiende cada linea, en formato canonico: "TECLA tipo X Y [R] [dpad]".
// Lo usan las pruebas (tests/) para comprobar que la app y gpmapper leen igual un perfil.
static void dump_binding(const char *key, const binding_t *b) {
    static const char *names[] = {"none", "tap", "stick", "look", "macro", "turbo", "toggle", "swipe"};
    if (b->type == B_NONE) return;
    printf("%s %s %.0f %.0f", key, names[b->type], b->x, b->y);
    if (b->type == B_STICK || b->type == B_LOOK) printf(" %.0f", b->r);
    if (b->type == B_STICK && b->dpad) printf(" dpad");
    if (b->type == B_MACRO) printf(" %d", b->nsteps);
    printf("\n");
}

static int check_profile(const char *path) {
    profile_t p;
    verbose = 1;
    if (load_profile(path, &p) != 0) { fprintf(stderr, "no se pudo leer %s\n", path); return 1; }
    printf("package %s\nscreen %.0fx%.0f\n", p.pkg, p.sw, p.sh);
    char nb[16], kb[64];
    for (int c = 0; c < NCODES; c++) dump_binding(code_name(c, nb, sizeof nb), &p.b[c]);
    for (int a = 0; a < ABS_CNT; a++)
        for (int d = 0; d < 2; d++) {
            snprintf(kb, sizeof kb, "AXIS_%X%c", a, d ? '+' : '-');
            dump_binding(kb, &p.ax[a][d]);
        }
    for (int i = 0; i < p.nlayers; i++) {
        const layer_t *L = &p.layers[i];
        char mb[16];
        const char *mod = code_name(L->mod, mb, sizeof mb);
        if (L->kind == 0) snprintf(kb, sizeof kb, "%s+%s", mod, code_name(L->code, nb, sizeof nb));
        else snprintf(kb, sizeof kb, "%s+AXIS_%X%c", mod, L->axis, L->dir ? '+' : '-');
        dump_binding(kb, &L->bd);
    }
    return 0;
}

// ------------------------------------------------------------ main
static volatile sig_atomic_t stop = 0;
static void on_signal(int s) { (void)s; stop = 1; }

int main(int argc, char **argv) {
    int c;
    double tap_u = -1, tap_v = -1;
    while ((c = getopt(argc, argv, "d:vRtp:T:g:c:F:")) != -1) {
        if (c == 'c') return check_profile(optarg);
        else if (c == 'F') {   // pruebas: -F sw,sh,w,h,x,y -> punto adaptado (como Profile.fitX/fitY)
            double a[6];
            if (sscanf(optarg, "%lf,%lf,%lf,%lf,%lf,%lf", &a[0], &a[1], &a[2], &a[3], &a[4], &a[5]) != 6) return 2;
            printf("%.2f %.2f %.4f\n", fit_x(a[4], a[0], a[1], a[2], a[3]), fit_y(a[5], a[0], a[1], a[2], a[3]),
                   fit_scale(a[0], a[1], a[2], a[3]));
            return 0;
        }
        else if (c == 'd') snprintf(prof_dir, sizeof prof_dir, "%s", optarg);
        else if (c == 'v') verbose = 1;
        else if (c == 'g') snprintf(pad_filter, sizeof pad_filter, "%s", optarg);
        else if (c == 'R') rot_mode = 1;
        else if (c == 't') touch_fwd = 1;
        else if (c == 'p') vdev_product = (int)strtol(optarg, NULL, 16);
        else if (c == 'T' && sscanf(optarg, "%lf,%lf", &tap_u, &tap_v) == 2) {}
        else {
            fprintf(stderr,
                    "uso: %s [-d dir_perfiles] [-v] [-R] [-t] [-p producto_hex] [-g nombre] [-T u,v] [-c perfil]\n"
                    "  -g  usar solo el mando cuyo nombre contenga este texto\n"
                    "  -R  girar los toques segun <base>/rotation (sin root, sin IDC)\n"
                    "  -t  reenviar mandos en modo tactil (raton/lapiz) como toques\n"
                    "  -p  id de producto de la pantalla virtual (7a01 usa el IDC del modulo)\n"
                    "  -T  prueba: toca el punto u,v (0..1 de la pantalla visible) y sale\n"
                    "  -c  comprobar un perfil: muestra como se entiende cada linea y sale\n",
                    argv[0]);
            return 2;
        }
    }
    snprintf(debug_flag, sizeof debug_flag, "%s/../debug", prof_dir);
    snprintf(learn_flag, sizeof learn_flag, "%s/../learn", prof_dir);
    snprintf(learn_result, sizeof learn_result, "%s/../learn_result", prof_dir);
    snprintf(paused_flag, sizeof paused_flag, "%s/../paused", prof_dir);
    snprintf(active_file, sizeof active_file, "%s/../active.txt", prof_dir);
    snprintf(rotation_file, sizeof rotation_file, "%s/../rotation", prof_dir);
    snprintf(display_file, sizeof display_file, "%s/../display", prof_dir);
    snprintf(status_file, sizeof status_file, "%s/../status.txt", prof_dir);

    if (tap_u >= 0) {  // modo prueba
        read_rotation();
        if (create_vdev() < 0) return 1;
        usleep(1500000);  // dar tiempo a Android a registrar el dispositivo
        int rx, ry;
        map_point(tap_u, tap_v, &rx, &ry);
        printf("toque de prueba en %.3f,%.3f (rotacion %d) -> crudo %d,%d\n", tap_u, tap_v, cur_rot, rx, ry);
        int s = t_down_n(tap_u, tap_v);
        t_sync();
        usleep(2500000);  // toque largo: da tiempo a ver 'dumpsys input' (Last Cooked Touch)
        t_up(s);
        t_sync();
        usleep(300000);
        ioctl(ufd, UI_DEV_DESTROY);
        close(ufd);
        return 0;
    }
    signal(SIGCHLD, SIG_IGN);  // recoger solos los procesos de notify()
    signal(SIGHUP, SIG_IGN);
    signal(SIGPIPE, SIG_IGN);
    signal(SIGTERM, on_signal);
    signal(SIGINT, on_signal);

    logf_("gpmapper 1.4 iniciado (uid %d), perfiles en %s%s%s", (int)getuid(), prof_dir,
          rot_mode ? ", girando segun la rotacion" : "", touch_fwd ? ", reenvio de modo tactil" : "");
    unlink(learn_flag);  // no arrancar en modo aprender por un archivo viejo
    read_rotation();
    read_display();
    if (create_vdev() < 0) return 1;

    int enabled = 1, active = -1, paused_seen = 0;
    long long last_poll = 0, last_scan = 0, last_learn = 0, last_tick = now_ms(), combo_since = 0;
    long long last_rot = 0, last_status = 0, last_tscan = 0;
    long long macro_due = -1;
    int combo_fired = 0;

    while (!stop) {
        long long n = now_ms();

        if (n - last_learn >= 200) {
            last_learn = n;
            // La app crea el archivo al empezar a escuchar; si quedo huerfano (>30 s), se ignora.
            struct stat lst;
            int l = stat(learn_flag, &lst) == 0;
            if (l && time(NULL) - lst.st_mtime > 30) { unlink(learn_flag); l = 0; }
            if (l != learning) {
                learning = l;
                release_all();
                memset(learn_prev, 0, sizeof learn_prev);
                for (int a = 0; a < ABS_CNT; a++) learn_prev[a] = fabs(axis_dev(a));  // ejes ya movidos no cuentan
                logf_(learning ? "modo aprender ACTIVADO" : "modo aprender desactivado");
                set_grab(enabled && (cur != NULL || learning));
            }
        }

        if (n - last_poll >= 1000) {
            last_poll = n;
            if (reload_profiles_if_changed()) { release_all(); cur = NULL; active = -1; }
            int fg = foreground_profile();
            // Pausa desde Ajustes rapidos: solo cuenta el cambio (aparece -> pausa, desaparece -> sigue),
            // asi SELECT+START sigue funcionando aunque el archivo exista.
            int pz = access(paused_flag, F_OK) == 0;
            if (pz != paused_seen) {
                paused_seen = pz;
                if (enabled == pz) {
                    enabled = !pz;
                    release_all();
                    logf_(enabled ? "mapeo REANUDADO (ajustes rapidos)" : "mapeo PAUSADO (ajustes rapidos)");
                }
            }
            if (fg != active) {
                release_all();
                active = fg;
                cur = fg >= 0 ? &profiles[fg] : NULL;
                if (cur) logf_("juego detectado: %s -> perfil %s (%s)", cur->pkg, base_name(cur->file), profile_label(cur));
                else logf_("sin perfil para la app actual");
            }
            set_grab(enabled && (cur != NULL || learning));
        }

        if (gfd < 0 && n - last_scan >= 2000) {
            last_scan = n;
            scan_gamepad();
            set_grab(enabled && (cur != NULL || learning));
        }

        if (touch_fwd && tfd < 0 && n - last_tscan >= 2000) {
            last_tscan = n;
            scan_touch();
        }

        if (n - last_status >= 2000) read_display();   // la pantalla casi nunca cambia

        if (rot_mode && n - last_rot >= 300) {
            last_rot = n;
            int old = cur_rot;
            read_rotation();
            if (old != cur_rot) {
                release_all();  // los toques en curso quedarian en el sitio equivocado
                tslot = -1;
                logf_("rotacion %d -> %d", old, cur_rot);
            }
        }

        if (n - last_status >= 2000) {
            last_status = n;
            write_status(enabled);
        }

        int timeout = gfd < 0 ? 500 : (grabbed && !learning && needs_ticks() ? (nswipes ? 8 : 10) : 150);
        long long tmo_us = (long long)timeout * 1000;
        if (macro_due >= 0) {  // despertar justo cuando toque el siguiente paso de una macro
            long long d = macro_due - now_us();
            if (d < tmo_us) tmo_us = d < 0 ? 0 : d;
        }
        struct timespec ts = {.tv_sec = tmo_us / 1000000, .tv_nsec = (tmo_us % 1000000) * 1000};
        struct pollfd pfd[2];
        int np = 0, gi = -1, ti = -1;
        if (gfd >= 0) { gi = np; pfd[np].fd = gfd; pfd[np].events = POLLIN; pfd[np].revents = 0; np++; }
        if (tfd >= 0) { ti = np; pfd[np].fd = tfd; pfd[np].events = POLLIN; pfd[np].revents = 0; np++; }
        int pr = np ? ppoll(pfd, np, &ts, NULL) : (nanosleep(&ts, NULL), 0);

        if (pr > 0 && ti >= 0 && pfd[ti].revents) {
            int lost_t = (pfd[ti].revents & (POLLERR | POLLHUP | POLLNVAL)) != 0;
            if (!lost_t) {
                struct input_event evs[64];
                ssize_t r = read(tfd, evs, sizeof evs);
                if (r < 0 && errno != EAGAIN && errno != EINTR) lost_t = 1;
                for (ssize_t i = 0; i + (ssize_t)sizeof evs[0] <= r; i += sizeof evs[0])
                    touch_event((struct input_event *)((char *)evs + i));
            }
            if (lost_t) touch_lost();
        }

        if (pr > 0 && gi >= 0 && pfd[gi].revents) {
            if (pfd[gi].revents & (POLLERR | POLLHUP | POLLNVAL)) goto lost;
            struct input_event evs[64];
            ssize_t r = read(gfd, evs, sizeof evs);
            if (r < 0 && errno != EAGAIN && errno != EINTR) goto lost;
            for (ssize_t i = 0; i + (ssize_t)sizeof evs[0] <= r; i += sizeof evs[0])
                handle_event((struct input_event *)((char *)evs + i));
        }

        // SELECT + START mantenidos 1 s: pausar / reanudar el mapeo
        if (gfd >= 0 && !learning && pressed(BTN_SELECT) && pressed(BTN_START)) {
            if (!combo_since) combo_since = now_ms();
            else if (!combo_fired && now_ms() - combo_since >= 1000) {
                combo_fired = 1;
                enabled = !enabled;
                if (enabled && paused_seen) { unlink(paused_flag); paused_seen = 0; }  // el boton tambien se reanuda
                release_all();
                set_grab(enabled && cur != NULL);
                logf_(enabled ? "mapeo REANUDADO (SELECT+START)" : "mapeo PAUSADO (SELECT+START)");
            }
        } else { combo_since = 0; combo_fired = 0; }

        if (switch_req && cur) {
            int dir = switch_req, idx[MAX_PROFILES], n = 0, pos = 0;
            switch_req = 0;
            for (int i = 0; i < nprofiles; i++) {
                if (strcmp(profiles[i].pkg, cur->pkg)) continue;
                if (&profiles[i] == cur) pos = n;
                idx[n++] = i;
            }
            char msg[160];
            if (n < 2) {
                snprintf(msg, sizeof msg, "Este juego solo tiene un perfil (%s)", profile_label(cur));
            } else {
                int nx = idx[(pos + dir + n) % n];
                release_all();
                save_active(profiles[nx].pkg, base_name(profiles[nx].file));
                load_active();
                prof_sig = dir_signature();  // ya aplicado: no recargar todo
                active = nx;
                cur = &profiles[nx];
                snprintf(msg, sizeof msg, "Perfil: %s (%d/%d)", profile_label(cur), (pos + dir + n) % n + 1, n);
            }
            logf_("%s", msg);
            notify(msg);
        }

        macro_due = (grabbed && cur && !learning) ? macro_process() : -1;

        long long t = now_ms();
        if (grabbed && cur && !learning && needs_ticks()) {
            double dt = (t - last_tick) / 16.0;  // fotogramas de ~60 Hz
            if (dt > 4) dt = 4;
            look_tick(CODE_LS, dt);
            look_tick(CODE_RS, dt);
            timed_actions();   // turbo y deslizar
            t_sync();
        }
        last_tick = t;
        continue;

    lost:
        logf_("mando desconectado: \"%s\"", gname);
        release_all();
        close(gfd);
        gfd = -1;
        grabbed = 0;
    }

    release_all();
    if (gfd >= 0) close(gfd);
    if (tfd >= 0) close(tfd);
    if (ufd >= 0) { ioctl(ufd, UI_DEV_DESTROY); close(ufd); }
    unlink(learn_flag);
    unlink(status_file);
    logf_("gpmapper detenido");
    return 0;
}
