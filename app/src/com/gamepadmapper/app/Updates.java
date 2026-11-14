package com.gamepadmapper.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Aviso de version nueva (la app no esta en Play Store): consulta el ultimo Release de GitHub
 * como mucho una vez al dia, en segundo plano. Solo se envia la peticion a la API publica de
 * GitHub, sin datos del usuario. Se puede desactivar en Ajustes ("upd_check").
 */
final class Updates {
    private static final long DAY = 24L * 3600 * 1000;

    private Updates() {
    }

    static boolean enabled(Context c) {
        return prefs(c).getBoolean("upd_check", true);
    }

    static void setEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean("upd_check", on).apply();
    }

    /** Version nueva conocida (p. ej. "1.2") o null. Lo guardado en la ultima consulta. */
    static String available(Context c) {
        String tag = prefs(c).getString("upd_tag", "");
        String ver = tag.startsWith("v") ? tag.substring(1) : tag;
        return !ver.isEmpty() && newer(ver, current(c)) ? ver : null;
    }

    static String releaseUrl(Context c) {
        return prefs(c).getString("upd_url", RootMode.REPO_URL + "/releases/latest");
    }

    /** Consulta GitHub si toca (1 vez al dia) y llama a onDone en el hilo principal. */
    static void checkIfDue(Context c, Runnable onDone) {
        if (!enabled(c) || !RootMode.hasRepo() || !RootMode.REPO_URL.startsWith("https://github.com/")) return;
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        if (now - p.getLong("upd_at", 0) < DAY) return;
        p.edit().putLong("upd_at", now).apply();
        final Context app = c.getApplicationContext();
        new Thread(() -> {
            String repo = RootMode.REPO_URL.substring("https://github.com/".length()).replaceAll("/+$", "");
            HttpURLConnection con = null;
            try {
                con = (HttpURLConnection) new URL("https://api.github.com/repos/" + repo + "/releases/latest").openConnection();
                con.setConnectTimeout(8000);
                con.setReadTimeout(8000);
                con.setRequestProperty("Accept", "application/vnd.github+json");
                if (con.getResponseCode() != 200) return;
                String json;
                try (InputStream in = con.getInputStream()) {
                    json = new String(readAll(in), StandardCharsets.UTF_8);
                }
                String tag = field(json, "tag_name"), url = field(json, "html_url");
                if (tag == null) return;
                prefs(app).edit().putString("upd_tag", tag).putString("upd_url", url == null ? "" : url).apply();
                new Handler(Looper.getMainLooper()).post(onDone);
            } catch (Exception ignored) {
                // sin internet o GitHub no responde: se reintenta otro dia
            } finally {
                if (con != null) con.disconnect();
            }
        }, "updates").start();
    }

    static String current(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "0";
        }
    }

    /** ¿a > b? Compara numeros separados por puntos ("1.10" > "1.9"). */
    static boolean newer(String a, String b) {
        String[] x = a.split("[^0-9]+"), y = b.split("[^0-9]+");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int u = i < x.length && !x[i].isEmpty() ? Integer.parseInt(x[i]) : 0;
            int v = i < y.length && !y[i].isEmpty() ? Integer.parseInt(y[i]) : 0;
            if (u != v) return u > v;
        }
        return false;
    }

    /** Valor de texto de un campo JSON de primer nivel (suficiente para esta respuesta). */
    private static String field(String json, String key) {
        int k = json.indexOf("\"" + key + "\"");
        if (k < 0) return null;
        int q1 = json.indexOf('"', json.indexOf(':', k) + 1);
        int q2 = json.indexOf('"', q1 + 1);
        return q1 < 0 || q2 < 0 ? null : json.substring(q1 + 1, q2);
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0 && o.size() < 512 * 1024) o.write(buf, 0, n);
        return o.toByteArray();
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE);
    }
}
