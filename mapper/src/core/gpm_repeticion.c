// gpm_repeticion.c - prueba del motor sin mando ni pantalla.
//
// Lee un guion de eventos del mando, ejecuta la logica real con un reloj virtual (lo avanza el
// guion) y escribe cada toque. Formato del guion (una orden por linea, '#' comenta):
//   pantalla 2560x1080          pantalla real (como <base>/display en Android)
//   rango EJE MIN MAX [VALOR]   recorrido de un eje del mando virtual (antes del primer evento)
//   quitar EJE                  el mando virtual no tiene ese eje
//   boton NOMBRE 0|1            evento EV_KEY (A, L2, DPAD_UP, BTN_13A...)
//   eje EJE VALOR               evento EV_ABS (X, Y, Z, RX, RY, RZ, GAS, BRAKE, HAT0X, HAT0Y o hex)
//   syn                         fin del grupo de eventos (SYN_REPORT)
//   pulsa NOMBRE / suelta NOMBRE    boton 1 / 0 seguido de syn
//   espera MS                   avanza el reloj (el bucle despierta como el de verdad: turbo, macros...)
// Mando virtual por defecto: sticks X/Y y RX/RY (-32768..32767), gatillos Z/RZ (0..255) y
// cruceta HAT0X/HAT0Y (-1..1).
#include "gpm_repeticion.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "gpm_core.h"

// El reloj virtual empieza en 1 s: el motor usa 0 como "sin hora".
#define RP_T0 1000000LL
static long long replay_us = RP_T0;
static const gpm_plataforma_t *salida;
static profile_t perfil;

double gpm_repeticion_ms(void) { return (replay_us - RP_T0) / 1000.0; }

static void rp_time(void) { printf("%6lld.%03lld ", (replay_us - RP_T0) / 1000, (replay_us - RP_T0) % 1000); }

static long long rp_reloj(void) { return replay_us; }

static void rp_log(const char *linea) {
    if (salida && salida->log) salida->log(linea);
    else fprintf(stderr, "%s\n", linea);
}

// Formato de las pruebas: el toque en pixeles del destino (u * (ancho - 1)).
static void rp_touch(const char *op, int s, double u, double v) {
    double w, h;
    gpm_destino(&w, &h);
    rp_time();
    printf("%s s=%d x=%.2f y=%.2f\n", op, s, u * (w - 1), v * (h - 1));
}

static void rp_abajo(int s, double u, double v) {
    if (salida) salida->abajo(s, u, v);
    else rp_touch("abajo", s, u, v);
}

static void rp_mover(int s, double u, double v) {
    if (salida) salida->mover(s, u, v);
    else rp_touch("mover", s, u, v);
}

static void rp_arriba(int s) {
    if (salida) { salida->arriba(s); return; }
    rp_time();
    printf("arriba s=%d\n", s);
}

static void rp_sync(int tocando) {
    if (salida) { salida->sync(tocando); return; }
    rp_time();
    printf("sync tocando=%d\n", tocando);
}

static void rp_vibrar(double nivel) {
    if (salida) { if (salida->vibrar) salida->vibrar(nivel); return; }
    rp_time();
    printf("vibrar %.2f\n", nivel);
}

static const struct { const char *name; int code; } rp_axes[] = {
    {"X", ABS_X}, {"Y", ABS_Y}, {"Z", ABS_Z}, {"RX", ABS_RX}, {"RY", ABS_RY}, {"RZ", ABS_RZ},
    {"THROTTLE", ABS_THROTTLE}, {"RUDDER", ABS_RUDDER}, {"WHEEL", ABS_WHEEL}, {"GAS", ABS_GAS},
    {"BRAKE", ABS_BRAKE}, {"HAT0X", ABS_HAT0X}, {"HAT0Y", ABS_HAT0Y},
};

static int rp_axis(const char *name) {
    for (size_t i = 0; i < sizeof rp_axes / sizeof rp_axes[0]; i++)
        if (!gpm_strcasecmp(rp_axes[i].name, name)) return rp_axes[i].code;
    char *end;
    long v = strtol(name, &end, 16);
    return end != name && *end == 0 && v >= 0 && v < ABS_CNT ? (int)v : -1;
}

// Estado de la "plataforma" simulada: mapeo activo y mando capturado.
static int rp_enabled = 1, grabbed = 0;
static long long rp_macro_due = -1;

// Una vuelta del bucle principal tras leer los eventos (o al vencer el plazo), como en gpmapper.
static void rp_tail(void) {
    const profile_t *cur = gpm_perfil();
    if (gpm_combo_pausa(!gpm_aprendiendo())) {
        rp_enabled = !rp_enabled;
        gpm_soltar_todo();
        grabbed = rp_enabled && cur != NULL;
        rp_time();
        printf(rp_enabled ? "mapeo reanudado\n" : "mapeo pausado\n");
    }
    if (cur && gpm_cambio_pedido()) {   // un solo perfil: no hay a cual cambiar
        rp_time();
        printf("aviso Este juego solo tiene un perfil (%s)\n", gpm_etiqueta(cur));
    }
    int activo = grabbed && cur && !gpm_aprendiendo();
    rp_macro_due = activo ? gpm_macros() : -1;
    gpm_ticks(activo);
}

static void rp_evento(int type, int code, int value) { gpm_evento(type, code, value, grabbed); }

