// gpm_evdev.c - mando por evdev y pantalla tactil virtual por uinput (ver gpm_evdev.h).
#include "gpm_evdev.h"

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <linux/input.h>
#include <linux/uinput.h>
#include <stdio.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

#define TB(arr, b) ((arr[(b) / (8 * sizeof(long))] >> ((b) % (8 * sizeof(long)))) & 1)

int gpm_evdev_es_mando(int fd) {
    unsigned long keys[GPM_NCODES / (8 * sizeof(long)) + 1];
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

int gpm_evdev_buscar_mando(const char *filtro, const char *excluir, char *nombre, size_t nn, char *ruta, size_t nr) {
    DIR *d = opendir("/dev/input");
    if (!d) return -1;
    struct dirent *e;
    int found = -1;
    while ((e = readdir(d))) {
        if (strncmp(e->d_name, "event", 5)) continue;
        char p[64];
        snprintf(p, sizeof p, "/dev/input/%s", e->d_name);
        int fd = open(p, O_RDWR | O_NONBLOCK);   // escritura: solo para la vibracion
        if (fd < 0) fd = open(p, O_RDONLY | O_NONBLOCK);
        if (fd < 0) continue;
        char nm[128] = {0};
        ioctl(fd, EVIOCGNAME(sizeof nm - 1), nm);
        if (strcmp(nm, excluir) && gpm_evdev_es_mando(fd) && (!filtro[0] || strstr(nm, filtro))) {
            snprintf(nombre, nn, "%s", nm);
            snprintf(ruta, nr, "%s", p);
            found = fd;
            break;
        }
        close(fd);
    }
    closedir(d);
    return found;
}

void gpm_evdev_ejes(int fd, gpm_eje_t ejes[ABS_CNT]) {
    unsigned long abs_bits[ABS_CNT / (8 * sizeof(long)) + 1];
    memset(abs_bits, 0, sizeof abs_bits);
    memset(ejes, 0, sizeof(gpm_eje_t) * ABS_CNT);
    ioctl(fd, EVIOCGBIT(EV_ABS, sizeof abs_bits), abs_bits);
    for (int a = 0; a < ABS_CNT; a++) {
        struct input_absinfo ai;
        if (TB(abs_bits, a) && ioctl(fd, EVIOCGABS(a), &ai) == 0) {
            ejes[a].tiene = 1;
            ejes[a].minimo = ai.minimum;
            ejes[a].maximo = ai.maximum;
            ejes[a].valor = ai.value;
        }
    }
}

int gpm_evdev_capturar(int fd, int want) {
    return ioctl(fd, EVIOCGRAB, (void *)(long)want);
}

void gpm_evdev_vibrar(int fd, int *ff_id, double *ff_level, double nivel) {
    if (fd < 0 || *ff_id == -2) return;
    if (*ff_id < 0 || *ff_level != nivel) {
        struct ff_effect e;
        memset(&e, 0, sizeof e);
        e.type = FF_RUMBLE;
        e.id = *ff_id >= 0 ? *ff_id : -1;
        e.u.rumble.strong_magnitude = (unsigned short)(nivel * 0xFFFF);
        e.u.rumble.weak_magnitude = (unsigned short)(nivel * 0xFFFF);
        e.replay.length = 35;
        if (ioctl(fd, EVIOCSFF, &e) < 0) {
            *ff_id = -2;
            gpm_log("el mando no admite vibracion: %s", strerror(errno));
            return;
        }
        *ff_id = e.id;
        *ff_level = nivel;
    }
    struct input_event ev;
    memset(&ev, 0, sizeof ev);
    ev.type = EV_FF;
    ev.code = (unsigned short)*ff_id;
    ev.value = 1;
    if (write(fd, &ev, sizeof ev) < 0 && errno == EBADF) *ff_id = -2;
}

// ------------------------------------------------------------ uinput
static void emit(int fd, int type, int code, int value) {
    struct input_event ev;
    memset(&ev, 0, sizeof ev);
    ev.type = type;
    ev.code = code;
    ev.value = value;
    if (write(fd, &ev, sizeof ev) != (ssize_t)sizeof ev && gpm_depurar()) gpm_log("uinput write: %s", strerror(errno));
}

static void abs_setup(int fd, int code, int min, int max) {
    struct uinput_abs_setup a;
    memset(&a, 0, sizeof a);
    a.code = code;
    a.absinfo.minimum = min;
    a.absinfo.maximum = max;
    ioctl(fd, UI_ABS_SETUP, &a);
}

int gpm_uinput_crear(const char *nombre, int vendor, int product, int max_x, int max_y) {
    int fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (fd < 0) { gpm_log("no se puede abrir /dev/uinput: %s", strerror(errno)); return -1; }
    ioctl(fd, UI_SET_EVBIT, EV_KEY);
    ioctl(fd, UI_SET_KEYBIT, BTN_TOUCH);
    ioctl(fd, UI_SET_EVBIT, EV_ABS);
    int axes[] = {ABS_MT_SLOT, ABS_MT_TRACKING_ID, ABS_MT_POSITION_X, ABS_MT_POSITION_Y, ABS_MT_TOUCH_MAJOR,
                  ABS_MT_PRESSURE};
    for (size_t i = 0; i < sizeof axes / sizeof axes[0]; i++) ioctl(fd, UI_SET_ABSBIT, axes[i]);
    ioctl(fd, UI_SET_PROPBIT, INPUT_PROP_DIRECT);
    abs_setup(fd, ABS_MT_SLOT, 0, GPM_NSLOTS - 1);
    abs_setup(fd, ABS_MT_TRACKING_ID, 0, 65535);
    abs_setup(fd, ABS_MT_POSITION_X, 0, max_x);
    abs_setup(fd, ABS_MT_POSITION_Y, 0, max_y);
    abs_setup(fd, ABS_MT_TOUCH_MAJOR, 0, 255);
    abs_setup(fd, ABS_MT_PRESSURE, 0, 255);
    struct uinput_setup us;
    memset(&us, 0, sizeof us);
    us.id.bustype = BUS_VIRTUAL;
    us.id.vendor = vendor;
    us.id.product = product;
    us.id.version = 1;
    snprintf(us.name, UINPUT_MAX_NAME_SIZE, "%s", nombre);
    if (ioctl(fd, UI_DEV_SETUP, &us) < 0 || ioctl(fd, UI_DEV_CREATE) < 0) {
        gpm_log("no se pudo crear la pantalla virtual: %s", strerror(errno));
        close(fd);
        return -1;
    }
    return fd;
}

void gpm_uinput_abajo(int fd, int slot, int tracking_id, int x, int y) {
    emit(fd, EV_ABS, ABS_MT_SLOT, slot);
    emit(fd, EV_ABS, ABS_MT_TRACKING_ID, tracking_id);
    emit(fd, EV_ABS, ABS_MT_POSITION_X, x);
    emit(fd, EV_ABS, ABS_MT_POSITION_Y, y);
    emit(fd, EV_ABS, ABS_MT_TOUCH_MAJOR, 6);
    emit(fd, EV_ABS, ABS_MT_PRESSURE, 60);
}

void gpm_uinput_mover(int fd, int slot, int x, int y) {
    emit(fd, EV_ABS, ABS_MT_SLOT, slot);
    emit(fd, EV_ABS, ABS_MT_POSITION_X, x);
    emit(fd, EV_ABS, ABS_MT_POSITION_Y, y);
}

void gpm_uinput_arriba(int fd, int slot) {
    emit(fd, EV_ABS, ABS_MT_SLOT, slot);
    emit(fd, EV_ABS, ABS_MT_TRACKING_ID, -1);
}

void gpm_uinput_sync(int fd, int *estado, int tocando) {
    if (tocando != *estado) { emit(fd, EV_KEY, BTN_TOUCH, tocando); *estado = tocando; }
    emit(fd, EV_SYN, SYN_REPORT, 0);
}

void gpm_uinput_destruir(int fd) {
    if (fd < 0) return;
    ioctl(fd, UI_DEV_DESTROY);
    close(fd);
}
