// gpmapper - mapeador de mando a toques de pantalla con perfiles por juego.
//
// Lee un gamepad (cualquier mando HID; p. ej. el GamepadPlus V3 en modo Home+X) y,
// cuando la app en primer plano tiene un perfil, captura el mando en exclusiva y
// convierte botones, ejes y sticks en toques sobre una pantalla tactil virtual (uinput).
// Si la app no tiene perfil, suelta el mando para que funcione como gamepad normal.
//
// Este archivo es la plataforma Android (Linux evdev) del motor: la logica mando -> toques,
// los perfiles y el adaptar a otra pantalla estan en core/ (compartidos con la version de
// escritorio); el mando y la pantalla virtual, en linux/gpm_evdev.c.
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
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

#include "core/gpm_core.h"
#include "core/gpm_repeticion.h"
#include "linux/gpm_evdev.h"

#define RAW_MAX 32767
#define MAX_PROFILES 64
#define VDEV_NAME "Gamepad Mapper Touch"
#define VDEV_VENDOR 0x1949
#define VDEV_PRODUCT 0x7a01

// Numero de compilacion del motor: la app lo compara con el del modulo que lleva dentro para
// avisar si el instalado esta desactualizado. Subirlo con cada cambio del formato de perfil.
// 2 = toque rapido, rafaga, joystick + cruceta (v1.1).
// 3 = carpeta de la app (Android/data/com.gamepadmapper.app/files) (v1.2).
#define GPM_BUILD 6

#define logf_ gpm_log
#define trim gpm_recortar
#define base_name gpm_nombre_base
#define profile_label gpm_etiqueta
#define now_ms gpm_ahora_ms

// ---------------------------------------------------------------- utilidades
static int verbose = 0;
// Carpeta de perfiles por defecto: la de la app 1.2+ (o la antigua si la app es 1.0/1.1).
// service.sh la pasa siempre con -d.
#define APP_PROFILES "/sdcard/Android/data/com.gamepadmapper.app/files/profiles"
static char prof_dir[256] = APP_PROFILES;
static char debug_flag[300], learn_flag[300], learn_result[300], active_file[300];
/* <base>/paused: lo crea/borra el boton de Ajustes rapidos de la app (pausar el mando). */
static char paused_flag[300];

static long long now_us(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000000 + ts.tv_nsec / 1000;
}

// Registro: una linea con la hora (UTC) en stdout (service.sh la guarda en mapper.log).
static void log_line(const char *msg) {
    time_t t = time(NULL);
    struct tm tm;
    gmtime_r(&t, &tm);
    printf("%04d-%02d-%02d %02d:%02d:%02dZ %s\n", tm.tm_year + 1900, tm.tm_mon + 1, tm.tm_mday, tm.tm_hour, tm.tm_min,
           tm.tm_sec, msg);
    fflush(stdout);
}

static int debug_check(void) { return verbose || access(debug_flag, F_OK) == 0; }

// --------------------------------------------------------------- perfiles
static profile_t profiles[MAX_PROFILES];
static int nprofiles = 0;
static unsigned long long prof_sig = 0;
static const profile_t *cur = NULL;   // perfil activo (el mismo que usa el nucleo)

static void set_cur(const profile_t *p) {
    cur = p;
    gpm_usar_perfil(p);
}

