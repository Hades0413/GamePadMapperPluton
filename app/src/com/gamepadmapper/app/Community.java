package com.gamepadmapper.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Perfiles de la comunidad (la misma base de datos que la web). Solo LECTURA y sin cuenta: la app
 * usa la clave publica de Supabase, igual que un visitante de la web. Subir, dar "me gusta" o
 * reportar se hace en la web (CommunityUi abre el enlace).
 *
 * Todo lo que llega del servidor se valida (identificadores, paquetes, longitudes) y el perfil
 * pasa por Library.validate y por la confirmacion de MainActivity antes de instalarse.
 * Las respuestas se guardan en cache para poder verlas sin conexion.
 */
public final class Community {
    /** Proyecto de Supabase y clave PUBLICA (la misma que lleva la web; los permisos estan en la base de datos). */
    static final String API = "https://gshyhrthaksriamjqdtf.supabase.co/rest/v1/";
    private static final String KEY = "sb_publishable_QTPm_6jVyWGcvWILpDqJoA_skWLqjeD";
    /** Web de la comunidad. */
    public static final String SITE = "https://hades0413.github.io/GamePadMapperPluton";

    public static final int PAGE = 24;
    /** El servidor devuelve como mucho 100 filas por peticion. */
    private static final int SERVER_MAX_ROWS = 100;
    private static final int MAX_GAMES = 1000;
    private static final int MAX_RESPONSE = 2 * 1024 * 1024;

    private static final Pattern UUID = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    private static final Pattern PACKAGE = Pattern.compile("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+$");

    public static final class Game {
        public String pkg, name;
        public int profiles;
    }

    public static final class Item {
        public String id, pkg, gameName, title, description, author;
        public int likes, buttons, screenW, screenH;
        public long createdAt;
        /** Texto .conf (solo al pedir un perfil concreto). */
        public String conf;
    }

    private Community() {
    }

    // ---------------------------------------------------------------- consultas

    /** Juegos con perfiles publicados, ordenados por numero de perfiles. Llamar fuera del hilo principal. */
    public static List<Game> games(Context c) throws IOException {
        String cacheKey = "games";
        try {
            List<Game> out = new ArrayList<>();
            for (int from = 0; from < MAX_GAMES; from += SERVER_MAX_ROWS) {
                String json = get("games?select=package,name,profile_count&profile_count=gt.0"
                        + "&order=profile_count.desc,name.asc", from, from + SERVER_MAX_ROWS - 1);
                if (from == 0) saveCache(c, cacheKey, json);
                int n = parseGames(json, out);
                if (n < SERVER_MAX_ROWS) break;
            }
            return out;
        } catch (IOException e) {
            String cached = loadCache(c, cacheKey);
            if (cached == null) throw e;
            List<Game> out = new ArrayList<>();
            parseGames(cached, out);
            return out;
        }
    }

    /** Una pagina de perfiles de un juego (page desde 0). */
    public static List<Item> profiles(Context c, String pkg, boolean recent, int page) throws IOException {
        if (!PACKAGE.matcher(pkg).matches()) return Collections.emptyList();
        String order = recent ? "created_at.desc" : "like_count.desc,created_at.desc";
        String cacheKey = "game-" + pkg + (recent ? "-r" : "-p") + "-" + page;
        String json;
        try {
            json = get("game_profiles?select=" + SUMMARY + "&status=eq.published&package=eq." + enc(pkg)
                    + "&order=" + order, page * PAGE, page * PAGE + PAGE - 1);
            saveCache(c, cacheKey, json);
        } catch (IOException e) {
            json = loadCache(c, cacheKey);
            if (json == null) throw e;
        }
        return parseItems(json, false);
    }

    /** Perfil completo (con el .conf), o null si ya no existe. */
    public static Item profile(Context c, String id) throws IOException {
        if (!UUID.matcher(id).matches()) return null;
        String cacheKey = "profile-" + id;
        String json;
        try {
            json = get("game_profiles?select=" + SUMMARY + ",conf&status=eq.published&id=eq." + id, 0, 0);
            saveCache(c, cacheKey, json);
        } catch (IOException e) {
            json = loadCache(c, cacheKey);
            if (json == null) throw e;
        }
        List<Item> list = parseItems(json, true);
        return list.isEmpty() ? null : list.get(0);
    }

    private static final String SUMMARY = "id,package,title,description,screen_w,screen_h,binding_count,"
            + "like_count,created_at,author:authors!game_profiles_author_id_fkey(username),game:games(name)";

    // ---------------------------------------------------------------- enlaces a la web

    public static String profileUrl(String id) {
        return SITE + "/perfil/" + id;
    }

    public static String gameUrl(String pkg) {
        return SITE + "/juegos/" + pkg;
    }

