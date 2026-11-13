package com.gamepadmapper.app;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Imagenes de los juegos de la comunidad (iconos y capturas). Solo descarga direcciones del
 * Storage del proyecto (Community.IMAGE), como mucho 1 MB, y las guarda en cache (memoria y disco)
 * para no repetir descargas ni gastar datos.
 */
final class RemoteImage {
    interface Callback {
        void loaded(Bitmap bitmap);
    }

    private static final int MAX_BYTES = 1024 * 1024;
    private static final LruCache<String, Bitmap> MEMORY = new LruCache<String, Bitmap>(12 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap value) {
            return value.getByteCount();
        }
    };
    private static final ExecutorService POOL = Executors.newFixedThreadPool(3);

    private RemoteImage() {
    }

    /** Carga la imagen (reducida a maxPx de ancho) y llama a cb en el hilo principal si lo consigue. */
    static void load(Activity a, String url, int maxPx, Callback cb) {
        if (url == null || !Community.IMAGE.matcher(url).matches()) return;
        String key = url + "#" + maxPx;
        Bitmap cached = MEMORY.get(key);
        if (cached != null) {
            cb.loaded(cached);
            return;
        }
        POOL.execute(() -> {
            try {
                byte[] data = bytes(a, url);
                Bitmap bmp = decode(data, maxPx);
                if (bmp == null) return;
                MEMORY.put(key, bmp);
                a.runOnUiThread(() -> {
                    if (!a.isFinishing()) cb.loaded(bmp);
                });
            } catch (IOException | RuntimeException ignored) {
                // sin conexion o imagen no valida: se queda la imagen por defecto
            }
        });
    }

    private static byte[] bytes(Context c, String url) throws IOException {
        File dir = new File(c.getCacheDir(), "community");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File f = new File(dir, "img-" + sha1(url));
        if (f.exists() && f.length() > 0 && f.length() <= MAX_BYTES) {
            try (InputStream in = new FileInputStream(f)) {
                return Library.readBytes(in, MAX_BYTES);
            }
        }
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        try {
            h.setConnectTimeout(10000);
            h.setReadTimeout(15000);
            h.setInstanceFollowRedirects(false);
            h.setRequestProperty("User-Agent", "GamepadMapperPluton");
            if (h.getResponseCode() != 200) throw new IOException("HTTP " + h.getResponseCode());
            String type = h.getContentType();
            if (type == null || !type.matches("image/(png|jpeg|webp).*")) throw new IOException("tipo " + type);
            byte[] data;
            try (InputStream in = h.getInputStream()) {
                data = Library.readBytes(in, MAX_BYTES);
            }
            File tmp = new File(dir, f.getName() + ".tmp");
            try (OutputStream out = new FileOutputStream(tmp)) {
                out.write(data);
            }
            if (!tmp.renameTo(f)) //noinspection ResultOfMethodCallIgnored
                tmp.delete();
            return data;
        } finally {
            h.disconnect();
        }
    }

    private static Bitmap decode(byte[] data, int maxPx) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, o);
        if (o.outWidth <= 0 || o.outHeight <= 0 || o.outWidth > 8000 || o.outHeight > 8000) return null;
        int sample = 1;
        while (o.outWidth / (sample * 2) >= maxPx) sample *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = sample;
        return BitmapFactory.decodeByteArray(data, 0, data.length, d);
    }

    private static String sha1(String s) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-1").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder b = new StringBuilder();
            for (byte x : h) b.append(String.format(java.util.Locale.ROOT, "%02x", x));
            return b.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
