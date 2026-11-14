package com.gamepadmapper.app;

import android.os.Environment;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Perfil de un juego, en el mismo formato de texto que lee gpmapper:
 *
 * <pre>
 * package = app.ejemplo
 * screen  = 2340x1080
 * deadzone = 0.18
 * ls_axes = 0,1          # opcional: ejes (hex) del stick izquierdo
 * rs_axes = 2,5          # opcional: ejes (hex) del stick derecho
 * ls_deadzone = 0.15     # opcional: zona muerta propia de cada stick
 * ls_curve = 1.5         # opcional: curva de respuesta (1 lineal, >1 mas suave al centro)
 * look_y = 1.00          # sensibilidad vertical de la camara
 * look_invert = 0        # invertir eje Y de la camara
 * aim_button = L2        # opcional: mientras se mantiene, la camara va a aim_scale
 * aim_scale = 0.50       #   (apuntar con mas precision)
 * look_accel = 0.50      # opcional: la camara acelera con el stick al tope (0 = no)
 * controller = xbox      # opcional: al conectar un mando con ese nombre se activa este perfil
 * rumble = 0.50          # opcional: vibracion del mando al pulsar (0 = no, 1 = fuerte)
 * gyro = 1.00            # opcional, solo sin root: camara con el giroscopio (0 = no)
 * gyro_button = L2       #   solo mientras se mantiene ese boton (vacio = siempre)
 * gyro_invert = 0        #   invertir el eje vertical del giroscopio
 * mouse = 1.00           # opcional, solo sin root: el raton mueve la camara (0 = no)
 * KB_W = tap 300 700     # tecla de un teclado fisico (solo sin root)
 * MOUSE_LEFT = tap 1900 800   # boton del raton (solo sin root)
 * players = 2            # opcional, solo sin root: el segundo mando es el jugador 2
 * P2_A = tap 900 700     #   botones y sticks del jugador 2 (P2_LS, P2_RS...)
 * A  = tap 1980 895
 * B  = turbo 1700 900 12           # toques por segundo mientras se mantiene
 * X  = toggle 1500 700             # una pulsacion mantiene el toque, otra lo suelta
 * Y  = swipe 1800 500 1800 200 150 # deslizar de (x1,y1) a (x2,y2) en 150 ms
 * L2+A = tap 1000 300              # capa: mientras se mantiene L2, A toca aqui
 * BTN_13A = tap 550 85   # cualquier boton detectado
 * AXIS_9+ = tap 372 398  # eje usado como boton (gatillo)
 * LS = stick 405 735 150
 * RS = look 1500 500 14
 * </pre>
 *
 * Las coordenadas estan en pixeles de la pantalla "tal como se ve" con tamano screen.
 */
public class Profile {
    /** Nombres estandar en el orden en que se ofrecen y se guardan. */
    public static final String[] BUTTONS = {
            "A", "B", "X", "Y", "L1", "R1", "L2", "R2", "L3", "R3",
            "SELECT", "START", "HOME", "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT", "LS", "RS"
    };

    public static final String TAP = "tap", STICK = "stick", LOOK = "look", MACRO = "macro",
            TURBO = "turbo", TOGGLE = "toggle", SWIPE = "swipe", QUICK = "quick", BURST = "burst";

    /** Rafaga: limites de toques (igual que los pasos de una macro en gpmapper) e intervalo (ms). */
    public static final int BURST_MIN = 2, BURST_MAX = 16, BURST_GAP_MIN = 40, BURST_GAP_MAX = 500;

    /** Tipos de un boton (no stick), en el orden en que se ofrecen en el editor. */
    public static final String[] BUTTON_TYPES = {TAP, QUICK, BURST, TURBO, TOGGLE, SWIPE, MACRO};

    public static String typeName(String t) {
        switch (t) {
            case QUICK: return L.t("Toque rápido");
            case BURST: return L.t("Ráfaga");
            case TURBO: return L.t("Turbo");
            case TOGGLE: return L.t("Interruptor");
            case SWIPE: return L.t("Deslizar");
            case MACRO: return L.t("Macro");
            case STICK: return L.t("Joystick");
            case LOOK: return L.t("Cámara");
            default: return L.t("Toque");
        }
    }

