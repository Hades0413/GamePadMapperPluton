package com.gamepadmapper.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Perfiles instalados desde la comunidad: que archivo local vino de que perfil publicado, en que
 * version y con que contenido (huella). Sirve para avisar de actualizaciones sin pisar cambios
 * propios y para preguntar «¿Te funcionó?» despues de jugar.
 *
 * Tambien guarda el id de instalacion: un UUID aleatorio creado aqui (no identifica el telefono ni
 * a la persona) con el que la base de datos cuenta una instalacion o un voto por perfil.
 */
final class CommunityLinks {
    private static final String PREFS = "community_links";
    private static final String KEY_INSTALL = "install_id";
    private static final String FILE_PREFIX = "f:";
    private static final String KEY_PENDING = "pending_upload";
    /** La web tiene que devolver el id en este tiempo tras abrir «Subir/Actualizar». */
    private static final long PENDING_MS = 2 * 3600_000L;
    /** Tiempo minimo jugando con el perfil antes de preguntar si funciono. */
    static final long MIN_PLAY_MS = 3 * 60_000L;

    static final class Link {
        String file, id, title, hash;
        /** updated_at del perfil publicado que se instalo (o que se decidio ignorar). */
        long updatedAt;
        /** 0 = sin preguntar, 1 = toca preguntar, 2 = ya respondido o descartado. */
        int feedback;
        /** Perfil publicado por el propio usuario (se actualiza desde la app con la web). */
        boolean mine;
    }

    private CommunityLinks() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Id aleatorio de esta instalacion de la app (se crea la primera vez). */
    static synchronized String installId(Context c) {
        SharedPreferences p = prefs(c);
        String id = p.getString(KEY_INSTALL, null);
        if (id == null || id.length() != 36) {
            id = java.util.UUID.randomUUID().toString();
            p.edit().putString(KEY_INSTALL, id).apply();
        }
        return id;
    }

    /** Huella del texto del perfil (ignora finales de linea y espacios al final). */
    static String hash(String conf) {
        try {
            String norm = conf.replace("\r\n", "\n").trim();
            byte[] d = MessageDigest.getInstance("SHA-256").digest(norm.getBytes(StandardCharsets.UTF_8));
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < 12; i++) b.append(String.format("%02x", d[i]));
            return b.toString();
        } catch (Exception e) {
            return "";
        }
    }

    /** Anota que 'file' se acaba de instalar desde el perfil publicado 'it'. */
    static void remember(Context c, File file, Community.Item it) {
        Link l = new Link();
        l.file = file.getName();
        l.id = it.id;
        l.title = it.title;
        l.hash = hash(it.conf == null ? "" : it.conf);
        l.updatedAt = it.updatedAt;
        Link old = get(c, file.getName());
        // Si es el mismo perfil (p. ej. una actualizacion) se mantiene si ya respondio.
        l.feedback = old != null && old.id.equals(it.id) ? old.feedback : 0;
        save(c, l);
    }

    /** 'file' es el perfil 'id' que el usuario ha publicado (o actualizado) en la comunidad. */
    static void rememberOwn(Context c, File file, Community.Item it, String localConf) {
        Link l = new Link();
        l.file = file.getName();
        l.id = it.id;
        l.title = it.title;
        l.hash = hash(localConf);
        l.updatedAt = it.updatedAt;
        l.feedback = 2;   // a quien lo hizo no se le pregunta si funciona
        l.mine = true;
        save(c, l);
    }

    /** Se abre la web para publicar 'file': se espera que vuelva con el id (gpmapper://subido/<id>). */
    static void setPendingUpload(Context c, File file) {
        prefs(c).edit().putString(KEY_PENDING, System.currentTimeMillis() + "|" + file.getName()).apply();
    }

    /** Archivo que se envio a la web hace poco (y se olvida), o null. */
    static File takePendingUpload(Context c) {
        String v = prefs(c).getString(KEY_PENDING, null);
        prefs(c).edit().remove(KEY_PENDING).apply();
        if (v == null) return null;
        int bar = v.indexOf('|');
        try {
            long at = Long.parseLong(v.substring(0, bar));
            long age = System.currentTimeMillis() - at;
            if (age < 0 || age > PENDING_MS) return null;
            File f = new File(Profile.profilesDir(), v.substring(bar + 1));
            return f.isFile() && f.getName().endsWith(".conf") ? f : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** El archivo ya no viene de la comunidad (se sustituyo por otro perfil). */
    static void forget(Context c, String fileName) {
        prefs(c).edit().remove(FILE_PREFIX + fileName).apply();
    }

    static Link get(Context c, String fileName) {
        return parse(fileName, prefs(c).getString(FILE_PREFIX + fileName, null));
    }

    /** Perfiles enlazados cuyo archivo sigue existiendo (los demas se olvidan). */
    static List<Link> all(Context c) {
        List<Link> out = new ArrayList<>();
        List<String> gone = new ArrayList<>();
        for (Map.Entry<String, ?> e : prefs(c).getAll().entrySet()) {
            if (!e.getKey().startsWith(FILE_PREFIX) || !(e.getValue() instanceof String)) continue;
            String name = e.getKey().substring(FILE_PREFIX.length());
            Link l = parse(name, (String) e.getValue());
            if (l == null || !new File(Profile.profilesDir(), name).isFile()) gone.add(name);
            else out.add(l);
        }
        for (String g : gone) forget(c, g);
        return out;
    }

    /** ¿Se ha cambiado el perfil en el telefono desde que se instalo? */
    static boolean editedLocally(Link l) {
        try {
            File f = new File(Profile.profilesDir(), l.file);
            String now = new String(java.nio.file.Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
            return !hash(now).equals(l.hash);
        } catch (Exception e) {
            return false;
        }
    }

    /** No volver a avisar de esta version publicada. */
    static void skipVersion(Context c, Link l, long updatedAt) {
        l.updatedAt = updatedAt;
        save(c, l);
    }

    /** Se ha jugado con el perfil 'file' durante 'ms': si vino de la comunidad, toca preguntar. */
    static void onPlayed(Context c, File file, long ms) {
        if (file == null || ms < MIN_PLAY_MS) return;
        Link l = get(c, file.getName());
        if (l == null || l.feedback != 0) return;
        l.feedback = 1;
        save(c, l);
    }

    /** Perfil por el que toca preguntar «¿Te funcionó?», o null. */
    static Link pendingFeedback(Context c) {
        for (Link l : all(c)) if (l.feedback == 1) return l;
        return null;
    }

    static void feedbackDone(Context c, Link l) {
        l.feedback = 2;
        save(c, l);
    }

    private static void save(Context c, Link l) {
        try {
            JSONObject o = new JSONObject().put("id", l.id).put("title", l.title).put("hash", l.hash)
                    .put("updated", l.updatedAt).put("feedback", l.feedback).put("mine", l.mine);
            prefs(c).edit().putString(FILE_PREFIX + l.file, o.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private static Link parse(String fileName, String json) {
        if (json == null) return null;
        try {
            JSONObject o = new JSONObject(json);
            Link l = new Link();
            l.file = fileName;
            l.id = o.getString("id");
            l.title = o.optString("title", "");
            l.hash = o.optString("hash", "");
            l.updatedAt = o.optLong("updated", 0);
            l.feedback = o.optInt("feedback", 0);
            l.mine = o.optBoolean("mine", false);
            return l;
        } catch (Exception e) {
            return null;
        }
    }
}