int gpm_repetir(const char *conf, const char *script, const gpm_plataforma_t *sal) {
    static gpm_plataforma_t p;
    salida = sal;
    replay_us = RP_T0;
    p.reloj_us = rp_reloj;
    p.log = rp_log;
    p.depurar = sal ? sal->depurar : NULL;
    p.abajo = rp_abajo;
    p.mover = rp_mover;
    p.arriba = rp_arriba;
    p.sync = rp_sync;
    p.vibrar = rp_vibrar;
    p.aprendido = NULL;
    gpm_plataforma(&p);

    FILE *f = fopen(script, "r");
    if (!f) { fprintf(stderr, "no se puede abrir %s\n", script); return 1; }
    if (gpm_cargar_perfil(conf, &perfil) != 0) { fprintf(stderr, "no se pudo leer %s\n", conf); fclose(f); return 1; }
    gpm_usar_perfil(&perfil);
    gpm_eje_t pad[ABS_CNT];
    memset(pad, 0, sizeof pad);
    static const int sticks[] = {ABS_X, ABS_Y, ABS_RX, ABS_RY};
    for (int i = 0; i < 4; i++) { pad[sticks[i]].tiene = 1; pad[sticks[i]].minimo = -32768; pad[sticks[i]].maximo = 32767; }
    pad[ABS_Z].tiene = pad[ABS_RZ].tiene = 1;
    pad[ABS_Z].maximo = pad[ABS_RZ].maximo = 255;
    pad[ABS_HAT0X].tiene = pad[ABS_HAT0Y].tiene = 1;
    pad[ABS_HAT0X].minimo = pad[ABS_HAT0Y].minimo = -1;
    pad[ABS_HAT0X].maximo = pad[ABS_HAT0Y].maximo = 1;

    int connected = 0, ln = 0, err = 0;
    char line[256];
    while (!err && fgets(line, sizeof line, f)) {
        ln++;
        char *hash = strchr(line, '#');
        if (hash) *hash = 0;
        char cmd[32] = "", a1[64] = "", a2[32] = "", a3[32] = "", a4[32] = "";
        int n = sscanf(line, "%31s %63s %31s %31s %31s", cmd, a1, a2, a3, a4);
        if (n < 1) continue;
        if (!gpm_strcasecmp(cmd, "pantalla")) {
            double w = 0, h = 0;
            if (sscanf(a1, "%lfx%lf", &w, &h) == 2 && w >= 100 && h >= 100) gpm_pantalla(w, h);
            else err = 1;
            continue;
        }
        if (!gpm_strcasecmp(cmd, "rango") || !gpm_strcasecmp(cmd, "quitar")) {
            int a = rp_axis(a1);
            if (connected || a < 0) { err = 1; continue; }
            if (!gpm_strcasecmp(cmd, "quitar")) { pad[a].tiene = 0; continue; }
            if (n < 4) { err = 1; continue; }
            pad[a].tiene = 1;
            pad[a].minimo = atoi(a2);
            pad[a].maximo = atoi(a3);
            pad[a].valor = n >= 5 ? atoi(a4) : 0;
            continue;
        }
        if (!connected) {   // el mando "se conecta" con el primer evento
            connected = 1;
            gpm_mando_nuevo(pad);
            grabbed = 1;
            gpm_reiniciar_ticks();
            double w, h;
            gpm_destino(&w, &h);
            rp_time();
            printf("perfil %s %gx%g -> destino %gx%g\n", perfil.pkg, perfil.sw, perfil.sh, w, h);
        }
        if (!gpm_strcasecmp(cmd, "boton") || !gpm_strcasecmp(cmd, "pulsa") || !gpm_strcasecmp(cmd, "suelta")) {
            int code = -1, axis = -1, dir = 0;
            if (gpm_leer_token(a1, &code, &axis, &dir) != 0 || code == GPM_CODE_LS || code == GPM_CODE_RS) { err = 1; continue; }
            rp_evento(EV_KEY, code, !gpm_strcasecmp(cmd, "boton") ? atoi(a2) : !gpm_strcasecmp(cmd, "pulsa"));
            if (gpm_strcasecmp(cmd, "boton")) {
                rp_evento(EV_SYN, SYN_REPORT, 0);
                rp_tail();
            }
        } else if (!gpm_strcasecmp(cmd, "eje")) {
            int a = rp_axis(a1);
            if (a < 0 || n < 3) { err = 1; continue; }
            rp_evento(EV_ABS, a, atoi(a2));
        } else if (!gpm_strcasecmp(cmd, "syn")) {
            rp_evento(EV_SYN, SYN_REPORT, 0);
            rp_tail();
        } else if (!gpm_strcasecmp(cmd, "espera")) {
            long long target = replay_us + (long long)(atof(a1) * 1000.0);
            for (int guard = 0; guard < 1000000; guard++) {
                // Mismo plazo que el bucle principal: si vence antes que el siguiente evento, una vuelta sin eventos.
                int iv = gpm_intervalo_ms();
                int timeout = grabbed && !gpm_aprendiendo() && iv ? iv : 150;
                long long tmo_us = (long long)timeout * 1000;
                if (rp_macro_due >= 0) {
                    long long d = rp_macro_due - replay_us;
                    if (d < tmo_us) tmo_us = d < 0 ? 0 : d;
                }
                if (replay_us + tmo_us >= target) break;
                replay_us += tmo_us;
                rp_tail();
            }
            replay_us = target;
        } else err = 1;
    }
    fclose(f);
    if (err) { fprintf(stderr, "%s:%d: linea no valida\n", script, ln); return 1; }
    gpm_soltar_todo();
    rp_time();
    printf("fin\n");
    return 0;
}
