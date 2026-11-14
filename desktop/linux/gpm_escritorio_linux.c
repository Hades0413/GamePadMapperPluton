// gpm_escritorio_linux.c - gpm-escritorio para Linux.
//
// Mando: evdev (/dev/input/event*), capturado solo mientras se mapea (si no, el escritorio lo
// sigue usando). Salida: una pantalla tactil multitactil virtual (uinput) que cubre todo el
// escritorio; los toques caen dentro del rectangulo de la ventana del juego.
// Ventanas (X11 o XWayland): xwininfo/xprop (x11-utils) o xdotool, si estan instalados.
#define _GNU_SOURCE  // ppoll
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <poll.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include "../../mapper/src/linux/gpm_evdev.h"
#include "../comun/escritorio.h"

#define VDEV_NAME "Gamepad Mapper Escritorio"
#define VDEV_VENDOR 0x1949
#define VDEV_PRODUCT 0x7a03

long long escr_plat_reloj_us(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000000 + ts.tv_nsec / 1000;
}

// ------------------------------------------------------------ pantalla tactil virtual
static int ufd = -1, tracking_id = 0, touch_state = 0;

int escr_plat_iniciar_salida(int ancho, int alto) {
    ufd = gpm_uinput_crear(VDEV_NAME, VDEV_VENDOR, VDEV_PRODUCT, ancho - 1, alto - 1);
    if (ufd < 0) {
        fprintf(stderr, "No se pudo crear la pantalla tactil virtual. Hace falta permiso de escritura en /dev/uinput:\n"
                        "  ejecuta desktop/linux/instalar-permisos.sh y sigue sus instrucciones (o prueba con --probar).\n");
        return -1;
    }
    escr_log("pantalla tactil virtual \"%s\" (%dx%d)", VDEV_NAME, ancho, alto);
    return 0;
}

void escr_plat_abajo(int slot, int x, int y) {
    if (++tracking_id > 65535) tracking_id = 1;
    gpm_uinput_abajo(ufd, slot, tracking_id, x, y);
}

void escr_plat_mover(int slot, int x, int y) { gpm_uinput_mover(ufd, slot, x, y); }
void escr_plat_arriba(int slot) { gpm_uinput_arriba(ufd, slot); }
void escr_plat_sync(int tocando) { gpm_uinput_sync(ufd, &touch_state, tocando); }

// ------------------------------------------------------------ mando
static int gfd = -1, grabbed = 0, ff_id = -1;
static double ff_level = -1;
static char gname[128];

void escr_plat_vibrar(double nivel) { gpm_evdev_vibrar(gfd, &ff_id, &ff_level, nivel); }

int escr_plat_mando(const char *filtro) {
    if (gfd >= 0) return 1;
    char ruta[64];
    gfd = gpm_evdev_buscar_mando(filtro, VDEV_NAME, gname, sizeof gname, ruta, sizeof ruta);
    if (gfd < 0) return 0;
    gpm_eje_t ejes[ABS_CNT];
    gpm_evdev_ejes(gfd, ejes);
    gpm_mando_nuevo(ejes);
    grabbed = 0;
    ff_id = -1;
    escr_log("mando conectado: \"%s\" (%s)", gname, ruta);
    return 1;
}

void escr_plat_capturar(int on) {
    if (gfd < 0 || on == grabbed) return;
    if (gpm_evdev_capturar(gfd, on) == 0) grabbed = on;
    else escr_log("no se pudo %s el mando: %s", on ? "capturar" : "liberar", strerror(errno));
}

static void perder_mando(void) {
    close(gfd);
    gfd = -1;
    grabbed = 0;
}

int escr_plat_esperar(long long us, int mapear) {
    struct timespec ts = {.tv_sec = us / 1000000, .tv_nsec = (us % 1000000) * 1000};
    if (gfd < 0) { nanosleep(&ts, NULL); return 0; }
    struct pollfd p = {.fd = gfd, .events = POLLIN};
    int r = ppoll(&p, 1, &ts, NULL);
    if (r <= 0) return 1;   // plazo cumplido (o senal)
    if (p.revents & (POLLERR | POLLHUP | POLLNVAL)) { perder_mando(); return 0; }
    struct input_event evs[64];
    ssize_t n = read(gfd, evs, sizeof evs);
    if (n < 0 && errno != EAGAIN && errno != EINTR) { perder_mando(); return 0; }
    for (ssize_t i = 0; i + (ssize_t)sizeof evs[0] <= n; i += sizeof evs[0]) {
        const struct input_event *ev = (const struct input_event *)((char *)evs + i);
        gpm_evento(ev->type, ev->code, ev->value, mapear);
    }
    return 1;
}

