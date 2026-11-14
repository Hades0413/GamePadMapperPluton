package com.gamepadmapper.app;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Mandos genericos en modo root: SDL GameControllerDB y los mandos de la comunidad.
 * <p>
 * gpmapper lee el mando "en crudo" (evdev) y algunos mandos genericos mandan codigos raros
 * (A como BTN_C, el stick derecho en Z/RZ...). Al conectarlo, gpmapper escribe
 * {@code <base>/mando_info} (bus, ids, nombre y los codigos que tiene). Aqui se calcula su GUID
 * como SDL, se busca su linea {@code platform:Linux} y se traduce a una tabla
 * {@code <base>/mando.map} ("codigo crudo = nombre estandar", ver mapper/src/core/gpm_core.h) que
 * gpmapper aplica antes del perfil.
 * <p>
 * Solo Java estandar (sin Android): lo prueba tests/SdlMappingTest.java. Misma regla que
 * desktop/app/nucleo/src/mapeo/sdl.rs (GUID) y dispositivos/linux.rs (numeracion de SDL en Linux).
 */
public final class SdlMapping {
    static final int BTN_JOYSTICK = 0x120, KEY_MAX = 0x2ff, ABS_MAX = 0x3f;
    static final int ABS_HAT0X = 0x10, ABS_HAT3Y = 0x17;
    /** Una linea SDL real ocupa unos 300 bytes. */
    public static final int MAX_LINE = 1024;

    private static final Pattern GUID = Pattern.compile("^[0-9a-f]{32}$");
    private static final Pattern VALUE = Pattern.compile("^[+-]?(b[0-9]{1,3}|a[0-9]{1,2}~?|h[0-9]{1,2}\\.(1|2|4|8))$");

    private SdlMapping() {
    }

    // ---------------------------------------------------------------- GUID

    /** CRC-16 de SDL (SDL_crc16: CRC-16/ARC, polinomio 0xA001 reflejado). */
    public static int crc16(byte[] data) {
        int crc = 0;
        for (byte b : data) {
            crc ^= b & 0xff;
            for (int i = 0; i < 8; i++) crc = (crc & 1) != 0 ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
        }
        return crc & 0xffff;
    }

    /**
     * GUID de SDL2 (2.26 o posterior) de un mando: bus, CRC16 del nombre, fabricante, producto y
     * version en little-endian. Sin fabricante ni producto, SDL pone el nombre en lugar de los ids.
     */
    public static String guid(int bus, int vendor, int product, int version, String name) {
        byte[] g = new byte[16];
        put16(g, 0, bus);
        byte[] nb = name == null ? new byte[0] : name.getBytes(StandardCharsets.UTF_8);
        put16(g, 2, nb.length == 0 ? 0 : crc16(nb));
        if (vendor != 0 || product != 0) {
            put16(g, 4, vendor);
            put16(g, 8, product);
            put16(g, 12, version);
        } else {
            // 11 bytes de nombre como maximo y un 0 final (SDL_strlcpy en 12 bytes).
            System.arraycopy(nb, 0, g, 4, Math.min(11, nb.length));
        }
        StringBuilder s = new StringBuilder(32);
        for (byte b : g) s.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return s.toString();
    }

    private static void put16(byte[] g, int at, int v) {
        g[at] = (byte) (v & 0xff);
        g[at + 1] = (byte) ((v >> 8) & 0xff);
    }

    /**
     * GUID a buscar, en orden (como SDL): el exacto, sin el CRC del nombre y ademas sin version
     * (las entradas antiguas de la base no los llevan).
     */
    public static List<String> variants(String guid) {
        List<String> v = new ArrayList<>();
        v.add(guid);
        if (guid.length() == 32) {
            String noCrc = guid.substring(0, 4) + "0000" + guid.substring(8);
            String noVersion = noCrc.substring(0, 24) + "0000" + noCrc.substring(28);
            if (!v.contains(noCrc)) v.add(noCrc);
            if (!v.contains(noVersion)) v.add(noVersion);
        }
        return v;
    }