    /** Abre /subir con el perfil ya cargado. Va en el "#": nunca se envia a ningun servidor. */
    public static String uploadUrl(String conf) {
        byte[] b = conf.replace("\r\n", "\n").getBytes(StandardCharsets.UTF_8);
        return SITE + "/subir#conf=" + android.util.Base64.encodeToString(b,
                android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP | android.util.Base64.NO_PADDING);
    }

    // ---------------------------------------------------------------- HTTP

    private static String get(String path, int from, int to) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(API + path).openConnection();
        try {
            h.setConnectTimeout(10000);
            h.setReadTimeout(15000);
            h.setInstanceFollowRedirects(false);
            h.setRequestProperty("apikey", KEY);
            h.setRequestProperty("Accept", "application/json");
            h.setRequestProperty("Range-Unit", "items");
            h.setRequestProperty("Range", from + "-" + to);
            h.setRequestProperty("User-Agent", "GamepadMapperPluton");
            int code = h.getResponseCode();
            if (code != 200 && code != 206) throw new IOException(L.t("El servidor respondió ") + code);
            try (InputStream in = h.getInputStream()) {
                return new String(Library.readBytes(in, MAX_RESPONSE), StandardCharsets.UTF_8);
            }
        } finally {
            h.disconnect();
        }
    }

    private static String enc(String s) throws IOException {
        return URLEncoder.encode(s, "UTF-8");
    }

    // ---------------------------------------------------------------- JSON (validado)

    private static int parseGames(String json, List<Game> out) throws IOException {
        try {
            JSONArray a = new JSONArray(json);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                Game g = new Game();
                g.pkg = o.optString("package", "");
                g.name = clean(o.optString("name", ""), 60);
                g.profiles = Math.max(0, o.optInt("profile_count", 0));
                if (PACKAGE.matcher(g.pkg).matches() && !g.name.isEmpty() && !Library.isSensitivePackage(g.pkg)) out.add(g);
            }
            return a.length();
        } catch (JSONException e) {
            throw new IOException(L.t("Respuesta no válida del servidor"));
        }
    }

    private static List<Item> parseItems(String json, boolean withConf) throws IOException {
        List<Item> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(json);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                Item it = new Item();
                it.id = o.optString("id", "");
                it.pkg = o.optString("package", "");
                it.title = clean(o.optString("title", ""), 60);
                it.description = clean(o.optString("description", ""), 500);
                it.screenW = o.optInt("screen_w", 0);
                it.screenH = o.optInt("screen_h", 0);
                it.buttons = Math.max(0, o.optInt("binding_count", 0));
                it.likes = Math.max(0, o.optInt("like_count", 0));
                it.createdAt = parseDate(o.optString("created_at", ""));
                JSONObject au = o.optJSONObject("author");
                it.author = au != null ? clean(au.optString("username", ""), 39) : "";
                JSONObject ga = o.optJSONObject("game");
                it.gameName = ga != null ? clean(ga.optString("name", ""), 60) : "";
                if (withConf) {
                    it.conf = o.optString("conf", "");
                    if (it.conf.length() > 16384) continue;
                }
                if (!UUID.matcher(it.id).matches() || !PACKAGE.matcher(it.pkg).matches()
                        || Library.isSensitivePackage(it.pkg) || it.title.isEmpty()) continue;
                out.add(it);
            }
        } catch (JSONException e) {
            throw new IOException(L.t("Respuesta no válida del servidor"));
        }
        return out;
    }

    /** Texto de una linea o parrafo sin caracteres de control y con longitud maxima. */
    private static String clean(String s, int max) {
        StringBuilder b = new StringBuilder(Math.min(s.length(), max));
        for (int i = 0; i < s.length() && b.length() < max; i++) {
            char ch = s.charAt(i);
            if (ch == '\n' || ch >= 0x20 && ch != 0x7f) b.append(ch);
        }
        return b.toString().trim();
    }

    private static long parseDate(String iso) {
        try {
            String s = iso.length() >= 19 ? iso.substring(0, 19) : iso;
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.ROOT);
            f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            java.util.Date d = f.parse(s);
            return d != null ? d.getTime() : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    // ---------------------------------------------------------------- cache en disco

    private static File cacheFile(Context c, String key) {
        File dir = new File(c.getCacheDir(), "community");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, key.replaceAll("[^A-Za-z0-9._-]", "_") + ".json");
    }

    private static void saveCache(Context c, String key, String json) {
        File f = cacheFile(c, key), tmp = new File(f.getPath() + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            return;
        }
        if (!tmp.renameTo(f)) //noinspection ResultOfMethodCallIgnored
            tmp.delete();
    }

    private static String loadCache(Context c, String key) {
        File f = cacheFile(c, key);
        if (!f.exists()) return null;
        try (InputStream in = new FileInputStream(f)) {
            return new String(Library.readBytes(in, MAX_RESPONSE), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }
}
