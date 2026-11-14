// escritorio.c - opciones, perfil y bucle principal de gpm-escritorio (ver escritorio.h).
#include "escritorio.h"

#include <ctype.h>
#include <errno.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#ifdef _WIN32
#include <direct.h>
#define popen _popen
#define pclose _pclose
#define crear_dir(p) _mkdir(p)
#define SEP "\\"
#else
#define crear_dir(p) mkdir(p, 0755)
#define SEP "/"
#endif

#include "../../mapper/src/core/gpm_repeticion.h"

#define VERSION "1.6"
// Perfiles publicados de la comunidad (clave publica de solo lectura, la misma que usa la web).
#define SUPABASE_URL "https://gshyhrthaksriamjqdtf.supabase.co/rest/v1/game_profiles"
#define SUPABASE_KEY "sb_publishable_QTPm_6jVyWGcvWILpDqJoA_skWLqjeD"

int escr_verbose = 0;
volatile sig_atomic_t escr_parar = 0;

static struct {
    const char *perfil, *comunidad, *ventana, *mando, *repetir;
    int tiene_rect, tiene_pantalla, probar, lista;
    escr_rect_t rect;
    int pant_w, pant_h;
} op;

static long long t0;
static escr_rect_t destino;      // rectangulo del juego en el escritorio
static int repitiendo = 0;

// ------------------------------------------------------------ registro
void escr_log(const char *fmt, ...) {
    char buf[2048];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    fprintf(stderr, "[%8.3f] %s\n", (escr_plat_reloj_us() - t0) / 1e6, buf);
    fflush(stderr);
}

static void log_nucleo(const char *linea) {
    if (repitiendo) fprintf(stderr, "%s\n", linea);
    else escr_log("%s", linea);
}

static int depurar(void) { return escr_verbose; }

// ------------------------------------------------------------ toques: destino -> escritorio
static int a_pixel(double t, int origen, int tam) {
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return origen + (int)(t * (tam - 1) + 0.5);
}

static void hora(void) {
    printf("%10.3f ", repitiendo ? gpm_repeticion_ms() : (escr_plat_reloj_us() - t0) / 1000.0);
}

static void sal_abajo(int s, double u, double v) {
    int x = a_pixel(u, destino.x, destino.w), y = a_pixel(v, destino.y, destino.h);
    if (op.probar) { hora(); printf("abajo s=%d x=%d y=%d\n", s, x, y); fflush(stdout); }
    else escr_plat_abajo(s, x, y);
}

static void sal_mover(int s, double u, double v) {
    int x = a_pixel(u, destino.x, destino.w), y = a_pixel(v, destino.y, destino.h);
    if (op.probar) { hora(); printf("mover s=%d x=%d y=%d\n", s, x, y); fflush(stdout); }
    else escr_plat_mover(s, x, y);
}

static void sal_arriba(int s) {
    if (op.probar) { hora(); printf("arriba s=%d\n", s); fflush(stdout); }
    else escr_plat_arriba(s);
}

static void sal_sync(int tocando) {
    if (op.probar) { if (escr_verbose) { hora(); printf("sync tocando=%d\n", tocando); fflush(stdout); } }
    else escr_plat_sync(tocando);
}

static void sal_vibrar(double nivel) {
    if (op.probar) { hora(); printf("vibrar %.2f\n", nivel); fflush(stdout); }
    else escr_plat_vibrar(nivel);
}

static const gpm_plataforma_t plataforma = {
    .reloj_us = escr_plat_reloj_us,
    .log = log_nucleo,
    .depurar = depurar,
    .abajo = sal_abajo,
    .mover = sal_mover,
    .arriba = sal_arriba,
    .sync = sal_sync,
    .vibrar = sal_vibrar,
    .aprendido = NULL,
};

// ------------------------------------------------------------ perfiles de la comunidad
static int es_uuid(const char *s) {
    for (int i = 0; i < 36; i++) {
        if (i == 8 || i == 13 || i == 18 || i == 23) { if (s[i] != '-') return 0; }
        else if (!isxdigit((unsigned char)s[i])) return 0;
    }
    return 1;
}