    /** Botones que se ofrecen como modificador de capa ("L2+A"). */
    public static final String[] MODIFIERS = {"L1", "R1", "L2", "R2", "SELECT", "L3", "R3"};

    /** "L2+A" -> "L2"; sin capa -> "". */
    public static String modOf(String key) {
        int p = key.indexOf('+', 1);
        return p > 0 && p < key.length() - 1 ? key.substring(0, p) : "";
    }

    /** "L2+A" -> "A". */
    public static String baseOf(String key) {
        int p = key.indexOf('+', 1);
        return p > 0 && p < key.length() - 1 ? key.substring(p + 1) : key;
    }

    /** Paso de una macro: toque en (x,y) que empieza 'delay' ms despues del paso anterior y dura 'hold' ms. */
    public static class Step {
        public float x, y, delay, hold;

        public Step(float x, float y, float delay, float hold) {
            this.x = x;
            this.y = y;
            this.delay = delay;
            this.hold = hold;
        }
    }

    public static class Binding {
        public String key;
        public String type;
        public float x, y, r;
        public final List<Step> steps = new ArrayList<>();   // solo macros (steps[0] = x,y)
        public float rate = 10;                              // turbo: toques por segundo
        public float x2, y2, dur = 150;                      // deslizar: punto final y duracion (ms)
        public boolean dpad;                                 // joystick: la cruceta tambien lo mueve
        public int count = 5;                                // rafaga: cuantos toques
        public float gap = 80;                               // rafaga: ms entre toques

        Binding(String key, String type, float x, float y, float r) {
            this.key = key;
            this.type = type;
            this.x = x;
            this.y = y;
            this.r = r;
        }
    }

    public File file;
    public String pkg = "";
    public String name = "";                  // nombre del perfil (modo de juego), opcional
    public float sw = 2340, sh = 1080;
    public float deadzone = 0.18f;
    public String lsAxes = "", rsAxes = "";   // "X,Y" en hex, vacio = automatico
    public float lookY = 1f;
    public boolean lookInvert = false;
    public float lsDeadzone = -1, rsDeadzone = -1;           // -1 = usar 'deadzone'
    public float lsCurve = 1, rsCurve = 1;                   // 1 lineal, >1 mas suave al centro
    /** Apuntar: mientras se mantiene aimButton ("" = no), la camara va a aimScale. */
    public String aimButton = "";
    public float aimScale = 0.5f;
    /** La camara acelera hasta (1 + lookAccel) con el stick al tope (0 = sin aceleracion). */
    public float lookAccel = 0;
    /** Parte del nombre del mando que activa este perfil al conectarse ("" = cualquiera). */
    public String controller = "";
    /** Vibracion del mando al pulsar un boton mapeado (0 = no, 1 = fuerte). */
    public float rumble = 0;
    /** Solo sin root: camara con el giroscopio (sensibilidad, 0 = no) y raton (0 = no). */
    public float gyro = 0, mouse = 0;
    public String gyroButton = "";
    public boolean gyroInvert = false;
    /** Solo sin root: 2 = el segundo mando es el jugador 2 (sus botones son P2_*). */
    public int players = 1;
    public final Map<String, Binding> bindings = new LinkedHashMap<>();

    public float deadzoneOf(String stick) {
        float d = "LS".equals(stickBase(stick)) ? lsDeadzone : rsDeadzone;
        return d >= 0 ? d : deadzone;
    }

    public float curveOf(String stick) {
        return Math.max(0.3f, "LS".equals(stickBase(stick)) ? lsCurve : rsCurve);
    }

    /** Paquete de la app: su carpeta propia es Android/data/<PKG>/files. */
    public static final String PKG = "com.gamepadmapper.app";
    /** Carpeta de versiones anteriores (requeria el permiso "acceso a todos los archivos"). */
    public static final String LEGACY_DIR = "gamepad-mapper";

    /**
     * Carpeta de datos: la propia de la app en el almacenamiento compartido
     * (/sdcard/Android/data/com.gamepadmapper.app/files). No necesita ningun permiso, y la pueden
     * leer el motor root (gpmapper como root) y el modo Shizuku (usuario shell).
     */
    public static File baseDir() {
        return new File(Environment.getExternalStorageDirectory(), "Android/data/" + PKG + "/files");
    }

