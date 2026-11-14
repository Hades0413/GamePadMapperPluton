package com.gamepadmapper.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Copia en la nube de los perfiles (opcional), con la cuenta de GitHub de la web.
 * <p>
 * Inicio de sesion: Supabase Auth con OAuth + PKCE en el navegador. La app genera un
 * code_verifier aleatorio y un state, abre /auth/v1/authorize?provider=github y la web de
 * Supabase vuelve a {@code gpmapper://auth?state=...&code=...}. Solo se acepta la vuelta si el
 * state coincide con el de un inicio de sesion pendiente (de menos de 10 minutos); el codigo se
 * canjea con el verifier (sin el, un codigo robado no sirve) y el verifier se borra.
 * <p>
 * La sesion (token de refresco y nombre de usuario) se guarda CIFRADA con una clave AES-GCM del
 * Android Keystore (no exportable); el token de acceso solo vive en memoria. Cerrar sesion
 * revoca el token en el servidor (si se puede) y lo borra todo del telefono.
 * <p>
 * Los perfiles se suben y restauran con las funciones backup_* de la base de datos
 * (supabase/migrations/20261114070000_copias_de_perfiles.sql): solo el dueno ve su copia.
 */
public final class CloudBackup {
    static final String PROJECT = "https://gshyhrthaksriamjqdtf.supabase.co";
    /** Vuelta del navegador (anadida en Supabase: Authentication > URL Configuration > Redirect URLs). */
    public static final String REDIRECT = "gpmapper://auth";
    private static final String PREFS = "nube";
    private static final String KEY_ALIAS = "gpm_nube_sesion";
    private static final long PENDING_MAX_MS = 10 * 60 * 1000L;
    private static final int MAX_RESPONSE = 4 * 1024 * 1024, MAX_CONF = 16 * 1024;
    private static final Pattern STATE = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final Pattern CODE = Pattern.compile("^[A-Za-z0-9._~-]{8,512}$");

    private static String accessToken;
    private static long accessExpires;

    private CloudBackup() {
    }

    // ---------------------------------------------------------------- sesion

    /** ¿Hay sesion guardada? */
    public static boolean signedIn(Context c) {
        return prefs(c).contains("sesion");
    }

    /** Nombre de usuario de GitHub de la sesion ("" si no hay). */
    public static String user(Context c) {
        JSONObject s = session(c);
        return s == null ? "" : s.optString("user", "");
    }

    /**
     * Empieza el inicio de sesion: guarda (cifrados) el verifier y el state y devuelve la direccion
     * que hay que abrir en el navegador.
     */
    public static Uri beginSignIn(Context c) throws IOException {
        SecureRandom r = new SecureRandom();
        byte[] v = new byte[48], st = new byte[32];
        r.nextBytes(v);
        r.nextBytes(st);
        String verifier = b64(v), state = b64(st);
        String challenge;
        try {
            challenge = b64(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (Exception e) {
            throw new IOException(e.getMessage());
        }
        JSONObject p = new JSONObject();
        try {
            p.put("verifier", verifier).put("state", state).put("t", System.currentTimeMillis());
        } catch (JSONException e) {
            throw new IOException(e.getMessage());
        }
        prefs(c).edit().putString("pendiente", encrypt(p.toString())).apply();
        return Uri.parse(PROJECT + "/auth/v1/authorize").buildUpon()
                .appendQueryParameter("provider", "github")
                .appendQueryParameter("redirect_to", REDIRECT + "?state=" + state)
                .appendQueryParameter("code_challenge", challenge)
                .appendQueryParameter("code_challenge_method", "s256")
                .build();
    }

    /**
     * Vuelta del navegador (gpmapper://auth?...). Comprueba el state, canjea el codigo y guarda la
     * sesion. Devuelve el usuario. Llamar fuera del hilo principal.
     */
    public static String finishSignIn(Context c, Uri u) throws IOException {
        String enc = prefs(c).getString("pendiente", null);
        prefs(c).edit().remove("pendiente").apply();   // un solo intento por inicio de sesion
        if (enc == null) throw new IOException(L.t("No hay ningún inicio de sesión pendiente"));
        String verifier, state;
        try {
            JSONObject p = new JSONObject(decrypt(enc));
            verifier = p.getString("verifier");
            state = p.getString("state");
            if (Math.abs(System.currentTimeMillis() - p.getLong("t")) > PENDING_MAX_MS)
                throw new IOException(L.t("El inicio de sesión ha caducado: vuelve a intentarlo"));
        } catch (JSONException e) {
            throw new IOException(L.t("No hay ningún inicio de sesión pendiente"));
        }
        String gotState = u.getQueryParameter("state");
        if (gotState == null || !STATE.matcher(gotState).matches()
                || !MessageDigest.isEqual(gotState.getBytes(StandardCharsets.US_ASCII), state.getBytes(StandardCharsets.US_ASCII))) {
            throw new IOException(L.t("Respuesta de inicio de sesión no válida"));
        }
        String error = u.getQueryParameter("error_description");
        if (error == null) error = u.getQueryParameter("error");
        if (error != null) throw new IOException(L.t("GitHub no permitió el inicio de sesión"));
        String code = u.getQueryParameter("code");
        if (code == null || !CODE.matcher(code).matches()) throw new IOException(L.t("Respuesta de inicio de sesión no válida"));
        try {
            JSONObject body = new JSONObject().put("auth_code", code).put("code_verifier", verifier);
            return saveTokens(c, post(PROJECT + "/auth/v1/token?grant_type=pkce", body, null), "");
        } catch (JSONException e) {
            throw new IOException(L.t("Respuesta no válida del servidor"));
        }
    }

    /** Cierra la sesion: revoca el token (si hay conexion) y borra todo lo guardado. */
    public static void signOut(Context c) {
        String at = accessToken;
        accessToken = null;
        accessExpires = 0;
        prefs(c).edit().clear().apply();
        try {
            KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
            ks.load(null);
            ks.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
        }
        if (at != null) {
            try {
                post(PROJECT + "/auth/v1/logout?scope=local", new JSONObject(), at);
            } catch (IOException ignored) {
                // sin conexion: el token de acceso caduca solo en una hora
            }
        }
    }

    private static String saveTokens(Context c, String json, String fallbackUser) throws IOException {
        try {
            JSONObject o = new JSONObject(json);
            String at = o.getString("access_token"), rt = o.getString("refresh_token");
            if (at.isEmpty() || rt.isEmpty() || rt.length() > 2048) throw new IOException(L.t("Respuesta no válida del servidor"));
            String user = "";
            JSONObject u = o.optJSONObject("user");
            if (u != null) {
                JSONObject meta = u.optJSONObject("user_metadata");
                if (meta != null) user = meta.optString("user_name", meta.optString("preferred_username", ""));
            }
            user = user.replaceAll("[^A-Za-z0-9-]", "");
            if (user.isEmpty()) user = fallbackUser;
            if (user.length() > 39) user = user.substring(0, 39);
            JSONObject s = new JSONObject().put("rt", rt).put("user", user);
            prefs(c).edit().putString("sesion", encrypt(s.toString())).apply();
            accessToken = at;
            accessExpires = System.currentTimeMillis() + Math.max(60, o.optLong("expires_in", 3600) - 60) * 1000L;
            return user;
        } catch (JSONException e) {
            throw new IOException(L.t("Respuesta no válida del servidor"));
        }
    }

    private static JSONObject session(Context c) {
        String enc = prefs(c).getString("sesion", null);
        if (enc == null) return null;
        try {
            return new JSONObject(decrypt(enc));
        } catch (Exception e) {
            return null;
        }
    }

    /** Token de acceso valido (lo renueva con el de refresco si hace falta). */
    private static synchronized String token(Context c, boolean force) throws IOException {
        if (!force && accessToken != null && System.currentTimeMillis() < accessExpires) return accessToken;
        JSONObject s = session(c);
        if (s == null) throw new IOException(L.t("Inicia sesión con GitHub"));
        try {
            String json = post(PROJECT + "/auth/v1/token?grant_type=refresh_token",
                    new JSONObject().put("refresh_token", s.getString("rt")), null);
            saveTokens(c, json, s.optString("user", ""));   // el token de refresco cambia en cada uso
            return accessToken;
        } catch (HttpError e) {
            if (e.code == 400 || e.code == 401) {   // sesion revocada o caducada: hay que volver a entrar
                signOut(c);
                throw new IOException(L.t("La sesión ha caducado: vuelve a iniciar sesión con GitHub"));
            }
            throw e;
        } catch (JSONException e) {
            throw new IOException(L.t("Respuesta no válida del servidor"));
        }
    }

    // ---------------------------------------------------------------- copia

    /** Un perfil de la copia. */
    public static final class Remote {
        public String fileName;
        public long updatedAt;
        public int size;
    }

    /** Sube todos los perfiles del telefono. Devuelve {subidos, con error}. Llamar fuera del hilo principal. */
    public static int[] uploadAll(Context c) throws IOException {
        File[] files = Profile.profilesDir().listFiles((d, n) -> n.matches(Library.SAFE_CONF_NAME));
        int ok = 0, bad = 0;
        if (files == null) return new int[]{0, 0};
        java.util.Arrays.sort(files);
        for (File f : files) {
            if (ok + bad >= 200) break;
            String conf;
            try (InputStream in = new FileInputStream(f)) {
                conf = new String(Library.readBytes(in, MAX_CONF), StandardCharsets.UTF_8);
                Library.validate(conf);
            } catch (IOException e) {
                bad++;
                continue;
            }
            try {
                rpc(c, "backup_put", new JSONObject().put("p_file_name", f.getName()).put("p_conf", conf));
                ok++;
            } catch (HttpError e) {
                if (e.code == 429 || "RATE_LIMIT".equals(e.serverCode) || "LIMIT".equals(e.serverCode)) throw e;
                bad++;
            } catch (JSONException e) {
                bad++;
            }
        }
        return new int[]{ok, bad};
    }

    /** Lista la copia. Llamar fuera del hilo principal. */
    public static List<Remote> list(Context c) throws IOException {
        try {
            JSONArray a = new JSONArray(rpc(c, "backup_list", new JSONObject()));
            List<Remote> out = new ArrayList<>();
            for (int i = 0; i < a.length() && i < 200; i++) {
                JSONObject o = a.getJSONObject(i);
                Remote r = new Remote();
                r.fileName = o.optString("file_name", "");
                if (!r.fileName.matches(Library.SAFE_CONF_NAME)) continue;
                r.size = o.optInt("size", 0);
                out.add(r);
            }
            return out;
        } catch (JSONException e) {
            throw new IOException(L.t("Respuesta no válida del servidor"));
        }
    }

    /**
     * Descarga toda la copia y la valida como un .zip importado (nombre seguro, perfil valido, sin
     * paquetes sensibles). No escribe nada: MainActivity pregunta antes de sustituir perfiles.
     */
    public static List<Library.ZipProfile> downloadAll(Context c) throws IOException {
        List<Library.ZipProfile> out = new ArrayList<>();
        for (Remote r : list(c)) {
            try {
                JSONArray a = new JSONArray(rpc(c, "backup_get", new JSONObject().put("p_file_name", r.fileName)));
                if (a.length() != 1) continue;
                String conf = a.getJSONObject(0).optString("conf", "");
                if (conf.length() > MAX_CONF) continue;
                out.add(new Library.ZipProfile(r.fileName, conf, Library.validate(conf)));
            } catch (HttpError e) {
                if (e.code == 401 || e.code == 429 || e.code >= 500 || "RATE_LIMIT".equals(e.serverCode)) throw e;
                // ya no esta en la copia: se salta
            } catch (JSONException | IOException e) {
                // perfil no valido: se salta
            }
        }
        return out;
    }

    /** Borra toda la copia de la nube (no los perfiles del telefono). Devuelve cuantos. */
    public static int deleteAll(Context c) throws IOException {
        String r = rpc(c, "backup_delete_all", new JSONObject()).trim();
        try {
            return Integer.parseInt(r);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    // ---------------------------------------------------------------- HTTP

    /** Error HTTP con el codigo y, si el servidor lo da, su "CODIGO|mensaje". */
    static final class HttpError extends IOException {
        final int code;
        final String serverCode;

        HttpError(int code, String serverCode, String msg) {
            super(msg);
            this.code = code;
            this.serverCode = serverCode;
        }
    }

    private static String rpc(Context c, String fn, JSONObject body) throws IOException {
        try {
            return post(Community.API + "rpc/" + fn, body, token(c, false));
        } catch (HttpError e) {
            if (e.code != 401) throw e;
            return post(Community.API + "rpc/" + fn, body, token(c, true));   // token caducado: renovar una vez
        }
    }

    private static String post(String url, JSONObject body, String bearer) throws IOException {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        try {
            h.setConnectTimeout(10000);
            h.setReadTimeout(20000);
            h.setInstanceFollowRedirects(false);
            h.setUseCaches(false);
            h.setRequestMethod("POST");
            h.setDoOutput(true);
            h.setRequestProperty("apikey", Community.KEY);
            if (bearer != null) h.setRequestProperty("Authorization", "Bearer " + bearer);
            h.setRequestProperty("Content-Type", "application/json");
            h.setRequestProperty("Accept", "application/json");
            h.setRequestProperty("User-Agent", "GamepadMapperPluton");
            byte[] b = body.toString().getBytes(StandardCharsets.UTF_8);
            h.setFixedLengthStreamingMode(b.length);
            try (OutputStream out = h.getOutputStream()) {
                out.write(b);
            }
            int code = h.getResponseCode();
            if (code < 200 || code >= 300) {
                String server = "", msg = L.t("El servidor respondió ") + code;
                try (InputStream err = h.getErrorStream()) {
                    if (err != null) {
                        JSONObject o = new JSONObject(new String(Library.readBytes(err, 8192), StandardCharsets.UTF_8));
                        String m = o.optString("message", "");
                        int bar = m.indexOf('|');
                        if (bar > 0 && bar < 40) {
                            server = m.substring(0, bar);
                            msg = m.substring(bar + 1);
                        }
                    }
                } catch (JSONException | IOException ignored) {
                    // sin mensaje legible
                }
                throw new HttpError(code, server, msg);
            }
            if (code == 204) return "";
            try (InputStream in = h.getInputStream()) {
                return new String(Library.readBytes(in, MAX_RESPONSE), StandardCharsets.UTF_8);
            }
        } finally {
            h.disconnect();
        }
    }

    // ---------------------------------------------------------------- cifrado (Android Keystore)

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return kg.generateKey();
    }

    private static String encrypt(String plain) throws IOException {
        try {
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = ci.getIV(), ct = ci.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] all = new byte[1 + iv.length + ct.length];
            all[0] = (byte) iv.length;
            System.arraycopy(iv, 0, all, 1, iv.length);
            System.arraycopy(ct, 0, all, 1 + iv.length, ct.length);
            return Base64.encodeToString(all, Base64.NO_WRAP);
        } catch (Exception e) {
            throw new IOException(L.t("No se pudo guardar la sesión de forma segura"));
        }
    }

    private static String decrypt(String enc) throws IOException {
        try {
            byte[] all = Base64.decode(enc, Base64.NO_WRAP);
            int n = all[0];
            if (n < 12 || n > 16 || all.length < 1 + n + 16) throw new IOException("iv");
            Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
            ci.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 1, n));
            return new String(ci.doFinal(all, 1 + n, all.length - 1 - n), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IOException(L.t("No se pudo leer la sesión guardada"));
        }
    }

    private static String b64(byte[] b) {
        return Base64.encodeToString(b, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }
}