static void poner_utf8(char **o, unsigned cp) {
    char *p = *o;
    if (cp < 0x80) *p++ = (char)cp;
    else if (cp < 0x800) { *p++ = (char)(0xC0 | (cp >> 6)); *p++ = (char)(0x80 | (cp & 0x3F)); }
    else { *p++ = (char)(0xE0 | (cp >> 12)); *p++ = (char)(0x80 | ((cp >> 6) & 0x3F)); *p++ = (char)(0x80 | (cp & 0x3F)); }
    *o = p;
}

// Respuesta [{"conf":"..."}] -> el texto de conf (sin escapes), en el mismo bufer. NULL si no hay.
static char *sacar_conf(char *json) {
    char *p = strstr(json, "\"conf\"");
    if (!p) return NULL;
    p = strchr(p + 6, ':');
    if (!p) return NULL;
    p++;
    while (isspace((unsigned char)*p)) p++;
    if (*p != '"') return NULL;
    char *o = ++p, *ini = p;
    while (*p && *p != '"') {
        if (*p != '\\') { *o++ = *p++; continue; }
        p++;
        switch (*p) {
            case 'n': *o++ = '\n'; break;
            case 'r': *o++ = '\r'; break;
            case 't': *o++ = '\t'; break;
            case 'b': case 'f': break;
            case 'u': {
                unsigned cp = 0;
                if (sscanf(p + 1, "%4x", &cp) != 1) return NULL;
                poner_utf8(&o, cp);   // (los pares sustitutos no aparecen en un perfil)
                p += 4;
                break;
            }
            case 0: return NULL;
            default: *o++ = *p; break;   // \" \\ \/
        }
        p++;
    }
    if (*p != '"') return NULL;
    *o = 0;
    return ini;
}

static void crear_dirs(const char *ruta) {
    char tmp[512];
    snprintf(tmp, sizeof tmp, "%s", ruta);
    for (char *p = tmp + 1; *p; p++) {
        if (*p != '/' && *p != '\\') continue;
        char c = *p;
        *p = 0;
        crear_dir(tmp);
        *p = c;
    }
    crear_dir(tmp);
}

// Descarga el perfil publicado con curl y lo guarda en la cache. 0 = bien.
// 'arg' es el id (uuid) o la direccion de la web que lo lleva (.../perfil/<id>).
static int descargar_comunidad(const char *arg, char *ruta, size_t n) {
    char id[37] = "";
    for (size_t i = 0, l = strlen(arg); i + 36 <= l; i++)
        if (es_uuid(arg + i) && (i + 36 == l || !isxdigit((unsigned char)arg[i + 36]))) { memcpy(id, arg + i, 36); id[36] = 0; break; }
    if (!id[0]) { escr_log("--comunidad necesita el id del perfil o su direccion en la web (.../perfil/<id>)"); return -1; }
    char cmd[640];
    snprintf(cmd, sizeof cmd,
             "curl -fsSL --max-time 20 -H \"apikey: %s\" \"%s?select=conf&id=eq.%s&status=eq.published\"",
             SUPABASE_KEY, SUPABASE_URL, id);
    FILE *f = popen(cmd, "r");
    if (!f) { escr_log("no se pudo ejecutar curl: %s", strerror(errno)); return -1; }
    size_t cap = 256 * 1024, len = 0;
    char *buf = malloc(cap + 1);
    if (!buf) { pclose(f); return -1; }
    size_t r;
    while (len < cap && (r = fread(buf + len, 1, cap - len, f)) > 0) len += r;
    buf[len] = 0;
    int st = pclose(f);
    char *conf = sacar_conf(buf);
    if (!conf || !*conf) {
        if (st != 0 && len == 0) escr_log("no se pudo descargar el perfil (¿esta instalado curl? ¿hay conexion?)");
        else escr_log("el perfil %s no existe o no esta publicado", id);
        free(buf);
        return -1;
    }
    const char *dir = escr_plat_cache();
    crear_dirs(dir);
    snprintf(ruta, n, "%s" SEP "comunidad-%s.conf", dir, id);
    FILE *o = fopen(ruta, "wb");
    if (!o) { escr_log("no se puede escribir %s: %s", ruta, strerror(errno)); free(buf); return -1; }
    fputs(conf, o);
    fclose(o);
    free(buf);
    escr_log("perfil de la comunidad descargado en %s", ruta);
    return 0;
}