    // ---------------------------------------------------------------- mando conectado (mando_info)

    /** Lo que gpmapper sabe del mando conectado (de {@code <base>/mando_info}). */
    public static final class Info {
        public int bus, vendor, product, version;
        public String name = "";
        /** Codigos EV_KEY y EV_ABS que tiene, en orden. */
        public int[] keys = new int[0], abs = new int[0];

        public String guid() {
            return SdlMapping.guid(bus, vendor, product, version, name);
        }

        /**
         * ¿Manda codigos raros? Los mandos con un driver propio del kernel (Xbox, PlayStation...) ya
         * llegan normalizados (BTN_SOUTH, BTN_EAST...) y no se tocan; los genericos (HID de joystick,
         * BTN_TRIGGER, BTN_THUMB...) si se traducen.
         */
        public boolean nonStandard() {
            boolean south = has(keys, 0x130), east = has(keys, 0x131);
            boolean joystick = false;
            for (int k : keys) if (k >= BTN_JOYSTICK && k < 0x130) joystick = true;
            return !south || !east || joystick;
        }

        /** Lee el archivo (formato clave=valor de gpmapper). Devuelve null si no es valido. */
        public static Info parse(String text) {
            if (text == null || text.length() > 16384) return null;
            Info in = new Info();
            boolean ids = false;
            for (String line : text.split("\n")) {
                int eq = line.indexOf('=');
                if (eq <= 0) continue;
                String k = line.substring(0, eq).trim(), v = line.substring(eq + 1).trim();
                try {
                    switch (k) {
                        case "bus": in.bus = hex16(v); break;
                        case "vendor": in.vendor = hex16(v); ids = true; break;
                        case "product": in.product = hex16(v); break;
                        case "version": in.version = hex16(v); break;
                        case "name": in.name = v.length() > 127 ? v.substring(0, 127) : v; break;
                        case "keys": in.keys = hexList(v, KEY_MAX); break;
                        case "abs": in.abs = hexList(v, ABS_MAX); break;
                        default: break;
                    }
                } catch (NumberFormatException e) {
                    return null;
                }
            }
            return ids && in.keys.length > 0 ? in : null;
        }

        /** Botones en el orden de SDL en Linux: desde BTN_JOYSTICK hasta el final, luego los de antes. */
        int[] sdlButtons() {
            int[] out = new int[keys.length];
            int n = 0;
            for (int k : keys) if (k >= BTN_JOYSTICK && k < KEY_MAX) out[n++] = k;
            for (int k : keys) if (k < BTN_JOYSTICK) out[n++] = k;
            return Arrays.copyOf(out, n);
        }

        /** Ejes en el orden de SDL: por codigo, saltando los hats. */
        int[] sdlAxes() {
            int[] out = new int[abs.length];
            int n = 0;
            for (int a : abs) if (a < ABS_MAX && (a < ABS_HAT0X || a > ABS_HAT3Y)) out[n++] = a;
            return Arrays.copyOf(out, n);
        }

        /** Hats en el orden de SDL: codigo de su eje X (el Y es el siguiente). */
        int[] sdlHats() {
            int[] out = new int[4];
            int n = 0;
            for (int base = ABS_HAT0X; base <= ABS_HAT3Y; base += 2)
                if (has(abs, base) || has(abs, base + 1)) out[n++] = base;
            return Arrays.copyOf(out, n);
        }
    }

    private static boolean has(int[] a, int v) {
        for (int x : a) if (x == v) return true;
        return false;
    }

    private static int hex16(String v) {
        int n = Integer.parseInt(v, 16);
        if (n < 0 || n > 0xffff) throw new NumberFormatException(v);
        return n;
    }

    private static int[] hexList(String v, int max) {
        if (v.isEmpty()) return new int[0];
        String[] parts = v.split(",");
        if (parts.length > 800) throw new NumberFormatException("demasiados");
        int[] out = new int[parts.length];
        for (int i = 0; i < parts.length; i++) {
            out[i] = Integer.parseInt(parts[i].trim(), 16);
            if (out[i] < 0 || out[i] > max) throw new NumberFormatException(parts[i]);
        }
        Arrays.sort(out);
        return out;
    }