static void free_profiles(void) {
    for (int i = 0; i < nprofiles; i++) gpm_liberar_perfil(&profiles[i]);
    nprofiles = 0;
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
        if (gpm_cargar_perfil(path, &profiles[nprofiles]) == 0) {
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
static int tracking_id = 0;
static int touch_state = 0;

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

static int create_vdev(void) {
    ufd = gpm_uinput_crear(VDEV_NAME, VDEV_VENDOR, vdev_product, RAW_MAX, RAW_MAX);
    return ufd < 0 ? -1 : 0;
}

// Salida del nucleo: toques en la pantalla visible (u,v en 0..1) -> pantalla virtual.
static void out_down(int s, double u, double v) {
    if (++tracking_id > 65535) tracking_id = 1;
    int rx, ry;
    map_point(u, v, &rx, &ry);
    gpm_uinput_abajo(ufd, s, tracking_id, rx, ry);
}

static void out_move(int s, double u, double v) {
    int rx, ry;
    map_point(u, v, &rx, &ry);
    gpm_uinput_mover(ufd, s, rx, ry);
}

static void out_up(int s) { gpm_uinput_arriba(ufd, s); }

static void out_sync(int any) { gpm_uinput_sync(ufd, &touch_state, any); }

// ------------------------------------------------------------ otras pantallas
// Pantalla real (la escribe la app en <base>/display): el nucleo adapta el perfil a ella.
static char display_file[300];

static void read_display(void) {
    FILE *f = fopen(display_file, "r");
    if (!f) return;
    double w = 0, h = 0;
    if (fscanf(f, "%lfx%lf", &w, &h) == 2 && w >= 100 && h >= 100 && w <= 20000 && h <= 20000) gpm_pantalla(w, h);
    fclose(f);
}

// ------------------------------------------------------------ estado mando
static int gfd = -1;
static int ff_id = -1;          // vibracion: efecto subido (-1 = aun no, -2 = el mando no vibra)
static double ff_level = -1;
static char gname[128];
static int grabbed = 0;
static int learning = 0;

static void out_rumble(double level) { gpm_evdev_vibrar(gfd, &ff_id, &ff_level, level); }

static char pad_filter[64] = "";   // -g: usar solo el mando cuyo nombre contenga esto

// Al conectar un mando: en cada juego se activa el perfil cuyo 'controller' aparece en su nombre.
static void activate_for_controller(void) {
    int changed = 0;
    for (int i = 0; i < nprofiles; i++) {
        if (!profiles[i].controller[0] || profiles[i].is_active || !gpm_contiene(gname, profiles[i].controller)) continue;
        save_active(profiles[i].pkg, base_name(profiles[i].file));
        load_active();
        changed = 1;
        logf_("mando \"%s\": perfil %s para %s", gname, profile_label(&profiles[i]), profiles[i].pkg);
    }
    if (changed) prof_sig = dir_signature();
}

static void scan_gamepad(void) {
    char p[64];
    int fd = gpm_evdev_buscar_mando(pad_filter, VDEV_NAME, gname, sizeof gname, p, sizeof p);
    if (fd < 0) return;
    gfd = fd;
    grabbed = 0;
    gpm_eje_t ejes[ABS_CNT];
    gpm_evdev_ejes(gfd, ejes);
    gpm_mando_nuevo(ejes);
    ff_id = -1;
    logf_("mando conectado: \"%s\" (%s)", gname, p);
    activate_for_controller();
}

static void set_grab(int want) {
    if (gfd < 0 || want == grabbed) return;
    if (gpm_evdev_capturar(gfd, want) == 0) {
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

// ------------------------------------------------- mando en modo tactil (-t)
// Algunos mandos (GamepadPlus V3 en Home+A) se presentan como "pantalla tactil" sin
// INPUT_PROP_DIRECT: Android los trata como raton/lapiz (sale una flecha). Sin root no se
// puede instalar un IDC, asi que se captura el dispositivo y se reenvian sus toques a la
// pantalla virtual. Sus coordenadas ya vienen en la orientacion visible.
#define TB(arr, b) ((arr[(b) / (8 * sizeof(long))] >> ((b) % (8 * sizeof(long)))) & 1)
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
        if (tslot >= 0 && !gpm_slot_usado(tslot)) tslot = -1;  // lo solto gpm_soltar_todo()
        if (tdown) {
            if (tslot < 0) tslot = gpm_toque_abajo_n(u, v);
            else gpm_toque_mover_n(tslot, u, v);
        } else if (tslot >= 0) {
            gpm_toque_arriba(tslot);
            tslot = -1;
        }
        tdown_prev = tdown;
        gpm_sync();
    }
}

static void touch_lost(void) {
    logf_("mando tactil desconectado: \"%s\"", tname);
    if (tslot >= 0) { gpm_toque_arriba(tslot); gpm_sync(); }
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
    fprintf(f, "time=%lld\nuid=%d\nversion=gpmapper 1.6\nbuild=%d\ngamepad=%s\ntouch=%s\nprofile=%s\npackage=%s\nenabled=%d\nrotate=%d\nrotation=%d\n",
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
    if (gpm_cargar_perfil(path, &p) != 0) { fprintf(stderr, "no se pudo leer %s\n", path); return 1; }
    printf("package %s\nscreen %.0fx%.0f\n", p.pkg, p.sw, p.sh);
    char ab[16];
    printf("~ajustes aim=%s %.2f accel=%.2f rumble=%.2f controller=%s\n",
           p.aim_mod >= 0 ? gpm_nombre_codigo(p.aim_mod, ab, sizeof ab) : "-", p.aim_scale, p.look_accel, p.rumble,
           p.controller[0] ? p.controller : "-");
    char nb[16], kb[64];
    for (int c = 0; c < GPM_NCODES; c++) dump_binding(gpm_nombre_codigo(c, nb, sizeof nb), &p.b[c]);
    for (int a = 0; a < ABS_CNT; a++)
        for (int d = 0; d < 2; d++) {
            snprintf(kb, sizeof kb, "AXIS_%X%c", a, d ? '+' : '-');
            dump_binding(kb, &p.ax[a][d]);
        }
    for (int i = 0; i < p.nlayers; i++) {
        const layer_t *L = &p.layers[i];
        char mb[16];
        const char *mod = gpm_nombre_codigo(L->mod, mb, sizeof mb);
        if (L->kind == 0) snprintf(kb, sizeof kb, "%s+%s", mod, gpm_nombre_codigo(L->code, nb, sizeof nb));
        else snprintf(kb, sizeof kb, "%s+AXIS_%X%c", mod, L->axis, L->dir ? '+' : '-');
        dump_binding(kb, &L->bd);
    }
    return 0;
}

// ------------------------------------------------------------ main
static volatile sig_atomic_t stop = 0;
static void on_signal(int s) { (void)s; stop = 1; }

static const gpm_plataforma_t android_plat = {
    .reloj_us = now_us,
    .log = log_line,
    .depurar = debug_check,
    .abajo = out_down,
    .mover = out_move,
    .arriba = out_up,
    .sync = out_sync,
    .vibrar = out_rumble,
    .aprendido = learn_report,
};

int main(int argc, char **argv) {
    int c;
    double tap_u = -1, tap_v = -1;
    gpm_plataforma(&android_plat);
    while ((c = getopt(argc, argv, "d:vRtp:T:g:c:F:r:")) != -1) {
        if (c == 'c') return check_profile(optarg);
        else if (c == 'r') {   // pruebas: -r perfil.conf eventos.txt
            if (optind >= argc) return 2;
            return gpm_repetir(optarg, argv[optind], NULL);
        }
        else if (c == 'F') {   // pruebas: -F sw,sh,w,h,x,y -> punto adaptado (como Profile.fitX/fitY)
            double a[6];
            if (sscanf(optarg, "%lf,%lf,%lf,%lf,%lf,%lf", &a[0], &a[1], &a[2], &a[3], &a[4], &a[5]) != 6) return 2;
            printf("%.2f %.2f %.4f\n", gpm_fit_x(a[4], a[0], a[1], a[2], a[3]), gpm_fit_y(a[5], a[0], a[1], a[2], a[3]),
                   gpm_fit_scale(a[0], a[1], a[2], a[3]));
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
                    "  -c  comprobar un perfil: muestra como se entiende cada linea y sale\n"
                    "  -r  prueba: -r perfil.conf eventos.txt repite un guion de eventos y escribe los toques\n",
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
        int s = gpm_toque_abajo_n(tap_u, tap_v);
        gpm_sync();
        usleep(2500000);  // toque largo: da tiempo a ver 'dumpsys input' (Last Cooked Touch)
        gpm_toque_arriba(s);
        gpm_sync();
        usleep(300000);
        gpm_uinput_destruir(ufd);
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
    long long last_poll = 0, last_scan = 0, last_learn = 0;
    long long last_rot = 0, last_status = 0, last_tscan = 0;
    long long macro_due = -1;
    gpm_reiniciar_ticks();

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
                gpm_aprender(learning);   // suelta los toques; los ejes ya movidos no cuentan
                logf_(learning ? "modo aprender ACTIVADO" : "modo aprender desactivado");
                set_grab(enabled && (cur != NULL || learning));
            }
        }

        if (n - last_poll >= 1000) {
            last_poll = n;
            if (reload_profiles_if_changed()) { gpm_soltar_todo(); set_cur(NULL); active = -1; }
            int fg = foreground_profile();
            // Pausa desde Ajustes rapidos: solo cuenta el cambio (aparece -> pausa, desaparece -> sigue),
            // asi SELECT+START sigue funcionando aunque el archivo exista.
            int pz = access(paused_flag, F_OK) == 0;
            if (pz != paused_seen) {
                paused_seen = pz;
                if (enabled == pz) {
                    enabled = !pz;
                    gpm_soltar_todo();
                    logf_(enabled ? "mapeo REANUDADO (ajustes rapidos)" : "mapeo PAUSADO (ajustes rapidos)");
                }
            }
            if (fg != active) {
                gpm_soltar_todo();
                active = fg;
                set_cur(fg >= 0 ? &profiles[fg] : NULL);
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
                gpm_soltar_todo();  // los toques en curso quedarian en el sitio equivocado
                tslot = -1;
                logf_("rotacion %d -> %d", old, cur_rot);
            }
        }

        if (n - last_status >= 2000) {
            last_status = n;
            write_status(enabled);
        }

        int iv = gpm_intervalo_ms();   // camara, turbo o deslizar en curso: despertar a menudo
        int timeout = gfd < 0 ? 500 : (grabbed && !learning && iv ? iv : 150);
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
            for (ssize_t i = 0; i + (ssize_t)sizeof evs[0] <= r; i += sizeof evs[0]) {
                const struct input_event *ev = (const struct input_event *)((char *)evs + i);
                gpm_evento(ev->type, ev->code, ev->value, grabbed);
            }
        }

        // SELECT + START mantenidos 1 s: pausar / reanudar el mapeo
        if (gpm_combo_pausa(gfd >= 0 && !learning)) {
            enabled = !enabled;
            if (enabled && paused_seen) { unlink(paused_flag); paused_seen = 0; }  // el boton tambien se reanuda
            gpm_soltar_todo();
            set_grab(enabled && cur != NULL);
            logf_(enabled ? "mapeo REANUDADO (SELECT+START)" : "mapeo PAUSADO (SELECT+START)");
        }

        int dir;
        if (cur && (dir = gpm_cambio_pedido()) != 0) {   // SELECT + R1 / L1: otro perfil del juego
            int idx[MAX_PROFILES], n = 0, pos = 0;
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
                gpm_soltar_todo();
                save_active(profiles[nx].pkg, base_name(profiles[nx].file));
                load_active();
                prof_sig = dir_signature();  // ya aplicado: no recargar todo
                active = nx;
                set_cur(&profiles[nx]);
                snprintf(msg, sizeof msg, "Perfil: %s (%d/%d)", profile_label(cur), (pos + dir + n) % n + 1, n);
            }
            logf_("%s", msg);
            notify(msg);
        }

        int mapping = grabbed && cur && !learning;
        macro_due = mapping ? gpm_macros() : -1;
        gpm_ticks(mapping);   // camara, turbo y deslizar
        continue;

    lost:
        logf_("mando desconectado: \"%s\"", gname);
        gpm_soltar_todo();
        close(gfd);
        gfd = -1;
        grabbed = 0;
    }

    gpm_soltar_todo();
    if (gfd >= 0) close(gfd);
    if (tfd >= 0) close(tfd);
    gpm_uinput_destruir(ufd);
    unlink(learn_flag);
    unlink(status_file);
    logf_("gpmapper detenido");
    return 0;
}
