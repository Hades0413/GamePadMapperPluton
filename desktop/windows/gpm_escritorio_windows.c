// gpm_escritorio_windows.c - gpm-escritorio para Windows 8 o posterior.
//
// Mando: XInput (hasta 4 mandos, leidos a ~250 Hz) traducido a los codigos de Linux que espera
// el nucleo, igual que el driver xpad de Linux: A/B/X/Y = BTN_SOUTH/EAST/NORTH/WEST, sticks en
// ABS_X/Y y ABS_RX/RY, gatillos en ABS_Z/RZ (0..255: L2/R2 y AXIS_2+/AXIS_5+), cruceta en
// ABS_HAT0X/Y. El boton central (HOME) no se puede leer con XInput.
// Salida: toques reales de Windows (InjectTouchInput, multitactil).
#define WIN32_LEAN_AND_MEAN
#if !defined(_WIN32_WINNT) || _WIN32_WINNT < 0x0602
#undef _WIN32_WINNT
#undef WINVER
#define _WIN32_WINNT 0x0602   // Windows 8: InjectTouchInput
#define WINVER 0x0602
#endif
#include <windows.h>
#include <xinput.h>
#include <mmsystem.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../comun/escritorio.h"

long long escr_plat_reloj_us(void) {
    static LARGE_INTEGER f;
    LARGE_INTEGER c;
    if (!f.QuadPart) QueryPerformanceFrequency(&f);
    QueryPerformanceCounter(&c);
    return (long long)(c.QuadPart / f.QuadPart) * 1000000 + (long long)(c.QuadPart % f.QuadPart) * 1000000 / f.QuadPart;
}

// ------------------------------------------------------------ toques (InjectTouchInput)
// Windows necesita en cada inyeccion TODOS los dedos apoyados; cada hueco del nucleo es un dedo.
static struct {
    int activo, nuevo, soltar;
    int x, y;
} dedo[GPM_NSLOTS];
static long long ultima_inyeccion = 0;
static int error_avisado = 0;

int escr_plat_iniciar_salida(int ancho, int alto) {
    (void)ancho;
    (void)alto;
    if (!InitializeTouchInjection(GPM_NSLOTS, TOUCH_FEEDBACK_DEFAULT)) {
        fprintf(stderr, "No se pudieron inyectar toques (InitializeTouchInjection, error %lu). Hace falta Windows 8 o\n"
                        "posterior. Prueba con --probar para ver los toques sin inyectarlos.\n", GetLastError());
        return -1;
    }
    escr_log("toques de Windows listos (hasta %d dedos)", GPM_NSLOTS);
    return 0;
}

static void poner(POINTER_TOUCH_INFO *t, int i, POINTER_FLAGS flags) {
    memset(t, 0, sizeof *t);
    t->pointerInfo.pointerType = PT_TOUCH;
    t->pointerInfo.pointerId = (UINT32)i;
    t->pointerInfo.ptPixelLocation.x = dedo[i].x;
    t->pointerInfo.ptPixelLocation.y = dedo[i].y;
    t->pointerInfo.pointerFlags = flags;
    t->touchFlags = TOUCH_FLAG_NONE;
    t->touchMask = TOUCH_MASK_CONTACTAREA | TOUCH_MASK_ORIENTATION | TOUCH_MASK_PRESSURE;
    t->orientation = 90;
    t->pressure = 32000;
    t->rcContact.left = dedo[i].x - 2;
    t->rcContact.right = dedo[i].x + 2;
    t->rcContact.top = dedo[i].y - 2;
    t->rcContact.bottom = dedo[i].y + 2;
}

static void inyectar(POINTER_TOUCH_INFO *t, int n) {
    if (!n) return;
    ultima_inyeccion = escr_plat_reloj_us();
    if (!InjectTouchInput((UINT32)n, t) && !error_avisado) {
        error_avisado = 1;
        escr_log("InjectTouchInput fallo (error %lu); se sigue intentando", GetLastError());
    }
}