    // ---------------------------------------------------------------- lineas SDL

    /** Una linea de SDL GameControllerDB validada. */
    public static final class Line {
        public final String guid, name, platform;
        /** control -> entrada (a:b0, leftx:a0...), sin platform. */
        public final Map<String, String> pairs;

        Line(String guid, String name, String platform, Map<String, String> pairs) {
            this.guid = guid;
            this.name = name;
            this.platform = platform;
            this.pairs = pairs;
        }

        /**
         * Lee y valida una linea (misma regla que private.canonical_sdl de la base de datos:
         * GUID de 32 hexadecimales, nombre de 2 a 80 caracteres sin &lt; &gt; ni controles, valores
         * bN, aN, aN~, +aN, -aN o hN.M). Devuelve null si no es valida o es un comentario.
         */
        public static Line parse(String line) {
            if (line == null) return null;
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#") || line.length() > MAX_LINE) return null;
            for (int i = 0; i < line.length(); i++) {
                char c = line.charAt(i);
                if (c < 0x20 || c == 0x7f) return null;
            }
            String[] parts = line.split(",");
            if (parts.length < 3) return null;
            String guid = parts[0].trim().toLowerCase(Locale.ROOT);
            String name = parts[1].trim().replaceAll("\\s+", " ");
            if (!GUID.matcher(guid).matches() || name.length() < 2 || name.length() > 80 || name.matches(".*[<>].*")) return null;
            Map<String, String> pairs = new LinkedHashMap<>();
            String platform = null;
            for (int i = 2; i < parts.length; i++) {
                String p = parts[i].trim();
                if (p.isEmpty()) continue;
                int colon = p.indexOf(':');
                if (colon <= 0) return null;
                String k = p.substring(0, colon), v = p.substring(colon + 1);
                if (k.equals("platform")) {
                    platform = v;
                    continue;
                }
                if (!k.matches("[+-]?[a-z0-9]{1,16}") || pairs.containsKey(k)) return null;
                if (!VALUE.matcher(v).matches()) {
                    if (k.startsWith("+") || k.startsWith("-") || TARGETS.get(k) == null) continue;   // extras: se ignoran
                    return null;
                }
                pairs.put(k, v);
            }
            return new Line(guid, name, platform, pairs);
        }
    }

    // ---------------------------------------------------------------- tabla para gpmapper

    /** Control de SDL -> nombre del perfil (botones) o eje estandar. Los gatillos dependen de la entrada. */
    private static final Map<String, String> TARGETS = new LinkedHashMap<>();

    static {
        String[][] t = {{"a", "A"}, {"b", "B"}, {"x", "X"}, {"y", "Y"}, {"back", "SELECT"}, {"guide", "HOME"},
                {"start", "START"}, {"leftstick", "L3"}, {"rightstick", "R3"}, {"leftshoulder", "L1"},
                {"rightshoulder", "R1"}, {"dpup", "DPAD_UP"}, {"dpdown", "DPAD_DOWN"}, {"dpleft", "DPAD_LEFT"},
                {"dpright", "DPAD_RIGHT"}, {"lefttrigger", "L2"}, {"righttrigger", "R2"},
                {"leftx", "ABS_X"}, {"lefty", "ABS_Y"}, {"rightx", "ABS_RX"}, {"righty", "ABS_RY"}};
        for (String[] p : t) TARGETS.put(p[0], p[1]);
    }

