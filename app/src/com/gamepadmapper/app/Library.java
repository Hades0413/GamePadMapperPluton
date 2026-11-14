package com.gamepadmapper.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Biblioteca de perfiles: catalogo index.json con perfiles listos para descargar.
 *
 * <pre>
 * {
 *   "presets": [
 *     { "name": "Downhill Revived", "package": "app.downhillrevived", "file": "downhill.conf",
 *       "author": "...", "description": "..." }
 *   ]
 * }
 * </pre>
 * "file" es relativo a la direccion del index.json y debe estar en el mismo sitio (solo https o
 * el catalogo incluido en la app).
 */
public final class Library {
    private static final int MAX_BYTES = 256 * 1024;
    /** Copias .zip: como mucho tantos perfiles y tantos bytes en total (evita llenar la memoria). */
    private static final int ZIP_MAX_ENTRIES = 300, ZIP_MAX_TOTAL = 4 * 1024 * 1024;
    /** Nombre de archivo de perfil permitido (sin rutas). */
    public static final String SAFE_CONF_NAME = "[A-Za-z0-9._-]{1,120}\\.conf";

    /**
     * Apps del sistema, tiendas, ajustes, permisos y herramientas de root: un perfil para ellas
     * convertiria el mando en toques elegidos por otra persona. Misma lista que la web
     * (web/src/domain/game/Game.ts) y la base de datos (private.is_sensitive_package).
     */
    private static final java.util.regex.Pattern SENSITIVE = java.util.regex.Pattern.compile(
            "^(android|com\\.android|com\\.google\\.android|com\\.miui|com\\.xiaomi|com\\.samsung\\.android"
                    + "|com\\.sec\\.android|com\\.oplus|com\\.coloros|com\\.huawei|com\\.hihonor|com\\.oneplus"
                    + "|com\\.motorola|com\\.lineageos|org\\.lineageos|com\\.topjohnwu|io\\.github\\.huskydg"
                    + "|me\\.weishu|moe\\.shizuku|rikka\\.shizuku|com\\.gamepadmapper)(\\.|$)",
            java.util.regex.Pattern.CASE_INSENSITIVE);

    public static boolean isSensitivePackage(String pkg) {
        return pkg != null && SENSITIVE.matcher(pkg.trim()).find();
    }

    public static final class Entry {
        public String name, pkg, file, author, description;
    }

    private Library() {
    }

    /** Catalogo que viene dentro de la app (assets/presets). */
    public static final String BUILTIN = "asset:presets/index.json";
    private static android.content.Context app;

    public static void init(android.content.Context c) {
        app = c.getApplicationContext();
    }

    /**
     * Catalogo por defecto: el index.json del repositorio en GitHub (si RootMode.REPO_URL esta
     * configurada) o el incluido en la app.
     */
    public static String defaultCatalog() {
        if (RootMode.hasRepo() && RootMode.REPO_URL.startsWith("https://github.com/")) {
            String path = RootMode.REPO_URL.substring("https://github.com/".length()).replaceAll("/+$", "");
            return "https://raw.githubusercontent.com/" + path + "/main/presets/index.json";
        }
        return BUILTIN;
    }

    public static String sourceName(String url) {
        return BUILTIN.equals(url) ? L.t("Incluido en la app") : url;
    }