void escr_plat_terminar(void) {
    if (gfd >= 0) perder_mando();
    gpm_uinput_destruir(ufd);
    ufd = -1;
}

static int cmp_eventos(const void *a, const void *b) {
    return atoi(*(char *const *)a + 5) - atoi(*(char *const *)b + 5);
}

void escr_plat_listar_mandos(void) {
    DIR *d = opendir("/dev/input");
    if (!d) { printf("no se puede abrir /dev/input\n"); return; }
    char *nombres[512];
    int n = 0, sin_permiso = 0, mandos = 0;
    struct dirent *e;
    while ((e = readdir(d)) && n < 512)
        if (!strncmp(e->d_name, "event", 5)) nombres[n++] = strdup(e->d_name);
    closedir(d);
    qsort(nombres, n, sizeof nombres[0], cmp_eventos);
    for (int i = 0; i < n; i++) {
        char p[64];
        snprintf(p, sizeof p, "/dev/input/%s", nombres[i]);
        free(nombres[i]);
        int fd = open(p, O_RDONLY | O_NONBLOCK);
        if (fd < 0) { if (errno == EACCES) sin_permiso++; continue; }
        char nm[128] = {0};
        ioctl(fd, EVIOCGNAME(sizeof nm - 1), nm);
        if (gpm_evdev_es_mando(fd)) {
            printf("%-20s %s\n", p, nm);
            mandos++;
        }
        close(fd);
    }
    if (!mandos) printf("No hay mandos conectados (o no se pueden leer).\n");
    if (sin_permiso)
        printf("Sin permiso para leer %d dispositivo(s) de /dev/input: anade tu usuario al grupo 'input'\n"
               "(mira desktop/linux/instalar-permisos.sh).\n", sin_permiso);
}

// ------------------------------------------------------------ escritorio y ventanas (X11)
static int hay_orden(const char *nombre) {
    char cmd[128];
    snprintf(cmd, sizeof cmd, "command -v %s >/dev/null 2>&1", nombre);
    return system(cmd) == 0;
}

// Ejecuta una orden y devuelve su salida (como mucho n-1 bytes). 0 = bien.
static int salida_de(const char *cmd, char *buf, size_t n) {
    FILE *f = popen(cmd, "r");
    if (!f) return -1;
    size_t len = 0, r;
    while (len + 1 < n && (r = fread(buf + len, 1, n - 1 - len, f)) > 0) len += r;
    buf[len] = 0;
    char resto[256];
    while (fread(resto, 1, sizeof resto, f) > 0) {}   // vaciar para que la orden acabe
    return pclose(f) == 0 && len > 0 ? 0 : -1;
}

int escr_plat_pantalla(int *w, int *h) {
    if (!getenv("DISPLAY")) return -1;
    static char buf[65536];
    const char *p;
    if (salida_de("xrandr --current 2>/dev/null", buf, sizeof buf) == 0 && (p = strstr(buf, " current ")) &&
        sscanf(p, " current %d x %d", w, h) == 2 && *w > 0 && *h > 0)
        return 0;
    if (salida_de("xdpyinfo 2>/dev/null", buf, sizeof buf) == 0 && (p = strstr(buf, "dimensions:")) &&
        sscanf(p, "dimensions: %dx%d", w, h) == 2 && *w > 0 && *h > 0)
        return 0;
    return -1;
}

// 'texto' entre comillas simples para la shell.
static void entre_comillas(const char *s, char *out, size_t n) {
    size_t o = 0;
    if (o + 1 < n) out[o++] = '\'';
    for (; *s && o + 5 < n; s++) {
        if (*s == '\'') { memcpy(out + o, "'\\''", 4); o += 4; }
        else out[o++] = *s;
    }
    if (o + 1 < n) out[o++] = '\'';
    out[o] = 0;
}

static int herramientas = -1;   // bit 1: xwininfo, 2: xprop, 4: xdotool
static unsigned long ventana_id = 0;

// Geometria del area de la ventana (sin el marco). 0 = bien.
static int geometria(unsigned long id, escr_rect_t *r) {
    static char buf[8192];
    char cmd[128];
    if (herramientas & 1) {
        snprintf(cmd, sizeof cmd, "xwininfo -id 0x%lx 2>/dev/null", id);
        if (salida_de(cmd, buf, sizeof buf)) return -1;
        const char *ax = strstr(buf, "Absolute upper-left X:"), *ay = strstr(buf, "Absolute upper-left Y:");
        const char *aw = strstr(buf, "Width:"), *ah = strstr(buf, "Height:"), *vis = strstr(buf, "IsViewable");
        if (!ax || !ay || !aw || !ah || !vis) return -1;
        r->x = atoi(ax + 22);
        r->y = atoi(ay + 22);
        r->w = atoi(aw + 6);
        r->h = atoi(ah + 7);
    } else {
        snprintf(cmd, sizeof cmd, "xdotool getwindowgeometry --shell %lu 2>/dev/null", id);
        if (salida_de(cmd, buf, sizeof buf)) return -1;
        const char *ax = strstr(buf, "X="), *ay = strstr(buf, "Y="), *aw = strstr(buf, "WIDTH="), *ah = strstr(buf, "HEIGHT=");
        if (!ax || !ay || !aw || !ah) return -1;
        r->x = atoi(ax + 2);
        r->y = atoi(ay + 2);
        r->w = atoi(aw + 6);
        r->h = atoi(ah + 7);
    }
    return r->w >= 50 && r->h >= 50 ? 0 : -1;
}

