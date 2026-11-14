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
    /** Solo imagenes del Storage del proyecto (como exige la base de datos). */
    static final Pattern IMAGE = Pattern.compile(
            "^https://[a-z0-9]+\\.supabase\\.co/storage/v1/object/public/juegos/(iconos|fondos)/[A-Za-z0-9._-]{1,160}(\\?v=[0-9]{1,15})?$");

    static String image(JSONObject o, String field) {
        String u = o.optString(field, "");
        return !o.isNull(field) && IMAGE.matcher(u).matches() ? u : null;
    }

    public static final class Game {
        public String pkg, name;
        public int profiles;
        /** Imagenes del Storage del proyecto (o null). */
        public String iconUrl, backgroundUrl;
    }

    public static final class Item {
        public String id, pkg, gameName, title, description, author;
        /** Modelo del telefono con el que se hizo ("" si no se indico). */
        public String deviceModel = "";
        /** Icono y captura del juego (o null). */
        public String gameIcon, gameBackground;
        public int likes, buttons, screenW, screenH;
        /** Instalaciones desde la app y respuestas «¿te funcionó?» (orientativos). */
        public int installs, worksYes, worksNo;
        public long createdAt, updatedAt;
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
                String json = get("games?select=package,name,profile_count,icon_url,background_url&profile_count=gt.0"
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

    /**
     * Juegos de la comunidad usando la cache si tiene menos de maxAgeMs (para el aviso de Inicio:
     * como mucho una peticion cada pocas horas). Llamar fuera del hilo principal.
     */
    public static List<Game> gamesRecent(Context c, long maxAgeMs) throws IOException {
        File f = cacheFile(c, "games");
        if (f.exists() && System.currentTimeMillis() - f.lastModified() < maxAgeMs) {
            String cached = loadCache(c, "games");
            if (cached != null) {
                List<Game> out = new ArrayList<>();
                parseGames(cached, out);
                return out;
            }
        }
        return games(c);
    }

    /**
     * Una pagina de perfiles de un juego (page desde 0). ratio > 0: solo los hechos en pantallas de
     * esa proporcion (lado largo / corto, con un 2 % de margen).
     */
    public static List<Item> profiles(Context c, String pkg, boolean recent, int page, float ratio) throws IOException {
        if (!PACKAGE.matcher(pkg).matches()) return Collections.emptyList();
        String order = recent ? "created_at.desc" : "like_count.desc,created_at.desc";
        String filter = ratio > 0 ? String.format(java.util.Locale.ROOT, "&screen_ratio=gte.%.3f&screen_ratio=lte.%.3f",
                ratio * 0.98f, ratio * 1.02f) : "";
        String cacheKey = "game-" + pkg + (recent ? "-r" : "-p") + (ratio > 0 ? "-mia" : "") + "-" + page;
        String json;
        try {
            json = get("game_profiles?select=" + SUMMARY + "&status=eq.published&package=eq." + enc(pkg)
                    + filter + "&order=" + order, page * PAGE, page * PAGE + PAGE - 1);
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

    private static final String SUMMARY = "id,package,title,description,screen_w,screen_h,device_model,binding_count,"
            + "like_count,install_count,works_yes,works_no,created_at,updated_at,author:authors!game_profiles_author_id_fkey(username),game:games(name,icon_url,background_url)";

    /**
     * Fecha de la ultima modificacion (titulo, descripcion o perfil) de los perfiles indicados que
     * siguen publicados. Los que ya no existen o se ocultaron no aparecen.
     */
    public static java.util.Map<String, Item> updates(java.util.Collection<String> ids) throws IOException {
        java.util.Map<String, Item> out = new java.util.HashMap<>();
        StringBuilder list = new StringBuilder();
        for (String id : ids) {
            if (!UUID.matcher(id).matches()) continue;
            if (list.length() > 0) list.append(',');
            list.append(id);
        }
        if (list.length() == 0) return out;
        String json = get("game_profiles?select=" + SUMMARY + "&status=eq.published&id=in.(" + list + ")",
                0, SERVER_MAX_ROWS - 1);
        for (Item it : parseItems(json, false)) out.put(it.id, it);
        return out;
    }

    /**
     * El perfil que mejor encaja para empezar: primero los hechos con tu proporcion de pantalla,
     * luego los que mas dicen que funcionan, los mas instalados y los mas gustados. Se descartan
     * los que la mayoria dice que no funcionan. Devuelve el perfil completo (con conf) o null.
     * Llamar fuera del hilo principal.
     */
    public static Item recommend(Context c, String pkg, float ratio) throws IOException {
        Item best = null;
        double bestScore = -1;
        for (Item it : profiles(c, pkg, false, 0, 0)) {
            int share = worksShare(it);
            if (share >= 0 && share < 40) continue;
            double score = (fitsScreen(it, ratio) ? 1000 : 0) + (share >= 0 ? share : 60) * 4
                    + Math.min(it.installs, 500) * 0.2 + Math.min(it.likes, 200);
            if (score > bestScore) {
                bestScore = score;
                best = it;
            }
        }
        return best == null ? null : profile(c, best.id);
    }

    /** Porcentaje (0-100) que dice que le funciona, o -1 si aun hay pocos votos. */
    public static int worksShare(Item it) {
        int total = it.worksYes + it.worksNo;
        return total < 3 ? -1 : Math.round(it.worksYes * 100f / total);
    }

    // ---------------------------------------------------------------- estadisticas (sin cuenta)

    /** Avisa de que esta instalacion ha instalado el perfil (cuenta una vez por instalacion). */
    public static void registerInstall(String id, String installId) throws IOException {
        if (!UUID.matcher(id).matches() || !UUID.matcher(installId).matches()) return;
        try {
            rpc("register_install", new JSONObject().put("p_id", id).put("p_install", installId));
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
    }

    /** «¿Te funcionó?» Solo cuenta si esta instalacion lo instalo desde la comunidad. */
    public static void rateProfile(String id, String installId, boolean works) throws IOException {
        if (!UUID.matcher(id).matches() || !UUID.matcher(installId).matches()) return;
        try {
            rpc("rate_profile", new JSONObject().put("p_id", id).put("p_install", installId).put("p_works", works));
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
    }

    // ---------------------------------------------------------------- enlaces a la web

    public static String profileUrl(String id) {
        return SITE + "/perfil/" + id;
    }

    public static String gameUrl(String pkg) {
        return SITE + "/juegos/" + pkg;
    }

    /** Abre /subir con el perfil ya cargado. Va en el "#": nunca se envia a ningun servidor. */
    public static String uploadUrl(String conf) {
        return SITE + "/subir" + confFragment(conf);
    }

    /** Abre la edicion del perfil publicado 'id' con la version de este telefono. */
    public static String editUrl(String id, String conf) {
        if (!UUID.matcher(id).matches()) throw new IllegalArgumentException("id");
        return SITE + "/perfil/" + id + "/editar" + confFragment(conf);
    }

    private static String confFragment(String conf) {
        byte[] b = conf.replace("\r\n", "\n").getBytes(StandardCharsets.UTF_8);
        String model = deviceModel();
        String frag = "#conf=" + android.util.Base64.encodeToString(b,
                android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP | android.util.Base64.NO_PADDING);
        try {
            if (!model.isEmpty()) frag += "&modelo=" + URLEncoder.encode(model, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException ignored) {
            // UTF-8 siempre existe
        }
        return frag;
    }

    static boolean isId(String s) {
        return s != null && UUID.matcher(s).matches();
    }

    /** Modelo del telefono para mostrar ("Redmi Note 9"), solo con los caracteres que admite la web. */
    public static String deviceModel() {
        String maker = android.os.Build.MANUFACTURER == null ? "" : android.os.Build.MANUFACTURER.trim();
        String model = android.os.Build.MODEL == null ? "" : android.os.Build.MODEL.trim();
        String full = !maker.isEmpty() && !model.toLowerCase(java.util.Locale.ROOT).startsWith(maker.toLowerCase(java.util.Locale.ROOT))
                ? maker.substring(0, 1).toUpperCase(java.util.Locale.ROOT) + maker.substring(1) + " " + model : model;
        full = full.replaceAll("[^A-Za-z0-9 ._()+/-]", "").replaceAll("\\s+", " ").trim();
        if (full.length() > 60) full = full.substring(0, 60).trim();
        return full.length() >= 2 && Character.isLetterOrDigit(full.charAt(0)) ? full : "";
    }

    /** Proporcion de la pantalla de este telefono (lado largo / corto). */
    public static float screenRatio(Context c) {
        android.util.DisplayMetrics m = new android.util.DisplayMetrics();
        android.view.WindowManager wm = (android.view.WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        //noinspection deprecation
        wm.getDefaultDisplay().getRealMetrics(m);
        return Math.max(m.widthPixels, m.heightPixels) / (float) Math.max(1, Math.min(m.widthPixels, m.heightPixels));
    }

    /** Misma proporcion de pantalla (2 % de margen): el perfil encaja tal cual. */
    public static boolean fitsScreen(Item it, float ratio) {
        if (it.screenW <= 0 || it.screenH <= 0 || ratio <= 0) return false;
        float r = Math.max(it.screenW, it.screenH) / (float) Math.min(it.screenW, it.screenH);
        return Math.abs(r - ratio) / ratio < 0.02f;
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

    /** Llama a una funcion publica de la base de datos (solo las pensadas para la app sin cuenta). */
    private static void rpc(String fn, JSONObject body) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(API + "rpc/" + fn).openConnection();
        try {
            h.setConnectTimeout(10000);
            h.setReadTimeout(15000);
            h.setInstanceFollowRedirects(false);
            h.setRequestMethod("POST");
            h.setDoOutput(true);
            h.setRequestProperty("apikey", KEY);
            h.setRequestProperty("Content-Type", "application/json");
            h.setRequestProperty("Accept", "application/json");
            h.setRequestProperty("User-Agent", "GamepadMapperPluton");
            byte[] b = body.toString().getBytes(StandardCharsets.UTF_8);
            h.setFixedLengthStreamingMode(b.length);
            try (java.io.OutputStream out = h.getOutputStream()) {
                out.write(b);
            }
            int code = h.getResponseCode();
            if (code < 200 || code >= 300) throw new IOException(L.t("El servidor respondió ") + code);
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
                g.iconUrl = image(o, "icon_url");
                g.backgroundUrl = image(o, "background_url");
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
                it.deviceModel = o.isNull("device_model") ? "" : clean(o.optString("device_model", ""), 60);
                it.installs = Math.max(0, o.optInt("install_count", 0));
                it.worksYes = Math.max(0, o.optInt("works_yes", 0));
                it.worksNo = Math.max(0, o.optInt("works_no", 0));
                it.createdAt = parseDate(o.optString("created_at", ""));
                it.updatedAt = parseDate(o.optString("updated_at", ""));
                JSONObject au = o.optJSONObject("author");
                it.author = au != null ? clean(au.optString("username", ""), 39) : "";
                JSONObject ga = o.optJSONObject("game");
                it.gameName = ga != null ? clean(ga.optString("name", ""), 60) : "";
                it.gameIcon = ga != null ? image(ga, "icon_url") : null;
                it.gameBackground = ga != null ? image(ga, "background_url") : null;
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