    /** Descarga texto (UTF-8) de una URL http(s), file o asset:. Llamar fuera del hilo principal. */
    public static String fetch(String url) throws IOException {
        if (url.startsWith("asset:")) {
            if (app == null) throw new IOException(L.t("Catálogo interno no disponible"));
            try (InputStream in = app.getAssets().open(url.substring(6))) {
                return readLimited(in);
            }
        }
        if (!url.startsWith("https://")) throw new IOException(L.t("Solo se admiten direcciones https://"));
        URLConnection c = new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(15000);
        if (c instanceof HttpURLConnection) {
            HttpURLConnection h = (HttpURLConnection) c;
            h.setRequestProperty("User-Agent", "GamepadMapper");
            int code = h.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code + " en " + url);
        }
        try (InputStream in = c.getInputStream()) {
            return readLimited(in);
        }
    }

    public static String readLimited(InputStream in) throws IOException {
        return new String(readBytes(in, MAX_BYTES), StandardCharsets.UTF_8);
    }

    public static byte[] readBytes(InputStream in, int max) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > max) throw new IOException(L.t("Archivo demasiado grande"));
        }
        return out.toByteArray();
    }

    // ---------------------------------------------------------------- copias de seguridad .zip
    /** Escribe todos los perfiles (y active.txt) en un .zip. Devuelve cuantos perfiles. */
    public static int exportZip(java.io.OutputStream os) throws IOException {
        File[] confs = Profile.profilesDir().listFiles((d, n) -> n.endsWith(".conf"));
        int count = 0;
        try (java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(os)) {
            if (confs != null) {
                for (File f : confs) {
                    zos.putNextEntry(new java.util.zip.ZipEntry("profiles/" + f.getName()));
                    try (InputStream in = new java.io.FileInputStream(f)) {
                        zos.write(readBytes(in, MAX_BYTES));
                    }
                    zos.closeEntry();
                    count++;
                }
            }
            File act = new File(Profile.baseDir(), "active.txt");
            if (act.exists()) {
                zos.putNextEntry(new java.util.zip.ZipEntry("active.txt"));
                try (InputStream in = new java.io.FileInputStream(act)) {
                    zos.write(readBytes(in, MAX_BYTES));
                }
                zos.closeEntry();
            }
        }
        return count;
    }

    /** Perfil leido de un .zip: nombre de archivo y contenido. */
    public static final class ZipProfile {
        public final String fileName, conf, pkg;

        ZipProfile(String fileName, String conf, String pkg) {
            this.fileName = fileName;
            this.conf = conf;
            this.pkg = pkg;
        }
    }

    /** Lee los .conf validos de una copia .zip (ignora el resto). */
    public static List<ZipProfile> readZip(byte[] zip) throws IOException {
        List<ZipProfile> out = new ArrayList<>();
        try (java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(zip))) {
            java.util.zip.ZipEntry e;
            int entries = 0;
            long total = 0;
            while ((e = zis.getNextEntry()) != null) {
                if (++entries > ZIP_MAX_ENTRIES) throw new IOException(L.t("La copia tiene demasiados archivos"));
                if (e.isDirectory()) continue;
                String name = e.getName();
                name = name.substring(name.lastIndexOf('/') + 1);
                if (!name.matches(SAFE_CONF_NAME)) continue;  // sin rutas raras
                byte[] data = readBytes(zis, MAX_BYTES);
                total += data.length;
                if (total > ZIP_MAX_TOTAL) throw new IOException(L.t("La copia es demasiado grande"));
                String conf = new String(data, StandardCharsets.UTF_8);
                try {
                    out.add(new ZipProfile(name, conf, validate(conf)));
                } catch (IOException ignored) {
                    // no es un perfil valido
                }
            }
        }
        return out;
    }

    public static boolean sameContent(File f, String conf) {
        try (InputStream in = new java.io.FileInputStream(f)) {
            return new String(readBytes(in, MAX_BYTES), StandardCharsets.UTF_8).replace("\r\n", "\n")
                    .equals(conf.replace("\r\n", "\n"));
        } catch (IOException e) {
            return false;
        }
    }

    public static List<Entry> parseIndex(String json) throws IOException {
        try {
            JSONArray arr = new JSONObject(json).getJSONArray("presets");
            List<Entry> list = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                Entry e = new Entry();
                e.name = o.optString("name", o.optString("package"));
                e.pkg = o.getString("package");
                e.file = o.getString("file");
                e.author = o.optString("author", "");
                e.description = o.optString("description", "");
                list.add(e);
            }
            return list;
        } catch (JSONException e) {
            throw new IOException(L.t("Catálogo invalido: ") + e.getMessage());
        }
    }

    public static String resolve(String indexUrl, String file) throws IOException {
        if (indexUrl.startsWith("asset:")) {
            if (file.contains("..") || file.startsWith("/")) throw new IOException(L.t("Ruta no válida: ") + file);
            String base = indexUrl.substring(6);
            int slash = base.lastIndexOf('/');
            return "asset:" + (slash >= 0 ? base.substring(0, slash + 1) : "") + file;
        }
        URL base = new URL(indexUrl), target = new URL(base, file);
        // El perfil tiene que estar en el mismo sitio que el catalogo (nada de file:, otros dominios...).
        if (!"https".equals(target.getProtocol()) || !base.getHost().equalsIgnoreCase(target.getHost())) {
            throw new IOException(L.t("Ruta no válida: ") + file);
        }
        return target.toString();
    }

    /** Comprueba que el texto es un perfil y devuelve su paquete. */
    public static String validate(String conf) throws IOException {
        String pkg = null;
        for (String line : conf.split("\n")) {
            int hash = line.indexOf('#');
            if (hash >= 0) line = line.substring(0, hash);
            int eq = line.indexOf('=');
            if (eq < 0) continue;
            if (line.substring(0, eq).trim().toLowerCase(Locale.ROOT).equals("package")) {
                pkg = line.substring(eq + 1).trim();
            }
        }
        if (pkg == null || !pkg.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+") || pkg.length() > 150) {
            throw new IOException(L.t("No es un perfil válido (falta 'package = ...')"));
        }
        if (isSensitivePackage(pkg)) {
            throw new IOException(L.t("Por seguridad no se admiten perfiles para apps del sistema, tiendas, ajustes ni herramientas de root: ") + pkg);
        }
        for (int i = 0; i < conf.length(); i++) {
            char ch = conf.charAt(i);
            if (ch < 0x20 && ch != '\n' && ch != '\r' && ch != '\t') throw new IOException(L.t("El perfil tiene caracteres no permitidos"));
        }
        return pkg;
    }

    /** Perfiles de un juego, ordenados por archivo (el mismo orden que usa gpmapper). */
    public static List<Profile> profilesOf(String pkg) {
        List<Profile> out = new ArrayList<>();
        File[] files = Profile.profilesDir().listFiles((d, n) -> n.endsWith(".conf"));
        if (files == null) return out;
        java.util.Arrays.sort(files);
        for (File f : files) {
            try {
                Profile p = Profile.load(f);
                if (pkg.equals(p.pkg)) out.add(p);
            } catch (IOException ignored) {
            }
        }
        return out;
    }

    /** Archivo del perfil activo de ese juego, o <paquete>.conf si aun no tiene ninguno. */
    public static File targetFile(String pkg) {
        List<Profile> list = profilesOf(pkg);
        if (list.isEmpty()) return new File(Profile.profilesDir(), pkg + ".conf");
        String act = activeFile(pkg);
        for (Profile p : list) if (p.file.getName().equals(act)) return p.file;
        return list.get(0).file;
    }

    /**
     * Antes de anadir otro perfil a un juego: si aun no hay activo elegido, fijar el que se
     * esta usando (el primero), para que el nuevo no lo sustituya solo por orden alfabetico.
     */
    public static void pinActiveIfUnset(String pkg) {
        if (!activeFile(pkg).isEmpty()) return;
        List<Profile> list = profilesOf(pkg);
        if (list.isEmpty()) return;
        try {
            setActive(pkg, list.get(0).file.getName());
        } catch (IOException ignored) {
        }
    }

    /** Nombre de archivo libre para un perfil nuevo de ese juego. */
    public static File newFile(String pkg) {
        pinActiveIfUnset(pkg);
        File f = new File(Profile.profilesDir(), pkg + ".conf");
        for (int i = 2; f.exists(); i++) f = new File(Profile.profilesDir(), pkg + "-" + i + ".conf");
        return f;
    }

    // ---------------------------------------------------------------- perfil activo
    // active.txt (junto a profiles/): "paquete = archivo.conf" por linea. Lo lee gpmapper.
    private static File activeTxt() {
        return new File(Profile.baseDir(), "active.txt");
    }

    public static String activeFile(String pkg) {
        try (java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(
                new java.io.FileInputStream(activeTxt()), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                int eq = line.indexOf('=');
                if (eq > 0 && line.substring(0, eq).trim().equals(pkg)) return line.substring(eq + 1).trim();
            }
        } catch (IOException ignored) {
        }
        return "";
    }

    public static void setActive(String pkg, String fileName) throws IOException {
        List<String> lines = new ArrayList<>();
        boolean found = false;
        try (java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(
                new java.io.FileInputStream(activeTxt()), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                int eq = line.indexOf('=');
                if (eq <= 0) continue;
                if (line.substring(0, eq).trim().equals(pkg)) {
                    lines.add(pkg + " = " + fileName);
                    found = true;
                } else {
                    lines.add(line);
                }
            }
        } catch (IOException ignored) {
            // todavia no existe
        }
        if (!found) lines.add(pkg + " = " + fileName);
        File tmp = new File(Profile.baseDir(), "active.txt.tmp");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            for (String l : lines) w.write(l + "\n");
        }
        if (!tmp.renameTo(activeTxt())) {
            //noinspection ResultOfMethodCallIgnored
            activeTxt().delete();
            if (!tmp.renameTo(activeTxt())) throw new IOException(L.t("No se pudo guardar active.txt"));
        }
    }

    /** Guarda el perfil sobre el perfil activo del juego (o uno nuevo si no tiene). */
    public static File install(String conf) throws IOException {
        return install(conf, targetFile(validate(conf)));
    }

    /** Guarda el perfil en 'dst' (escritura atomica). */
    public static File install(String conf, File dst) throws IOException {
        validate(conf);
        File dir = Profile.profilesDir();
        // Solo dentro de la carpeta de perfiles y con un nombre normal (sin "../").
        if (!dst.getName().matches(SAFE_CONF_NAME)
                || !dir.getCanonicalFile().equals(dst.getCanonicalFile().getParentFile())) {
            throw new IOException(L.t("Ruta no válida: ") + dst.getName());
        }
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("No se pudo crear " + dir);
        File tmp = new File(dir, dst.getName() + ".tmp");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            w.write(conf.replace("\r\n", "\n"));
        }
        if (!tmp.renameTo(dst)) {
            //noinspection ResultOfMethodCallIgnored
            dst.delete();
            if (!tmp.renameTo(dst)) throw new IOException("No se pudo guardar " + dst);
        }
        return dst;
    }
}