    /** Crea la carpeta (con el dueno y permisos correctos) y la de perfiles. Llamar al arrancar. */
    public static void init(android.content.Context c) {
        File d = c.getExternalFilesDir(null);
        if (d != null) {
            //noinspection ResultOfMethodCallIgnored
            new File(d, "profiles").mkdirs();
        }
    }

    public static File profilesDir() {
        return new File(baseDir(), "profiles");
    }

    /** Nombre visible: el nombre del perfil o, si no tiene, el del archivo. */
    public String displayName() {
        if (!name.isEmpty()) return name;
        String n = file != null ? file.getName() : pkg;
        return n.endsWith(".conf") ? n.substring(0, n.length() - 5) : n;
    }

    public static boolean isStick(String key) {
        String k = stickBase(key);
        return "LS".equals(k) || "RS".equals(k);
    }

    /** "P2_LS" -> "LS" (los sticks del jugador 2 usan los mismos ajustes). */
    public static String stickBase(String key) {
        return key != null && key.startsWith("P2_") ? key.substring(3) : key;
    }

    /** Nombre legible de un boton/eje del perfil ("L2+A" con capa). */
    public static String label(String key) {
        String mod = modOf(key);
        if (!mod.isEmpty()) return label1(mod) + "+" + label1(baseOf(key));
        return label1(key);
    }

    private static String label1(String key) {
        if (key.startsWith("P2_")) return L.t("J2 ") + label1(key.substring(3));
        if (key.startsWith("KB_")) return key.substring(3);
        if (key.startsWith("MOUSE_")) {
            switch (key) {
                case "MOUSE_LEFT": return L.t("Clic izq.");
                case "MOUSE_RIGHT": return L.t("Clic der.");
                case "MOUSE_MIDDLE": return L.t("Clic rueda");
                case "MOUSE_WHEEL_UP": return L.t("Rueda ↑");
                case "MOUSE_WHEEL_DOWN": return L.t("Rueda ↓");
                default: return L.t("Ratón ") + key.substring(6);
            }
        }
        if (key.startsWith("AXIS_")) return L.t("Eje ") + key.substring(5);
        if (key.startsWith("BTN_")) return L.t("Btn ") + key.substring(4);
        if (key.startsWith("DPAD_")) {
            switch (key) {
                case "DPAD_UP": return L.t("D-arr");
                case "DPAD_DOWN": return L.t("D-abj");
                case "DPAD_LEFT": return L.t("D-izq");
                default: return L.t("D-der");
            }
        }
        return key;
    }

