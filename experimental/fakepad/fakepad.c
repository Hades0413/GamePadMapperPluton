// fakepad - mando virtual (uinput) para probar el mapeador sin un mando real.
// Uso: fakepad CMD...   CMD: wMS (esperar ms) | pA / rA (pulsar/soltar A,B,X,Y,L1,R1,SELECT,START)
//                            | lX,Y (stick izq. -1..1) | gX,Y (stick der. Z/RZ) | hX,Y (cruceta)
#include <fcntl.h>
#include <linux/uinput.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <unistd.h>

static int fd;

static void emit(int t, int c, int v) {
    struct input_event e;
    memset(&e, 0, sizeof e);
    e.type = t;
    e.code = c;
    e.value = v;
    if (write(fd, &e, sizeof e) < 0) perror("write");
}

static void ab(int code, int mn, int mx) {
    struct uinput_abs_setup a;
    memset(&a, 0, sizeof a);
    a.code = code;
    a.absinfo.minimum = mn;
    a.absinfo.maximum = mx;
    a.absinfo.flat = 0;
    ioctl(fd, UI_ABS_SETUP, &a);
}

static int btn(const char *n) {
    static const struct { const char *n; int c; } t[] = {
        {"A", BTN_SOUTH}, {"B", BTN_EAST}, {"X", BTN_NORTH}, {"Y", BTN_WEST}, {"L1", BTN_TL}, {"R1", BTN_TR},
        {"L2", BTN_TL2}, {"R2", BTN_TR2},
        {"SELECT", BTN_SELECT}, {"START", BTN_START}, {"L3", BTN_THUMBL}, {"R3", BTN_THUMBR}};
    for (size_t i = 0; i < sizeof t / sizeof t[0]; i++) if (!strcmp(t[i].n, n)) return t[i].c;
    return -1;
}

static int st(double v) { return (int)(128 + v * 127); }

int main(int argc, char **argv) {
    fd = open("/dev/uinput", O_WRONLY | O_NONBLOCK);
    if (fd < 0) { perror("/dev/uinput"); return 1; }
    ioctl(fd, UI_SET_EVBIT, EV_KEY);
    int keys[] = {BTN_SOUTH, BTN_EAST, BTN_NORTH, BTN_WEST, BTN_TL, BTN_TR, BTN_TL2, BTN_TR2, BTN_SELECT, BTN_START,
                  BTN_MODE, BTN_THUMBL, BTN_THUMBR};
    for (size_t i = 0; i < sizeof keys / sizeof keys[0]; i++) ioctl(fd, UI_SET_KEYBIT, keys[i]);
    ioctl(fd, UI_SET_EVBIT, EV_ABS);
    int axes[] = {ABS_X, ABS_Y, ABS_Z, ABS_RZ, ABS_GAS, ABS_BRAKE, ABS_HAT0X, ABS_HAT0Y};
    for (size_t i = 0; i < sizeof axes / sizeof axes[0]; i++) ioctl(fd, UI_SET_ABSBIT, axes[i]);
    ab(ABS_X, 0, 255); ab(ABS_Y, 0, 255); ab(ABS_Z, 0, 255); ab(ABS_RZ, 0, 255);
    ab(ABS_GAS, 0, 255); ab(ABS_BRAKE, 0, 255); ab(ABS_HAT0X, -1, 1); ab(ABS_HAT0Y, -1, 1);
    struct uinput_setup us;
    memset(&us, 0, sizeof us);
    // FAKEPAD_VENDOR=045e FAKEPAD_NAME="Xbox Wireless Controller" para simular otras marcas.
    const char *ven = getenv("FAKEPAD_VENDOR"), *nm = getenv("FAKEPAD_NAME");
    us.id.bustype = BUS_BLUETOOTH;
    us.id.vendor = ven ? (unsigned short)strtol(ven, NULL, 16) : 0x1234;
    us.id.product = 0x5678;
    snprintf(us.name, sizeof us.name, "%s", nm ? nm : "Fake Test Gamepad");
    if (ioctl(fd, UI_DEV_SETUP, &us) < 0 || ioctl(fd, UI_DEV_CREATE) < 0) { perror("create"); return 1; }
    usleep(1500000);
    emit(EV_ABS, ABS_X, 128); emit(EV_ABS, ABS_Y, 128); emit(EV_ABS, ABS_Z, 128); emit(EV_ABS, ABS_RZ, 128);
    emit(EV_SYN, SYN_REPORT, 0);
    for (int i = 1; i < argc; i++) {
        char *a = argv[i];
        double x = 0, y = 0;
        switch (a[0]) {
            case 'w': usleep(atoi(a + 1) * 1000); break;
            case 'p': case 'r': {
                int c = btn(a + 1);
                if (c < 0) { fprintf(stderr, "boton? %s\n", a); break; }
                emit(EV_KEY, c, a[0] == 'p'); emit(EV_SYN, SYN_REPORT, 0);
                break;
            }
            case 'l': case 'g': case 'h':
                sscanf(a + 1, "%lf,%lf", &x, &y);
                if (a[0] == 'h') { emit(EV_ABS, ABS_HAT0X, (int)x); emit(EV_ABS, ABS_HAT0Y, (int)y); }
                else {
                    emit(EV_ABS, a[0] == 'l' ? ABS_X : ABS_Z, st(x));
                    emit(EV_ABS, a[0] == 'l' ? ABS_Y : ABS_RZ, st(y));
                }
                emit(EV_SYN, SYN_REPORT, 0);
                break;
        }
        printf("%s\n", a);
        fflush(stdout);
    }
    usleep(300000);
    ioctl(fd, UI_DEV_DESTROY);
    close(fd);
    return 0;
}