// ------------------------------------------------------------ opciones
static void ayuda(const char *prog) {
    printf("gpm-escritorio %s - Gamepad Mapper Pluton para el escritorio\n"
           "Juega con mando a juegos Android que se ven en el PC (scrcpy, Waydroid, un emulador...):\n"
           "el mando se convierte en toques dentro de la ventana del juego, con los perfiles de la app.\n\n"
           "Uso: %s --perfil ARCHIVO.conf [opciones]\n"
           "     %s --comunidad ID [opciones]\n\n"
           "  --perfil ARCHIVO     perfil (.conf) como los de la app\n"
           "  --comunidad ID       descargar un perfil publicado (su id o la direccion de su pagina\n"
           "                       en la web, .../perfil/<id>; necesita curl)\n"
           "  --ventana \"TITULO\"   tocar dentro de la ventana cuyo titulo contiene ese texto;\n"
           "                       solo se mapea mientras esa ventana tiene el foco\n"
           "  --rect X,Y,ANCHO,ALTO   tocar dentro de ese rectangulo del escritorio\n"
           "                       (sin --ventana ni --rect: toda la pantalla)\n"
           "  --pantalla ANCHOxALTO   tamano del escritorio (si no se puede detectar)\n"
           "  --mando TEXTO        usar el mando cuyo nombre contiene TEXTO (en Windows: su numero, 0-3)\n"
           "  --lista-mandos       mostrar los mandos conectados y salir\n"
           "  --probar             no tocar: escribir los toques en la consola\n"
           "  --repetir GUION      con --probar: repetir un guion de eventos (tests/engine) y salir\n"
           "  -v                   registro detallado\n"
           "  -h, --help           esta ayuda\n\n"
           "Con el mando: SELECT+START (1 s) pausa o reanuda el mapeo.\n"
           "El perfil se adapta al tamano del rectangulo de destino igual que en el movil.\n\n%s",
           VERSION, prog, prog, escr_plat_ayuda());
}

static int leer_opciones(int argc, char **argv) {
    for (int i = 1; i < argc; i++) {
        char *a = argv[i], *val = NULL;
        char nombre[32];
        snprintf(nombre, sizeof nombre, "%s", a);
        char *eq = strchr(nombre, '=');
        if (!strncmp(a, "--", 2) && eq) { *eq = 0; val = a + (eq - nombre) + 1; }
#define CON_VALOR (val ? val : (i + 1 < argc ? argv[++i] : NULL))
        if (!strcmp(nombre, "-h") || !strcmp(nombre, "--help") || !strcmp(nombre, "--ayuda")) { ayuda(argv[0]); exit(0); }
        else if (!strcmp(nombre, "-v")) escr_verbose = 1;
        else if (!strcmp(nombre, "--probar")) op.probar = 1;
        else if (!strcmp(nombre, "--lista-mandos")) op.lista = 1;
        else if (!strcmp(nombre, "--perfil") && (op.perfil = CON_VALOR)) {}
        else if (!strcmp(nombre, "--comunidad") && (op.comunidad = CON_VALOR)) {}
        else if (!strcmp(nombre, "--ventana") && (op.ventana = CON_VALOR)) {}
        else if (!strcmp(nombre, "--mando") && (op.mando = CON_VALOR)) {}
        else if (!strcmp(nombre, "--repetir") && (op.repetir = CON_VALOR)) {}
        else if (!strcmp(nombre, "--rect")) {
            const char *v = CON_VALOR;
            escr_rect_t *r = &op.rect;
            if (!v || sscanf(v, "%d,%d,%d,%d", &r->x, &r->y, &r->w, &r->h) != 4 || r->w < 2 || r->h < 2) {
                fprintf(stderr, "--rect necesita X,Y,ANCHO,ALTO (p. ej. --rect 0,0,1920,1080)\n");
                return -1;
            }
            op.tiene_rect = 1;
        } else if (!strcmp(nombre, "--pantalla")) {
            const char *v = CON_VALOR;
            if (!v || sscanf(v, "%dx%d", &op.pant_w, &op.pant_h) != 2 || op.pant_w < 100 || op.pant_h < 100) {
                fprintf(stderr, "--pantalla necesita ANCHOxALTO (p. ej. --pantalla 1920x1080)\n");
                return -1;
            }
            op.tiene_pantalla = 1;
        } else {
            fprintf(stderr, "opcion desconocida o sin valor: %s (mira --help)\n", a);
            return -1;
        }
#undef CON_VALOR
    }
    if (op.tiene_rect && op.ventana) { fprintf(stderr, "usa --ventana o --rect, no los dos\n"); return -1; }
    if (op.repetir && !op.probar) { fprintf(stderr, "--repetir solo vale con --probar\n"); return -1; }
    return 0;
}