    public static Profile load(File f) throws IOException {
        Profile p = new Profile();
        p.file = f;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            read(p, r);
        }
        return p;
    }

    /** Perfil a partir de su texto (sin archivo): para la vista previa de los perfiles de la comunidad. */
    public static Profile parse(String text) {
        Profile p = new Profile();
        try (BufferedReader r = new BufferedReader(new java.io.StringReader(text))) {
            read(p, r);
        } catch (IOException ignored) {
            // un StringReader no falla
        }
        return p;
    }

    private static void read(Profile p, BufferedReader r) throws IOException {
        {
            String line;
            while ((line = r.readLine()) != null) {
                int hash = line.indexOf('#');
                if (hash >= 0) line = line.substring(0, hash);
                line = line.trim();
                int eq = line.indexOf('=');
                if (line.isEmpty() || eq < 0) continue;
                String key = line.substring(0, eq).trim();
                String val = line.substring(eq + 1).trim();
                String k = key.toLowerCase(Locale.ROOT);
                try {
                    switch (k) {
                        case "package": p.pkg = val; break;
                        case "name": p.name = val; break;
                        case "screen": {
                            String[] wh = val.toLowerCase(Locale.ROOT).split("x");
                            p.sw = Float.parseFloat(wh[0].trim());
                            p.sh = Float.parseFloat(wh[1].trim());
                            break;
                        }
                        case "deadzone": p.deadzone = Float.parseFloat(val); break;
                        case "ls_axes": p.lsAxes = val.replace(" ", ""); break;
                        case "rs_axes": p.rsAxes = val.replace(" ", ""); break;
                        case "ls_deadzone": p.lsDeadzone = Float.parseFloat(val); break;
                        case "rs_deadzone": p.rsDeadzone = Float.parseFloat(val); break;
                        case "ls_curve": p.lsCurve = Float.parseFloat(val); break;
                        case "rs_curve": p.rsCurve = Float.parseFloat(val); break;
                        case "look_y": p.lookY = Float.parseFloat(val); break;
                        case "look_invert": p.lookInvert = !"0".equals(val.trim()); break;
                        case "aim_button": p.aimButton = cleanButton(val); break;
                        case "aim_scale": p.aimScale = clamp(Float.parseFloat(val), 0.1f, 2f); break;
                        case "look_accel": p.lookAccel = clamp(Float.parseFloat(val), 0f, 3f); break;
                        case "controller": p.controller = cleanController(val); break;
                        case "rumble": p.rumble = clamp(Float.parseFloat(val), 0f, 1f); break;
                        case "gyro": p.gyro = clamp(Float.parseFloat(val), 0f, 5f); break;
                        case "gyro_button": p.gyroButton = cleanButton(val); break;
                        case "gyro_invert": p.gyroInvert = !"0".equals(val.trim()); break;
                        case "mouse": p.mouse = clamp(Float.parseFloat(val), 0f, 5f); break;
                        case "players": p.players = "2".equals(val.trim()) ? 2 : 1; break;
                        default: {
                            String[] t = val.split("\\s+");
                            String type = t[0].toLowerCase(Locale.ROOT);
                            String name = key.toUpperCase(Locale.ROOT).replace(" ", "");
                            if (type.equals(MACRO)) {
                                Binding b = new Binding(name, MACRO, 0, 0, 0);
                                for (String part : val.substring(5).split(";")) {
                                    String[] s = part.trim().split("\\s+");
                                    if (s.length < 2 || s[0].isEmpty()) continue;
                                    b.steps.add(new Step(f(s[0]), f(s[1]), s.length > 2 ? f(s[2]) : 0,
                                            s.length > 3 ? f(s[3]) : 40));
                                }
                                if (!b.steps.isEmpty()) {
                                    b.x = b.steps.get(0).x;
                                    b.y = b.steps.get(0).y;
                                    p.bindings.put(name, b);
                                }
                            } else if ((type.equals(TAP) || type.equals(TOGGLE) || type.equals(QUICK)) && t.length >= 3) {
                                p.bindings.put(name, new Binding(name, type, f(t[1]), f(t[2]), 0));
                            } else if (type.equals(BURST) && t.length >= 3) {
                                Binding b = new Binding(name, BURST, f(t[1]), f(t[2]), 0);
                                if (t.length >= 4) b.count = Math.max(BURST_MIN, Math.min(BURST_MAX, Math.round(f(t[3]))));
                                if (t.length >= 5) b.gap = Math.max(BURST_GAP_MIN, Math.min(BURST_GAP_MAX, f(t[4])));
                                p.bindings.put(name, b);
                            } else if (type.equals(TURBO) && t.length >= 3) {
                                Binding b = new Binding(name, TURBO, f(t[1]), f(t[2]), 0);
                                if (t.length >= 4) b.rate = Math.max(1, Math.min(30, f(t[3])));
                                p.bindings.put(name, b);
                            } else if (type.equals(SWIPE) && t.length >= 5) {
                                Binding b = new Binding(name, SWIPE, f(t[1]), f(t[2]), 0);
                                b.x2 = f(t[3]);
                                b.y2 = f(t[4]);
                                if (t.length >= 6) b.dur = Math.max(20, f(t[5]));
                                p.bindings.put(name, b);
                            } else if ((type.equals(STICK) || type.equals(LOOK)) && t.length >= 4) {
                                Binding b = new Binding(name, type, f(t[1]), f(t[2]), f(t[3]));
                                b.dpad = type.equals(STICK) && t.length >= 5 && "dpad".equalsIgnoreCase(t[4]);
                                p.bindings.put(name, b);
                            }
                        }
                    }
                } catch (RuntimeException ignored) {
                    // linea mal formada: se ignora (gpmapper tambien la ignora)
                }
            }
        }
    }

    private static float f(String s) {
        return Float.parseFloat(s);
    }

    private static float clamp(float v, float lo, float hi) {
        return Float.isNaN(v) ? lo : Math.max(lo, Math.min(hi, v));
    }

    /** Nombre de boton (L2, BTN_13A...) o "" si no es valido. */
    static String cleanButton(String v) {
        String b = v.trim().toUpperCase(Locale.ROOT);
        return b.matches("[A-Z][A-Z0-9_]{0,15}") && !isStick(b) ? b : "";
    }

    /** Texto a buscar en el nombre del mando (sin caracteres raros, como mucho 40). */
    static String cleanController(String v) {
        String c = v.replaceAll("[^A-Za-z0-9 ._()+-]", "").trim();
        return c.length() > 40 ? c.substring(0, 40).trim() : c;
    }

    /** ¿Este perfil es para el mando 'padName'? (sin 'controller' no se elige automaticamente). */
    public boolean matchesController(String padName) {
        return !controller.isEmpty() && padName != null
                && padName.toLowerCase(Locale.ROOT).contains(controller.toLowerCase(Locale.ROOT));
    }

    /** Teclas de teclado (KB_*) y raton (MOUSE_*): solo las entiende el modo sin root. */
    public static boolean isNonRootInput(String key) {
        String base = baseOf(key);
        return base.startsWith("KB_") || base.startsWith("MOUSE_") || base.startsWith("P2_") || key.startsWith("P2_");
    }

    /** Numero sin ceros sobrantes: 1.5 -> "1.5", 40.0 -> "40". */
    public static String num(float v) {
        float r = Math.round(v * 10) / 10f;
        return r == (long) r ? String.valueOf((long) r) : String.format(Locale.ROOT, "%.1f", r);
    }

    /** Convierte un boton a macro (1 paso en su posicion) o de vuelta a toque (posicion del paso 1). */
    public void setMacro(Binding b, boolean macro) {
        setButtonType(b, macro ? MACRO : TAP);
    }

    /** Cambia el tipo de un boton (toque, turbo, interruptor, deslizar, macro) conservando su sitio. */
    public void setButtonType(Binding b, String type) {
        if (type.equals(b.type)) return;
        if (MACRO.equals(b.type) && !b.steps.isEmpty()) {
            b.x = b.steps.get(0).x;
            b.y = b.steps.get(0).y;
        }
        b.steps.clear();
        if (MACRO.equals(type)) b.steps.add(new Step(b.x, b.y, 0, 40));
        if (SWIPE.equals(type)) {
            // Punto final por defecto: un poco hacia arriba (deslizar hacia arriba es lo mas comun).
            float d = Math.min(sw, sh) * 0.18f;
            b.x2 = b.x;
            b.y2 = Math.max(0, b.y - d);
            if (b.y2 == b.y) b.y2 = Math.min(sh - 1, b.y + d);
        }
        b.type = type;
    }

    // ------------------------------------------------------------------ otras pantallas
    /*
     * Adaptar un perfil a otra pantalla como lo hacen los juegos con su interfaz: el tamano sigue
     * a la altura (en horizontal) y cada boton conserva su distancia al borde mas cercano (los de
     * la izquierda a la izquierda, los de la derecha a la derecha, los del centro centrados), con
     * una transicion suave entre zonas. Con la misma proporcion de pantalla es un escalado normal.
     * gpmapper.c (fit_x / fit_y) usa exactamente la misma formula: si se cambia, cambiar las dos.
     */

    /** Peso del anclaje derecho (o inferior) para una posicion relativa t en 0..1. */
    private static float anchor(float t) {
        float w = (t - 0.25f) / 0.5f;
        w = w < 0 ? 0 : (w > 1 ? 1 : w);
        return w * w * (3 - 2 * w);
    }

    /** Factor de tamano al pasar de una pantalla sw x sh a otra w x h. */
    public static float fitScale(float sw, float sh, float w, float h) {
        return sw >= sh ? h / sh : w / sw;
    }

    public static float fitX(float x, float sw, float sh, float w, float h) {
        if (sw < sh) return x * w / sw;
        float s = h / sh;
        return x * s + anchor(x / sw) * (w - sw * s);
    }

    public static float fitY(float y, float sw, float sh, float w, float h) {
        if (sw >= sh) return y * h / sh;
        float s = w / sw;
        return y * s + anchor(y / sh) * (h - sh * s);
    }

    /** Adapta todas las coordenadas a un nuevo tamano de pantalla (ver fitX / fitY). */
    public void rescaleTo(float newW, float newH) {
        if (newW <= 0 || newH <= 0 || (newW == sw && newH == sh)) return;
        float k = fitScale(sw, sh, newW, newH);
        for (Binding b : bindings.values()) {
            float x = b.x, y = b.y, x2 = b.x2, y2 = b.y2;
            b.x = fitX(x, sw, sh, newW, newH);
            b.y = fitY(y, sw, sh, newW, newH);
            b.x2 = fitX(x2, sw, sh, newW, newH);
            b.y2 = fitY(y2, sw, sh, newW, newH);
            if (STICK.equals(b.type)) b.r *= k;
            for (Step s : b.steps) {
                float sx = s.x, sy = s.y;
                s.x = fitX(sx, sw, sh, newW, newH);
                s.y = fitY(sy, sw, sh, newW, newH);
            }
        }
        sw = newW;
        sh = newH;
    }

    public Binding add(String key, float x, float y) {
        Binding b;
        if ("RS".equals(stickBase(key))) b = new Binding(key, LOOK, x, y, 14);   // stick derecho: camara
        else if (isStick(key)) b = new Binding(key, STICK, x, y, Math.round(Math.min(sw, sh) * 0.14f));
        else b = new Binding(key, TAP, x, y, 0);
        bindings.put(key, b);
        return b;
    }

    /** Cambia el boton asignado a un circulo. Si otro circulo lo usaba, se intercambian. */
    public void rekey(Binding b, String newKey) {
        if (newKey.equals(b.key)) return;
        Binding other = bindings.get(newKey);
        // Reconstruir en el mismo orden para no reordenar el archivo innecesariamente.
        List<Binding> all = new ArrayList<>(bindings.values());
        bindings.clear();
        String old = b.key;
        b.key = newKey;
        if (other != null) other.key = old;
        for (Binding x : all) bindings.put(x.key, x);
    }

    /** Botones que se usan como modificador de alguna capa (no tocan por si solos). */
    public java.util.Set<String> modifiersInUse() {
        java.util.Set<String> s = new java.util.HashSet<>();
        for (String k : bindings.keySet()) {
            String m = modOf(k);
            if (!m.isEmpty()) s.add(m);
        }
        return s;
    }

    /** Distribucion inicial tipica de un juego horizontal. */
    public void addDefaults() {
        float w = sw, h = sh;
        add("A", w * 0.85f, h * 0.83f);
        add("B", w * 0.93f, h * 0.69f);
        add("X", w * 0.77f, h * 0.69f);
        add("Y", w * 0.85f, h * 0.56f);
        add("LS", w * 0.17f, h * 0.68f).dpad = true;   // joystick + cruceta en un solo circulo
    }

    /**
     * Joystick con cruceta: un solo circulo (LS) que mueven el stick izquierdo y la cruceta.
     * Quita los circulos sueltos de la cruceta (ahora los cubre el joystick). Devuelve el LS.
     */
    public Binding addJoystickWithDpad(float x, float y) {
        Binding b = bindings.get("LS");
        if (b == null || !STICK.equals(b.type)) {
            if (b != null) bindings.remove("LS");
            b = add("LS", x, y);
        }
        b.dpad = true;
        for (String k : new String[]{"DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"}) bindings.remove(k);
        return b;
    }

    public void save() throws IOException {
        File dir = file.getParentFile();
        if (dir != null && !dir.exists() && !dir.mkdirs()) throw new IOException("No se pudo crear " + dir);
        // Escribir a un temporal y renombrar: gpmapper nunca ve un archivo a medias.
        File tmp = new File(dir, file.getName() + ".tmp");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            w.write("# Perfil creado con la app Gamepad Mapper Plutón\n");
            w.write("package = " + pkg + "\n");
            if (!name.isEmpty()) w.write("name = " + name.replace("#", "").replace("\n", " ").trim() + "\n");
            w.write("screen = " + Math.round(sw) + "x" + Math.round(sh) + "\n");
            w.write(String.format(Locale.ROOT, "deadzone = %.2f\n", deadzone));
            if (!lsAxes.isEmpty()) w.write("ls_axes = " + lsAxes + "\n");
            if (!rsAxes.isEmpty()) w.write("rs_axes = " + rsAxes + "\n");
            if (lsDeadzone >= 0) w.write(String.format(Locale.ROOT, "ls_deadzone = %.2f\n", lsDeadzone));
            if (rsDeadzone >= 0) w.write(String.format(Locale.ROOT, "rs_deadzone = %.2f\n", rsDeadzone));
            if (lsCurve != 1) w.write(String.format(Locale.ROOT, "ls_curve = %.2f\n", lsCurve));
            if (rsCurve != 1) w.write(String.format(Locale.ROOT, "rs_curve = %.2f\n", rsCurve));
            w.write(String.format(Locale.ROOT, "look_y = %.2f\n", lookY));
            w.write("look_invert = " + (lookInvert ? 1 : 0) + "\n");
            if (!aimButton.isEmpty()) {
                w.write("aim_button = " + aimButton + "\n");
                w.write(String.format(Locale.ROOT, "aim_scale = %.2f\n", aimScale));
            }
            if (lookAccel > 0) w.write(String.format(Locale.ROOT, "look_accel = %.2f\n", lookAccel));
            if (!controller.isEmpty()) w.write("controller = " + controller + "\n");
            if (rumble > 0) w.write(String.format(Locale.ROOT, "rumble = %.2f\n", rumble));
            if (gyro > 0) {
                w.write(String.format(Locale.ROOT, "gyro = %.2f\n", gyro));
                if (!gyroButton.isEmpty()) w.write("gyro_button = " + gyroButton + "\n");
                if (gyroInvert) w.write("gyro_invert = 1\n");
            }
            if (mouse > 0) w.write(String.format(Locale.ROOT, "mouse = %.2f\n", mouse));
            if (players == 2) w.write("players = 2\n");
            w.write("\n");
            List<String> keys = new ArrayList<>(Arrays.asList(BUTTONS));
            List<String> extra = new ArrayList<>();
            for (String k : bindings.keySet()) if (!keys.contains(k)) extra.add(k);
            Collections.sort(extra);
            keys.addAll(extra);
            for (String key : keys) {
                Binding b = bindings.get(key);
                if (b == null) continue;
                if (TAP.equals(b.type) || TOGGLE.equals(b.type) || QUICK.equals(b.type)) {
                    w.write(String.format(Locale.ROOT, "%s = %s %d %d\n", key, b.type, Math.round(b.x), Math.round(b.y)));
                } else if (BURST.equals(b.type)) {
                    w.write(String.format(Locale.ROOT, "%s = burst %d %d %d %s\n", key, Math.round(b.x), Math.round(b.y),
                            b.count, num(b.gap)));
                } else if (TURBO.equals(b.type)) {
                    w.write(String.format(Locale.ROOT, "%s = turbo %d %d %s\n", key, Math.round(b.x), Math.round(b.y),
                            num(b.rate)));
                } else if (SWIPE.equals(b.type)) {
                    w.write(String.format(Locale.ROOT, "%s = swipe %d %d %d %d %s\n", key, Math.round(b.x),
                            Math.round(b.y), Math.round(b.x2), Math.round(b.y2), num(b.dur)));
                } else if (MACRO.equals(b.type)) {
                    StringBuilder sb = new StringBuilder(key).append(" = macro");
                    for (int i = 0; i < b.steps.size(); i++) {
                        Step s = b.steps.get(i);
                        sb.append(i == 0 ? " " : "; ").append(String.format(Locale.ROOT, "%d %d %s %s",
                                Math.round(s.x), Math.round(s.y), num(s.delay), num(s.hold)));
                    }
                    w.write(sb.append('\n').toString());
                } else {
                    w.write(String.format(Locale.ROOT, "%s = %s %d %d %d%s\n", key, b.type,
                            Math.round(b.x), Math.round(b.y), Math.round(b.r),
                            STICK.equals(b.type) && b.dpad ? " dpad" : ""));
                }
            }
        }
        if (!tmp.renameTo(file)) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
            if (!tmp.renameTo(file)) throw new IOException("No se pudo guardar " + file);
        }
    }
}
