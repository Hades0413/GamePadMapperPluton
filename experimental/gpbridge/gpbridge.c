// gpbridge: el mando "GamepadPlus V3 Touchscreen" (modo Home+A) envia toques como un
// lapiz/digitalizador sin INPUT_PROP_DIRECT, y esta ROM lo clasifica como raton (sale
// una flecha). Este puente captura el mando en exclusiva (la flecha desaparece) y
// reenvia sus toques a una pantalla tactil virtual (uinput) que Android trata como
// pantalla tactil directa.
// Uso: gpbridge [-v] [-r ROT] [-W ancho] [-H alto] [-n NOMBRE_MANDO]
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <linux/uinput.h>
#include <signal.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <time.h>
#include <unistd.h>

static int verbose = 0;
static int rot = 0;
static int W = 1080, H = 2340;
static const char *src_name = "GamepadPlus V3 Touchscreen";

static void logf_(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
static void logf_(const char *fmt, ...) {
    va_list ap;
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    printf("[%ld.%03ld] ", (long)ts.tv_sec, ts.tv_nsec / 1000000);
    va_start(ap, fmt);
    vprintf(fmt, ap);
    va_end(ap);
    printf("\n");
    fflush(stdout);
}

static int open_by_name(const char *name, char *path_out, size_t n) {
    DIR *d = opendir("/dev/input");
    if (!d) return -1;
    struct dirent *e;
    int found = -1;
    while ((e = readdir(d))) {
        if (strncmp(e->d_name, "event", 5)) continue;
        char p[64];
        snprintf(p, sizeof p, "/dev/input/%s", e->d_name);
        int fd = open(p, O_RDONLY);
        if (fd < 0) continue;
        char nm[256] = {0};
        if (ioctl(fd, EVIOCGNAME(sizeof nm - 1), nm) >= 0 && !strcmp(nm, name)) {
            if (path_out) snprintf(path_out, n, "%s", p);
            found = fd;
            break;
        }
        close(fd);
    }
    closedir(d);
    return found;
}

static int ufd = -1;
static int tracking = 1;

static void emit(int type, int code, int value) {
    struct input_event ev;
    memset(&ev, 0, sizeof ev);
    ev.type = type;
    ev.code = code;
    ev.value = value;
    if (write(ufd, &ev, sizeof ev) != sizeof ev && verbose) logf_("write error: %s", strerror(errno));
}

static void abs_setup(int code, int min, int max) {
    struct uinput_abs_setup a;
    memset(&a, 0, sizeof a);
    a.code = code;
    a.absinfo.minimum = min;
    a.absinfo.maximum = max;
    if (ioctl(ufd, UI_ABS_SETUP, &a) < 0) logf_("UI_ABS_SETUP %d: %s", code, strerror(errno));
}

static int create_virtual_touch(void) {
    ufd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (ufd < 0) { logf_("no se pudo abrir /dev/uinput: %s", strerror(errno)); return -1; }
    ioctl(ufd, UI_SET_EVBIT, EV_KEY);
    ioctl(ufd, UI_SET_KEYBIT, BTN_TOUCH);
    ioctl(ufd, UI_SET_EVBIT, EV_ABS);
    ioctl(ufd, UI_SET_ABSBIT, ABS_MT_SLOT);
    ioctl(ufd, UI_SET_ABSBIT, ABS_MT_TRACKING_ID);
    ioctl(ufd, UI_SET_ABSBIT, ABS_MT_POSITION_X);
    ioctl(ufd, UI_SET_ABSBIT, ABS_MT_POSITION_Y);
    ioctl(ufd, UI_SET_ABSBIT, ABS_MT_TOUCH_MAJOR);
    ioctl(ufd, UI_SET_ABSBIT, ABS_MT_PRESSURE);
    ioctl(ufd, UI_SET_PROPBIT, INPUT_PROP_DIRECT);
    abs_setup(ABS_MT_SLOT, 0, 9);
    abs_setup(ABS_MT_TRACKING_ID, 0, 65535);
    abs_setup(ABS_MT_POSITION_X, 0, W - 1);
    abs_setup(ABS_MT_POSITION_Y, 0, H - 1);
    abs_setup(ABS_MT_TOUCH_MAJOR, 0, 255);
    abs_setup(ABS_MT_PRESSURE, 0, 255);
    struct uinput_setup us;
    memset(&us, 0, sizeof us);
    us.id.bustype = BUS_VIRTUAL;
    us.id.vendor = 0x1949;
    us.id.product = 0x0403;
    us.id.version = 1;
    snprintf(us.name, UINPUT_MAX_NAME_SIZE, "GamepadPlus Bridge Touch");
    if (ioctl(ufd, UI_DEV_SETUP, &us) < 0) { logf_("UI_DEV_SETUP: %s", strerror(errno)); return -1; }
    if (ioctl(ufd, UI_DEV_CREATE) < 0) { logf_("UI_DEV_CREATE: %s", strerror(errno)); return -1; }
    return 0;
}

static void touch(int down, int x, int y, int is_new) {
    emit(EV_ABS, ABS_MT_SLOT, 0);
    if (down) {
        if (is_new) {
            if (++tracking > 65000) tracking = 1;
            emit(EV_ABS, ABS_MT_TRACKING_ID, tracking);
            emit(EV_ABS, ABS_MT_TOUCH_MAJOR, 6);
            emit(EV_ABS, ABS_MT_PRESSURE, 60);
        }
        emit(EV_ABS, ABS_MT_POSITION_X, x);
        emit(EV_ABS, ABS_MT_POSITION_Y, y);
        if (is_new) emit(EV_KEY, BTN_TOUCH, 1);
    } else {
        emit(EV_ABS, ABS_MT_TRACKING_ID, -1);
        emit(EV_KEY, BTN_TOUCH, 0);
    }
    emit(EV_SYN, SYN_REPORT, 0);
}

static void map(int sx, int sy, int smx, int smy, int *ox, int *oy) {
    double u = smx > 0 ? (double)sx / smx : 0, v = smy > 0 ? (double)sy / smy : 0, a, b;
    switch (rot & 3) {
        case 1: a = 1.0 - v; b = u; break;
        case 2: a = 1.0 - u; b = 1.0 - v; break;
        case 3: a = v; b = 1.0 - u; break;
        default: a = u; b = v;
    }
    if (a < 0) a = 0;
    if (a > 1) a = 1;
    if (b < 0) b = 0;
    if (b > 1) b = 1;
    *ox = (int)(a * (W - 1) + 0.5);
    *oy = (int)(b * (H - 1) + 0.5);
}

int main(int argc, char **argv) {
    int c;
    while ((c = getopt(argc, argv, "vr:W:H:n:")) != -1) {
        switch (c) {
            case 'v': verbose = 1; break;
            case 'r': rot = atoi(optarg); break;
            case 'W': W = atoi(optarg); break;
            case 'H': H = atoi(optarg); break;
            case 'n': src_name = optarg; break;
            default: fprintf(stderr, "uso: %s [-v] [-r rot] [-W ancho] [-H alto] [-n mando]\n", argv[0]); return 2;
        }
    }
    signal(SIGHUP, SIG_IGN);
    signal(SIGPIPE, SIG_IGN);

    if (create_virtual_touch() < 0) return 1;
    logf_("pantalla virtual creada: %dx%d, rot %d", W, H, rot);

    for (;;) {
        char spath[64] = "";
        int sfd = open_by_name(src_name, spath, sizeof spath);
        if (sfd < 0) { sleep(1); continue; }
        struct input_absinfo sx, sy;
        memset(&sx, 0, sizeof sx);
        memset(&sy, 0, sizeof sy);
        ioctl(sfd, EVIOCGABS(ABS_X), &sx);
        ioctl(sfd, EVIOCGABS(ABS_Y), &sy);
        int grab = ioctl(sfd, EVIOCGRAB, (void *)1);
        logf_("mando conectado: %s X 0..%d Y 0..%d, captura exclusiva %s", spath, sx.maximum, sy.maximum,
              grab == 0 ? "OK" : strerror(errno));

        int x = sx.value, y = sy.value, down = 0, was = 0, moved = 0;
        struct input_event ev;
        for (;;) {
            ssize_t r = read(sfd, &ev, sizeof ev);
            if (r != sizeof ev) {
                if (r < 0 && errno == EINTR) continue;
                break;
            }
            if (ev.type == EV_ABS && ev.code == ABS_X) { x = ev.value; moved = 1; }
            else if (ev.type == EV_ABS && ev.code == ABS_Y) { y = ev.value; moved = 1; }
            else if (ev.type == EV_KEY && ev.code == BTN_TOUCH) down = ev.value ? 1 : 0;
            else if (ev.type == EV_SYN && ev.code == SYN_REPORT) {
                int ox, oy;
                map(x, y, sx.maximum, sy.maximum, &ox, &oy);
                if (down && !was) {
                    touch(1, ox, oy, 1);
                    if (verbose) logf_("DOWN raw %d,%d -> %d,%d", x, y, ox, oy);
                } else if (down && moved) {
                    touch(1, ox, oy, 0);
                } else if (!down && was) {
                    touch(0, 0, 0, 0);
                    if (verbose) logf_("UP   raw %d,%d -> %d,%d", x, y, ox, oy);
                }
                was = down;
                moved = 0;
            }
        }
        if (was) touch(0, 0, 0, 0);
        close(sfd);
        logf_("mando desconectado, esperando...");
        sleep(1);
    }
}