static void al_parar(int s) {
    (void)s;
    escr_parar = 1;
}

// ------------------------------------------------------------ bucle principal
int escr_main(int argc, char **argv) {
    gpm_plataforma(&plataforma);
    t0 = escr_plat_reloj_us();
    if (leer_opciones(argc, argv)) return 2;
    if (op.lista) { escr_plat_listar_mandos(); return 0; }

    char ruta[600];
    if (op.comunidad) {
        if (descargar_comunidad(op.comunidad, ruta, sizeof ruta)) return 1;
    } else if (op.perfil) snprintf(ruta, sizeof ruta, "%s", op.perfil);
    else { fprintf(stderr, "falta el perfil: --perfil ARCHIVO.conf o --comunidad ID (mira --help)\n"); return 2; }

    // Escritorio y rectangulo de destino
    int pw = op.pant_w, ph = op.pant_h;
    if (!op.tiene_pantalla && escr_plat_pantalla(&pw, &ph) != 0) {
        if (!op.tiene_rect && !op.ventana) {
            fprintf(stderr, "no se pudo saber el tamano del escritorio: usa --pantalla ANCHOxALTO o --rect\n");
            return 1;
        }
        pw = ph = 0;
    }
    int ventana_ok = 0, foco = 1;
    if (op.tiene_rect) destino = op.rect;
    else if (op.ventana) {
        int activa = -1;
        int r = escr_plat_ventana(op.ventana, &destino, &activa);
        if (r < 0) { fprintf(stderr, "no se pueden buscar ventanas en este escritorio: usa --rect (mira --help)\n"); return 1; }
        ventana_ok = r == 1;
        foco = activa != 0;
        if (ventana_ok) escr_log("ventana \"%s\": %d,%d %dx%d%s", op.ventana, destino.x, destino.y, destino.w, destino.h,
                                 activa < 0 ? " (sin saber el foco: siempre activo)" : "");
        else escr_log("esperando la ventana \"%s\"...", op.ventana);
    } else {
        destino.x = destino.y = 0;
        destino.w = pw;
        destino.h = ph;
    }

    if (op.repetir) {   // prueba sin mando: toques del guion en el escritorio
        if (destino.w < 2) { fprintf(stderr, "no se encontro la ventana\n"); return 1; }
        gpm_destino_fijo(destino.w, destino.h);
        repitiendo = 1;
        return gpm_repetir(ruta, op.repetir, &plataforma);
    }

    static profile_t perfil;
    if (gpm_cargar_perfil(ruta, &perfil) != 0) { fprintf(stderr, "no se pudo leer el perfil %s\n", ruta); return 1; }
    gpm_usar_perfil(&perfil);
    if (destino.w >= 2) gpm_destino_fijo(destino.w, destino.h);
    escr_log("perfil %s (%s, %gx%g)%s", gpm_etiqueta(&perfil), perfil.pkg, perfil.sw, perfil.sh,
             op.probar ? " - modo prueba: los toques se escriben aqui" : "");
    if (destino.w >= 2) escr_log("destino %d,%d %dx%d", destino.x, destino.y, destino.w, destino.h);

    if (!op.probar) {
        if (pw <= 0) { fprintf(stderr, "no se pudo saber el tamano del escritorio: usa --pantalla ANCHOxALTO\n"); return 1; }
        if (escr_plat_iniciar_salida(pw, ph) != 0) return 1;
    }
    signal(SIGINT, al_parar);
    signal(SIGTERM, al_parar);

    const char *filtro = op.mando ? op.mando : "";
    int hay_mando = 0, activo = 1, mapeando = 0, avisado = 0;
    long long ultima_busqueda = -10000, ultima_ventana = 0, macro_due = -1;
    gpm_reiniciar_ticks();

    while (!escr_parar) {
        long long n = gpm_ahora_ms();

        if (!hay_mando && n - ultima_busqueda >= 2000) {
            ultima_busqueda = n;
            hay_mando = escr_plat_mando(filtro);
            if (!hay_mando && !avisado) escr_log("esperando un mando... (--lista-mandos para ver los que hay)");
            avisado = !hay_mando;
        }

        if (op.ventana && n - ultima_ventana >= 500) {   // ventana del juego: posicion, tamano y foco
            ultima_ventana = n;
            escr_rect_t r = destino;
            int activa = -1;
            int ok = escr_plat_ventana(op.ventana, &r, &activa) == 1;
            if (ok != ventana_ok) escr_log(ok ? "ventana \"%s\" encontrada" : "ventana \"%s\" cerrada", op.ventana);
            if (ok && (r.x != destino.x || r.y != destino.y || r.w != destino.w || r.h != destino.h)) {
                gpm_soltar_todo();
                destino = r;
                gpm_destino_fijo(destino.w, destino.h);
                escr_log("destino %d,%d %dx%d", destino.x, destino.y, destino.w, destino.h);
            }
            ventana_ok = ok;
            foco = activa != 0;
        }

        int quiere = activo && hay_mando && (!op.ventana || (ventana_ok && foco));
        if (quiere != mapeando) {
            mapeando = quiere;
            gpm_soltar_todo();
            if (!op.probar) escr_plat_capturar(mapeando);
            if (hay_mando) escr_log(mapeando ? "mapeando" : !activo ? "en pausa" : "ventana sin foco: el mando funciona normal");
        }

        int iv = gpm_intervalo_ms();
        long long tmo_us = (long long)(!hay_mando ? 500 : (mapeando && iv ? iv : 150)) * 1000;
        if (macro_due >= 0) {
            long long d = macro_due - gpm_ahora_us();
            if (d < tmo_us) tmo_us = d < 0 ? 0 : d;
        }
        if (!hay_mando) escr_plat_esperar(tmo_us, 0);
        else if (!escr_plat_esperar(tmo_us, mapeando)) {
            escr_log("mando desconectado");
            hay_mando = 0;
            gpm_soltar_todo();
            ultima_busqueda = gpm_ahora_ms();
        }

        // SELECT + START mantenidos 1 s: pausar / reanudar
        if (gpm_combo_pausa(hay_mando)) {
            activo = !activo;
            escr_log(activo ? "mapeo REANUDADO (SELECT+START)" : "mapeo PAUSADO (SELECT+START)");
            continue;   // al principio del bucle se sueltan los dedos y el mando
        }
        if (gpm_cambio_pedido()) escr_log("SELECT+R1/L1: en el escritorio hay un solo perfil (%s)", gpm_etiqueta(&perfil));

        macro_due = mapeando ? gpm_macros() : -1;
        gpm_ticks(mapeando);
    }

    gpm_soltar_todo();
    if (!op.probar) {
        escr_plat_capturar(0);
        escr_plat_terminar();
    }
    escr_log("fin");
    return 0;
}
