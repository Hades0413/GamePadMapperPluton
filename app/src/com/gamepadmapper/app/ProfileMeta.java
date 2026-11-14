package com.gamepadmapper.app;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Datos del perfil para quien lo recibe, como COMENTARIOS al principio del texto que se comparte,
 * exporta o sube (las versiones antiguas de la app y de gpmapper ignoran las lineas con #):
 * <pre>
 * # modelo: Redmi Note 9
 * # mando: Wireless Controller (054c:05c4)
 * # pantalla: 2400x1080
 * </pre>
 * Nada mas: ni nombres de cuenta, ni ids del telefono, ni rutas. Las claves van siempre en
 * espanol (la web las lee para rellenar el formulario), sea cual sea el idioma de la app.
 * El archivo del perfil no se toca: solo el texto que sale del telefono. Sin Android (se prueba en
 * tests/ProfileMetaTest); el mando conectado lo busca CurrentPad.
 */
public final class ProfileMeta {
    private ProfileMeta() {
    }

    static final String MODEL = "modelo", PAD = "mando", SCREEN = "pantalla";
    /** Caracteres que admite la web (y la base de datos) en el nombre del mando. */
    private static final Pattern NOT_ALLOWED = Pattern.compile("[^A-Za-z0-9 ._()+/:-]");
    private static final Pattern META_LINE = Pattern.compile("^\\s*#\\s*(modelo|mando|pantalla)\\s*:.*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SCREEN_LINE = Pattern.compile("^\\s*screen\\s*=\\s*(\\d{2,5})\\s*x\\s*(\\d{2,5})\\s*(#.*)?$",
            Pattern.CASE_INSENSITIVE);

    // ---------------------------------------------------------------- texto (sin Android)

    /**
     * El perfil con los datos al principio. Quita antes las lineas de datos que ya tuviera al
     * principio (un perfil recibido de otro telefono lleva las suyas) para no repetirlas.
     */
    public static String add(String conf, String model, String pad) {
        String text = conf.replace("\r\n", "\n");
        String[] lines = text.split("\n", -1);
        int from = 0;
        while (from < lines.length && META_LINE.matcher(lines[from]).matches()) from++;
        StringBuilder rest = new StringBuilder();
        for (int i = from; i < lines.length; i++) {
            rest.append(lines[i]);
            if (i < lines.length - 1) rest.append('\n');
        }
        return header(rest.toString(), model, pad) + rest;
    }

    /** Solo las lineas de datos (terminadas en \n), o "" si no hay ninguno. */
    public static String header(String conf, String model, String pad) {
        StringBuilder b = new StringBuilder();
        String m = cleanModel(model);
        String p = cleanPad(pad);
        String s = screen(conf);
        if (!m.isEmpty()) b.append("# ").append(MODEL).append(": ").append(m).append('\n');
        if (!p.isEmpty()) b.append("# ").append(PAD).append(": ").append(p).append('\n');
        if (!s.isEmpty()) b.append("# ").append(SCREEN).append(": ").append(s).append('\n');
        return b.toString();
    }

    /** "2400x1080" de la linea screen = del perfil, o "". */
    static String screen(String conf) {
        for (String line : conf.split("\n")) {
            Matcher mt = SCREEN_LINE.matcher(line.replace("\r", ""));
            if (mt.matches()) {
                int w = Integer.parseInt(mt.group(1)), h = Integer.parseInt(mt.group(2));
                if (w >= 100 && h >= 100 && w <= 20000 && h <= 20000) return w + "x" + h;
            }
        }
        return "";
    }

    /** Modelo del telefono con los mismos caracteres que Community.deviceModel(). */
    static String cleanModel(String s) {
        if (s == null) return "";
        String v = s.replaceAll("[^A-Za-z0-9 ._()+/-]", "").replaceAll("\\s+", " ").trim();
        if (v.length() > 60) v = v.substring(0, 60).trim();
        return v.length() >= 2 && Character.isLetterOrDigit(v.charAt(0)) ? v : "";
    }

    /** "Nombre (vvvv:pppp)": una linea, sin # ni caracteres raros, 2 a 60 caracteres. */
    public static String pad(String name, int vendor, int product) {
        String n = cleanName(name);
        boolean ids = vendor > 0 && vendor <= 0xffff && product >= 0 && product <= 0xffff;
        if (!ids) return cleanPad(n);
        if (n.length() > 47) n = n.substring(0, 47).trim();
        if (n.isEmpty()) n = "Gamepad";
        return cleanPad(String.format(Locale.ROOT, "%s (%04x:%04x)", n, vendor, product));
    }

    /** Valor ya formado (de la preferencia o de otro sitio): se vuelve a limpiar. */
    public static String cleanPad(String s) {
        String v = cleanName(s);
        if (v.length() > 60) v = v.substring(0, 60).trim();
        return v.length() >= 2 ? v : "";
    }

    private static String cleanName(String s) {
        if (s == null) return "";
        String v = NOT_ALLOWED.matcher(s).replaceAll("").replaceAll("\\s+", " ").trim();
        int i = 0;
        while (i < v.length() && !Character.isLetterOrDigit(v.charAt(i))) i++;   // empieza por letra o numero
        return v.substring(i).trim();
    }
}