// Envia el estado de todos los dedos: nuevos (DOWN), apoyados (UPDATE) y levantados (UP).
static void enviar(void) {
    POINTER_TOUCH_INFO t[GPM_NSLOTS];
    int n = 0, dos_pasos = 0;
    // Un dedo apoyado y levantado en el mismo grupo: primero se apoya y luego se levanta.
    for (int i = 0; i < GPM_NSLOTS; i++) dos_pasos |= dedo[i].nuevo && dedo[i].soltar;
    if (dos_pasos) {
        for (int i = 0; i < GPM_NSLOTS; i++) {
            if (!dedo[i].activo) continue;
            if (dedo[i].nuevo) poner(&t[n++], i, POINTER_FLAG_DOWN | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT);
            else if (!dedo[i].soltar) poner(&t[n++], i, POINTER_FLAG_UPDATE | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT);
            dedo[i].nuevo = 0;
        }
        inyectar(t, n);
        n = 0;
    }
    for (int i = 0; i < GPM_NSLOTS; i++) {
        if (!dedo[i].activo) continue;
        if (dedo[i].soltar) poner(&t[n++], i, POINTER_FLAG_UP);
        else if (dedo[i].nuevo) poner(&t[n++], i, POINTER_FLAG_DOWN | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT);
        else poner(&t[n++], i, POINTER_FLAG_UPDATE | POINTER_FLAG_INRANGE | POINTER_FLAG_INCONTACT);
    }
    inyectar(t, n);
    for (int i = 0; i < GPM_NSLOTS; i++) {
        if (dedo[i].soltar) dedo[i].activo = 0;
        dedo[i].nuevo = dedo[i].soltar = 0;
    }
}

void escr_plat_abajo(int slot, int x, int y) {
    dedo[slot].activo = dedo[slot].nuevo = 1;
    dedo[slot].soltar = 0;
    dedo[slot].x = x;
    dedo[slot].y = y;
}

void escr_plat_mover(int slot, int x, int y) {
    dedo[slot].x = x;
    dedo[slot].y = y;
}

void escr_plat_arriba(int slot) {
    if (dedo[slot].activo) dedo[slot].soltar = 1;
}

void escr_plat_sync(int tocando) {
    (void)tocando;
    enviar();
}

// Los dedos quietos se reenvian de vez en cuando para que Windows no los cancele.
static void mantener_dedos(void) {
    int alguno = 0;
    for (int i = 0; i < GPM_NSLOTS; i++) alguno |= dedo[i].activo;
    if (alguno && escr_plat_reloj_us() - ultima_inyeccion > 100000) enviar();
}

// ------------------------------------------------------------ mando (XInput)
typedef DWORD(WINAPI *xinput_get_t)(DWORD, XINPUT_STATE *);
typedef DWORD(WINAPI *xinput_set_t)(DWORD, XINPUT_VIBRATION *);
static xinput_get_t xget;
static xinput_set_t xset;
static int indice = -1;               // mando XInput en uso (0..3)
static XINPUT_STATE previo;
static long long fin_vibracion = 0;

static int cargar_xinput(void) {
    if (xget) return 1;
    const char *dlls[] = {"xinput1_4.dll", "xinput1_3.dll", "xinput9_1_0.dll"};
    for (int i = 0; i < 3 && !xget; i++) {
        HMODULE m = LoadLibraryA(dlls[i]);
        if (!m) continue;
        xget = (xinput_get_t)(void (*)(void))GetProcAddress(m, "XInputGetState");
        xset = (xinput_set_t)(void (*)(void))GetProcAddress(m, "XInputSetState");
    }
    if (!xget) escr_log("no se encontro XInput (xinput1_4.dll / xinput1_3.dll)");
    return xget != NULL;
}

int escr_plat_mando(const char *filtro) {
    if (indice >= 0) return 1;
    if (!cargar_xinput()) return 0;
    int quiero = -1;
    if (filtro[0]) {
        quiero = atoi(filtro);
        if (filtro[0] < '0' || filtro[0] > '3' || filtro[1]) {
            static int avisado = 0;
            if (!avisado) escr_log("en Windows --mando es el numero del mando XInput (0-3)");
            avisado = 1;
            return 0;
        }
    }
    for (int i = 0; i < 4; i++) {
        if (quiero >= 0 && i != quiero) continue;
        XINPUT_STATE s;
        if (xget((DWORD)i, &s) != ERROR_SUCCESS) continue;
        indice = i;
        memset(&previo, 0, sizeof previo);
        // Mismos ejes que el driver xpad de Linux
        gpm_eje_t ejes[ABS_CNT];
        memset(ejes, 0, sizeof ejes);
        static const int sticks[] = {ABS_X, ABS_Y, ABS_RX, ABS_RY};
        for (int k = 0; k < 4; k++) { ejes[sticks[k]].tiene = 1; ejes[sticks[k]].minimo = -32768; ejes[sticks[k]].maximo = 32767; }
        ejes[ABS_Z].tiene = ejes[ABS_RZ].tiene = 1;
        ejes[ABS_Z].maximo = ejes[ABS_RZ].maximo = 255;
        ejes[ABS_HAT0X].tiene = ejes[ABS_HAT0Y].tiene = 1;
        ejes[ABS_HAT0X].minimo = ejes[ABS_HAT0Y].minimo = -1;
        ejes[ABS_HAT0X].maximo = ejes[ABS_HAT0Y].maximo = 1;
        gpm_mando_nuevo(ejes);
        escr_log("mando conectado: XInput %d", i);
        return 1;
    }
    return 0;
}