// Busca la ventana por su titulo. No cuenta la terminal donde se lanzo gpm-escritorio, cuyo
// titulo suele llevar la orden (con el mismo texto).
static unsigned long buscar_ventana(const char *titulo, escr_rect_t *r) {
    static char buf[1 << 20];
    if (herramientas & 1) {
        if (salida_de("xwininfo -root -tree 2>/dev/null", buf, sizeof buf)) return 0;
        for (char *l = buf; l && *l;) {
            char *fin = strchr(l, '\n');
            if (fin) *fin = 0;
            char *q1 = strchr(l, '"'), *q2 = q1 ? strstr(q1 + 1, "\": (") : NULL;
            unsigned long id;
            if (q1 && q2 && sscanf(l, " 0x%lx", &id) == 1) {
                *q2 = 0;
                if (gpm_contiene(q1 + 1, titulo) && !gpm_contiene(q1 + 1, "gpm-escritorio") && geometria(id, r) == 0)
                    return id;
            }
            l = fin ? fin + 1 : NULL;
        }
        return 0;
    }
    char cmd[600], q[400];
    entre_comillas(titulo, q, sizeof q);
    snprintf(cmd, sizeof cmd, "xdotool search --onlyvisible --name %s 2>/dev/null", q);
    if (salida_de(cmd, buf, sizeof buf)) return 0;
    for (char *l = strtok(buf, "\n"); l; l = strtok(NULL, "\n")) {
        unsigned long id = strtoul(l, NULL, 10);
        if (id && geometria(id, r) == 0) return id;
    }
    return 0;
}

static unsigned long ventana_activa(void) {
    char buf[256];
    const char *p;
    if ((herramientas & 4) && salida_de("xdotool getactivewindow 2>/dev/null", buf, sizeof buf) == 0)
        return strtoul(buf, NULL, 10);
    if ((herramientas & 2) && salida_de("xprop -root _NET_ACTIVE_WINDOW 2>/dev/null", buf, sizeof buf) == 0 &&
        (p = strstr(buf, "# 0x")))
        return strtoul(p + 2, NULL, 16);
    return 0;
}

int escr_plat_ventana(const char *titulo, escr_rect_t *r, int *activa) {
    if (herramientas < 0) {
        herramientas = (hay_orden("xwininfo") ? 1 : 0) | (hay_orden("xprop") ? 2 : 0) | (hay_orden("xdotool") ? 4 : 0);
        if (!getenv("DISPLAY") || !(herramientas & 5)) herramientas = 0;
        if (herramientas && !(herramientas & 6))
            escr_log("sin xdotool ni xprop no se sabe que ventana tiene el foco: se mapea siempre");
    }
    if (!herramientas) return -1;
    if (!ventana_id || geometria(ventana_id, r) != 0) ventana_id = buscar_ventana(titulo, r);
    if (!ventana_id) return 0;
    *activa = -1;
    if (herramientas & 6) *activa = ventana_activa() == ventana_id;
    return 1;
}

const char *escr_plat_cache(void) {
    static char dir[512];
    const char *x = getenv("XDG_CACHE_HOME"), *home = getenv("HOME");
    if (x && *x) snprintf(dir, sizeof dir, "%s/gamepad-mapper", x);
    else snprintf(dir, sizeof dir, "%s/.cache/gamepad-mapper", home ? home : "/tmp");
    return dir;
}

const char *escr_plat_ayuda(void) {
    return "Linux:\n"
           "  Hace falta leer el mando (/dev/input/event*, grupo 'input') y escribir en /dev/uinput:\n"
           "  ejecuta desktop/linux/instalar-permisos.sh y sigue sus instrucciones.\n"
           "  --ventana necesita X11 o XWayland y xwininfo/xprop (x11-utils) o xdotool. En Wayland nativo\n"
           "  no se pueden buscar ventanas: usa --rect, y el escritorio puede asociar la pantalla tactil\n"
           "  virtual a un solo monitor.\n";
}

int main(int argc, char **argv) { return escr_main(argc, argv); }