    /**
     * Tabla {@code mando.map} para este mando a partir de su linea SDL, o null si la linea no
     * encaja con el mando (hace referencia a botones o ejes que no tiene: seria de otro modelo o de
     * otro driver) o no aporta nada.
     */
    public static String buildMap(Info info, Line line, String source) {
        int[] buttons = info.sdlButtons(), axes = info.sdlAxes(), hats = info.sdlHats();
        List<String> rules = new ArrayList<>();
        // Cruceta estandar en un hat: se pasa entera como HAT0 (mismo comportamiento que un mando normal).
        int dpadHat = -1;
        String up = line.pairs.get("dpup"), down = line.pairs.get("dpdown"), left = line.pairs.get("dpleft"),
                right = line.pairs.get("dpright");
        if (up != null && up.matches("h[0-9]+\\.1")) {
            String h = up.substring(1, up.indexOf('.'));
            if (("h" + h + ".4").equals(down) && ("h" + h + ".8").equals(left) && ("h" + h + ".2").equals(right)) {
                int hi = Integer.parseInt(h);
                if (hi >= hats.length) return null;
                dpadHat = hats[hi];
                rules.add(rule("ABS_" + hex(dpadHat), "ABS_HAT0X"));
                rules.add(rule("ABS_" + hex(dpadHat + 1), "ABS_HAT0Y"));
            }
        }
        for (Map.Entry<String, String> e : line.pairs.entrySet()) {
            String target = TARGETS.get(e.getKey());
            if (target == null) continue;   // misc1, paddles, touchpad, medias salidas...
            String v = e.getValue();
            boolean dpad = e.getKey().startsWith("dp");
            if (dpad && dpadHat >= 0) continue;
            int sign = v.startsWith("+") ? 1 : v.startsWith("-") ? -1 : 0;
            if (sign != 0) v = v.substring(1);
            boolean invert = v.endsWith("~");
            if (invert) v = v.substring(0, v.length() - 1);
            boolean stick = target.startsWith("ABS_");
            boolean trigger = e.getKey().endsWith("trigger");
            if (v.charAt(0) == 'b') {
                int i = Integer.parseInt(v.substring(1));
                if (i >= buttons.length) return null;
                if (stick || sign != 0 || invert) continue;   // stick desde botones: no se admite
                rules.add(rule("BTN_" + hex(buttons[i]), target));
            } else if (v.charAt(0) == 'a') {
                int i = Integer.parseInt(v.substring(1));
                if (i >= axes.length) return null;
                String src = "ABS_" + hex(axes[i]);
                if (stick) {
                    if (sign != 0) continue;   // medio eje como stick: no se admite
                    rules.add(rule(src, target + (invert ? "~" : "")));
                } else if (trigger) {
                    // Gatillo analogico: eje Z / RZ (el motor mide desde el reposo); "-aN" = al reves.
                    rules.add(rule(src, (target.equals("L2") ? "ABS_Z" : "ABS_RZ") + (sign < 0 != invert ? "~" : "")));
                } else {
                    rules.add(rule(src + (sign < 0 != invert ? "-" : "+"), target));
                }
            } else {   // hN.M
                int dot = v.indexOf('.');
                int hi = Integer.parseInt(v.substring(1, dot)), mask = Integer.parseInt(v.substring(dot + 1));
                if (hi >= hats.length) return null;
                if (stick) continue;
                int code = mask == 1 || mask == 4 ? hats[hi] + 1 : hats[hi];
                rules.add(rule("ABS_" + hex(code) + (mask == 1 || mask == 8 ? "-" : "+"), target));
            }
        }
        if (rules.size() < 4) return null;
        StringBuilder s = new StringBuilder();
        s.append("# Gamepad Mapper Pluton: traduccion de este mando para gpmapper (la escribe la app).\n");
        s.append("# Origen: ").append(clean(source)).append(" · GUID ").append(line.guid).append('\n');
        s.append(String.format(Locale.ROOT, "mando %x %04x %04x %04x\n", info.bus, info.vendor, info.product, info.version));
        s.append("nombre ").append(clean(line.name)).append('\n');
        for (String r : rules) s.append(r).append('\n');
        return s.toString();
    }

    private static String rule(String src, String dst) {
        return src + " = " + dst;
    }

    private static String hex(int v) {
        return Integer.toHexString(v).toUpperCase(Locale.ROOT);
    }

    private static String clean(String s) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length() && b.length() < 80; i++) {
            char c = s.charAt(i);
            b.append(c < 0x20 || c == 0x7f || c == '#' ? ' ' : c);
        }
        return b.toString().trim();
    }
}