void escr_plat_capturar(int on) {
    (void)on;   // XInput no permite el uso exclusivo: el juego tambien puede ver el mando
}

void escr_plat_vibrar(double nivel) {
    if (indice < 0 || !xset) return;
    XINPUT_VIBRATION v;
    v.wLeftMotorSpeed = v.wRightMotorSpeed = (WORD)(nivel * 65535);
    xset((DWORD)indice, &v);
    fin_vibracion = escr_plat_reloj_us() + 35000;
}

static void parar_vibracion(void) {
    if (!fin_vibracion || escr_plat_reloj_us() < fin_vibracion) return;
    fin_vibracion = 0;
    XINPUT_VIBRATION v = {0, 0};
    if (indice >= 0 && xset) xset((DWORD)indice, &v);
}

static const struct { WORD bit; int code; } botones[] = {
    {XINPUT_GAMEPAD_A, BTN_SOUTH}, {XINPUT_GAMEPAD_B, BTN_EAST}, {XINPUT_GAMEPAD_X, BTN_NORTH},
    {XINPUT_GAMEPAD_Y, BTN_WEST}, {XINPUT_GAMEPAD_LEFT_SHOULDER, BTN_TL}, {XINPUT_GAMEPAD_RIGHT_SHOULDER, BTN_TR},
    {XINPUT_GAMEPAD_BACK, BTN_SELECT}, {XINPUT_GAMEPAD_START, BTN_START},
    {XINPUT_GAMEPAD_LEFT_THUMB, BTN_THUMBL}, {XINPUT_GAMEPAD_RIGHT_THUMB, BTN_THUMBR},
};

static int cruceta(WORD b, WORD menos, WORD mas) { return (b & mas ? 1 : 0) - (b & menos ? 1 : 0); }

// Diferencias entre dos lecturas -> eventos de Linux. Devuelve 1 si hubo alguno.
static int traducir(const XINPUT_GAMEPAD *a, const XINPUT_GAMEPAD *n, int mapear) {
    int hubo = 0;
    for (size_t i = 0; i < sizeof botones / sizeof botones[0]; i++) {
        int antes = (a->wButtons & botones[i].bit) != 0, ahora = (n->wButtons & botones[i].bit) != 0;
        if (antes != ahora) { gpm_evento(EV_KEY, botones[i].code, ahora, mapear); hubo = 1; }
    }
    struct { int code, antes, ahora; } ejes[] = {
        {ABS_X, a->sThumbLX, n->sThumbLX}, {ABS_Y, -1 - a->sThumbLY, -1 - n->sThumbLY},   // Y hacia abajo, como xpad
        {ABS_RX, a->sThumbRX, n->sThumbRX}, {ABS_RY, -1 - a->sThumbRY, -1 - n->sThumbRY},
        {ABS_Z, a->bLeftTrigger, n->bLeftTrigger}, {ABS_RZ, a->bRightTrigger, n->bRightTrigger},
        {ABS_HAT0X, cruceta(a->wButtons, XINPUT_GAMEPAD_DPAD_LEFT, XINPUT_GAMEPAD_DPAD_RIGHT),
         cruceta(n->wButtons, XINPUT_GAMEPAD_DPAD_LEFT, XINPUT_GAMEPAD_DPAD_RIGHT)},
        {ABS_HAT0Y, cruceta(a->wButtons, XINPUT_GAMEPAD_DPAD_UP, XINPUT_GAMEPAD_DPAD_DOWN),
         cruceta(n->wButtons, XINPUT_GAMEPAD_DPAD_UP, XINPUT_GAMEPAD_DPAD_DOWN)},
    };
    for (size_t i = 0; i < sizeof ejes / sizeof ejes[0]; i++)
        if (ejes[i].antes != ejes[i].ahora) { gpm_evento(EV_ABS, ejes[i].code, ejes[i].ahora, mapear); hubo = 1; }
    if (hubo) gpm_evento(EV_SYN, SYN_REPORT, 0, mapear);
    return hubo;
}

