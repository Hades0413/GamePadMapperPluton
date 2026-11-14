package com.gamepadmapper.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Mandos reconocidos por la comunidad en modo root (ver SdlMapping): descarga las lineas SDL
 * aprobadas en la web (solo lectura, clave publica), las une a un subconjunto de SDL
 * GameControllerDB incluido en la app (assets/mandos-sdl.txt, licencia zlib) y escribe
 * {@code <base>/mando.map} para el mando conectado si manda codigos raros.
 * <p>
 * El modo sin root (accesibilidad) ya recibe los botones normalizados por Android: no se toca.
 */
public final class ControllerMappings {
    public static final String ASSET = "mandos-sdl.txt";
    private static final String CACHE = "mandos-comunidad.txt";
    private static final String PREF = "pad_map_community";
    /** Paginas de 100 filas como mucho, y otros limites contra respuestas enormes. */
    private static final int PAGE = 100, MAX_PAGES = 20, MAX_RESPONSE = 512 * 1024, MAX_INFO = 16 * 1024;
    private static final long MAX_AGE_MS = 3L * 24 * 3600 * 1000;

    private ControllerMappings() {
    }

    /** Resultado de update(): que mando hay y si se le aplico una tabla. */
    public static final class Result {
        public String guid = "", padName = "", mappingName = "", source = "";
        /** La tabla esta escrita para el mando conectado. */
        public boolean written;
        /** El mando ya manda codigos normales (no hace falta traducir). */
        public boolean standard;
    }

    public static boolean enabled(Context c) {
        return c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE).getBoolean(PREF, true);
    }

    public static void setEnabled(Context c, boolean on) {
        c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE).edit().putBoolean(PREF, on).apply();
    }

    static File infoFile() {
        return new File(Profile.baseDir(), "mando_info");
    }

    static File mapFile() {
        return new File(Profile.baseDir(), "mando.map");
    }

    /** Firma barata para saber si hay que volver a mirar (mando conectado y preferencia). */
    public static String signature(Context c) {
        File f = infoFile();
        return f.lastModified() + ":" + f.length() + ":" + enabled(c);
    }

    /**
     * Mira el mando conectado (lo escribe gpmapper) y escribe o borra la tabla. Descarga los mandos
     * de la comunidad si la copia tiene mas de unos dias. Llamar fuera del hilo principal.
     * Devuelve null si gpmapper no ha visto ningun mando.
     */
    public static Result update(Context c) {
        SdlMapping.Info info = SdlMapping.Info.parse(readText(infoFile(), MAX_INFO));
        if (info == null) return null;
        Result r = new Result();
        r.guid = info.guid();
        r.padName = info.name;
        r.standard = !info.nonStandard();
        if (!enabled(c) || r.standard) {
            deleteMap();
            return r;
        }
        File cache = new File(c.getFilesDir(), CACHE);
        if (!cache.exists() || System.currentTimeMillis() - cache.lastModified() > MAX_AGE_MS) {
            try {
                download(cache);
            } catch (IOException ignored) {
                // sin conexion: se usa la copia anterior y la base incluida
            }
        }
        // La comunidad primero (son correcciones mas recientes); luego la base incluida.
        String[] sources = {readText(cache, MAX_PAGES * MAX_RESPONSE), readAsset(c)};
        String[] names = {L.t("mandos de la comunidad"), "SDL GameControllerDB"};
        for (int s = 0; s < sources.length; s++) {
            Map<String, SdlMapping.Line> db = index(sources[s]);
            for (String g : SdlMapping.variants(r.guid)) {
                SdlMapping.Line line = db.get(g);
                if (line == null) continue;
                String map = SdlMapping.buildMap(info, line, names[s]);
                if (map == null) continue;   // no encaja con este mando: seguir buscando
                if (writeIfChanged(map)) {
                    r.written = true;
                    r.mappingName = line.name;
                    r.source = names[s];
                    return r;
                }
                return r;
            }
        }
        deleteMap();
        return r;
    }

    /** Lineas validas de Linux por GUID (la ultima gana). */
    static Map<String, SdlMapping.Line> index(String text) {
        Map<String, SdlMapping.Line> m = new HashMap<>();
        if (text == null) return m;
        int n = 0;
        for (String raw : text.split("\n")) {
            SdlMapping.Line l = SdlMapping.Line.parse(raw);
            if (l == null || !"Linux".equals(l.platform)) continue;
            m.put(l.guid, l);
            if (++n > 5000) break;
        }
        return m;
    }

    /** Descarga los mandos aprobados de Linux (paginas de 100) y guarda las lineas validas. */
    static void download(File cache) throws IOException {
        StringBuilder out = new StringBuilder();
        int lines = 0;
        for (int page = 0; page < MAX_PAGES; page++) {
            String json = get("controller_mappings?select=mapping&status=eq.approved&platform=eq.Linux&order=id&limit="
                    + PAGE + "&offset=" + page * PAGE);
            int rows;
            try {
                JSONArray a = new JSONArray(json);
                rows = a.length();
                if (rows > PAGE) throw new IOException(L.t("Respuesta no válida del servidor"));
                for (int i = 0; i < rows; i++) {
                    String m = a.getJSONObject(i).optString("mapping", "");
                    SdlMapping.Line l = SdlMapping.Line.parse(m);
                    if (l == null || !"Linux".equals(l.platform)) continue;   // nunca se guarda algo no valido
                    out.append(m.trim()).append('\n');
                    lines++;
                }
            } catch (JSONException e) {
                throw new IOException(L.t("Respuesta no válida del servidor"));
            }
            if (rows < PAGE) break;
        }
        File tmp = new File(cache.getPath() + ".tmp");
        try (OutputStream o = new FileOutputStream(tmp)) {
            o.write(("# Mandos de la comunidad (" + lines + ")\n" + out).getBytes(StandardCharsets.UTF_8));
        }
        if (!tmp.renameTo(cache)) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            throw new IOException("cache");
        }
    }

    private static String get(String path) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(Community.API + path).openConnection();
        try {
            h.setConnectTimeout(10000);
            h.setReadTimeout(15000);
            h.setInstanceFollowRedirects(false);
            h.setRequestProperty("apikey", Community.KEY);
            h.setRequestProperty("Accept", "application/json");
            h.setRequestProperty("User-Agent", "GamepadMapperPluton");
            int code = h.getResponseCode();
            if (code != 200) throw new IOException(L.t("El servidor respondió ") + code);
            try (InputStream in = h.getInputStream()) {
                return new String(Library.readBytes(in, MAX_RESPONSE), StandardCharsets.UTF_8);
            }
        } finally {
            h.disconnect();
        }
    }

    private static boolean writeIfChanged(String map) {
        File f = mapFile();
        if (map.equals(readText(f, MAX_INFO))) return true;
        File tmp = new File(f.getPath() + ".tmp");
        try {
            try (OutputStream o = new FileOutputStream(tmp)) {
                o.write(map.getBytes(StandardCharsets.UTF_8));
            }
            if (tmp.renameTo(f)) return true;
        } catch (IOException ignored) {
            // sin permiso de escritura: no se aplica
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.delete();
        return false;
    }

    static void deleteMap() {
        File f = mapFile();
        //noinspection ResultOfMethodCallIgnored
        if (f.exists()) f.delete();
    }

    private static String readAsset(Context c) {
        try (InputStream in = c.getAssets().open(ASSET)) {
            return new String(Library.readBytes(in, 1024 * 1024), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    private static String readText(File f, int max) {
        if (!f.isFile() || f.length() > max) return null;
        try (InputStream in = new FileInputStream(f)) {
            return new String(Library.readBytes(in, max), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }
}