int escr_plat_esperar(long long us, int mapear) {
    long long fin = escr_plat_reloj_us() + us;
    for (;;) {
        parar_vibracion();
        mantener_dedos();
        if (indice >= 0) {
            XINPUT_STATE s;
            if (xget((DWORD)indice, &s) != ERROR_SUCCESS) {
                escr_log("mando XInput %d desconectado", indice);
                indice = -1;
                return 0;
            }
            if (s.dwPacketNumber != previo.dwPacketNumber) {
                XINPUT_STATE a = previo;
                previo = s;
                if (traducir(&a.Gamepad, &s.Gamepad, mapear)) return 1;
            }
        }
        long long queda = fin - escr_plat_reloj_us();
        if (queda <= 0 || escr_parar) return indice >= 0 || us == 0 ? 1 : 0;
        Sleep(queda < 4000 ? (DWORD)(queda / 1000) : 4);   // ~250 lecturas por segundo
    }
}

void escr_plat_terminar(void) {
    for (int i = 0; i < GPM_NSLOTS; i++) if (dedo[i].activo) dedo[i].soltar = 1;
    enviar();
    fin_vibracion = 1;
    parar_vibracion();
}

void escr_plat_listar_mandos(void) {
    if (!cargar_xinput()) return;
    int n = 0;
    for (int i = 0; i < 4; i++) {
        XINPUT_STATE s;
        if (xget((DWORD)i, &s) != ERROR_SUCCESS) continue;
        printf("XInput %d    conectado (usa --mando %d)\n", i, i);
        n++;
    }
    if (!n) printf("No hay mandos XInput conectados (los mandos que no son XInput necesitan un adaptador como\n"
                   "Steam Input, DS4Windows o x360ce).\n");
}

// ------------------------------------------------------------ pantalla y ventanas
int escr_plat_pantalla(int *w, int *h) {
    *w = GetSystemMetrics(SM_CXSCREEN);   // monitor principal (en pixeles reales: SetProcessDPIAware)
    *h = GetSystemMetrics(SM_CYSCREEN);
    return *w > 0 && *h > 0 ? 0 : -1;
}

static HWND ventana;
static const char *buscado;

static int titulo_vale(HWND h) {
    wchar_t wt[512];
    char t[1024];
    if (!IsWindowVisible(h) || h == GetConsoleWindow() || !GetWindowTextW(h, wt, 512)) return 0;
    if (!WideCharToMultiByte(CP_UTF8, 0, wt, -1, t, sizeof t, NULL, NULL)) return 0;
    // La consola donde se lanzo gpm-escritorio suele llevar la orden (con el mismo texto) en el titulo.
    return gpm_contiene(t, buscado) && !gpm_contiene(t, "gpm-escritorio");
}

static int area(HWND h, escr_rect_t *r) {
    RECT c;
    POINT p = {0, 0};
    if (IsIconic(h) || !GetClientRect(h, &c) || !ClientToScreen(h, &p)) return -1;
    r->x = p.x;
    r->y = p.y;
    r->w = c.right - c.left;
    r->h = c.bottom - c.top;
    return r->w >= 50 && r->h >= 50 ? 0 : -1;
}

static BOOL CALLBACK una_ventana(HWND h, LPARAM l) {
    escr_rect_t r;
    if (titulo_vale(h) && area(h, &r) == 0) {
        *(HWND *)l = h;
        return FALSE;
    }
    return TRUE;
}

int escr_plat_ventana(const char *titulo, escr_rect_t *r, int *activa) {
    buscado = titulo;
    if (!ventana || !IsWindow(ventana) || area(ventana, r) != 0) {
        ventana = NULL;
        EnumWindows(una_ventana, (LPARAM)&ventana);
        if (!ventana || area(ventana, r) != 0) { ventana = NULL; return 0; }
    }
    *activa = GetForegroundWindow() == ventana;
    return 1;
}

const char *escr_plat_cache(void) {
    static char dir[512];
    const char *b = getenv("LOCALAPPDATA");
    snprintf(dir, sizeof dir, "%s\\GamepadMapper", b ? b : ".");
    return dir;
}

const char *escr_plat_ayuda(void) {
    return "Windows:\n"
           "  Mandos XInput (Xbox y compatibles; otros con Steam Input, DS4Windows o x360ce). El boton\n"
           "  HOME no se puede leer, y Windows no deja usar el mando en exclusiva: si el juego o el\n"
           "  emulador tambien lee el mando, desactiva alli el mando. --comunidad usa curl.exe (Windows 10+).\n";
}

int main(int argc, char **argv) {
    SetProcessDPIAware();   // coordenadas en pixeles reales (las de InjectTouchInput)
    timeBeginPeriod(1);     // Sleep de 1 ms para leer el mando a ~250 Hz
    int r = escr_main(argc, argv);
    timeEndPeriod(1);
    return r;
}
