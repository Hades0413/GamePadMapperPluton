package com.gamepadmapper.app;

import android.content.Context;
import android.os.Environment;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Modo root (opcional): el modulo Magisk "Gamepad Mapper Pluton (root)" hace el mapeo a nivel
 * del sistema (gpmapper). Es mas rapido y preciso que el servicio de accesibilidad.
 * El zip del modulo va dentro del APK (assets/gamepad_mapper.zip): no hace falta internet.
 */
public final class RootMode {
    /**
     * Repositorio del proyecto (descargas, codigo, novedades). Mientras sea el de ejemplo
     * (contiene "TU_USUARIO") la app no muestra el boton del repositorio.
     */
    public static final String REPO_URL = "https://github.com/Hades0413/GamePadMapperPluton";
    public static final String MODULE_ASSET = "gamepad_mapper.zip";
    /** Compilacion de gpmapper que lleva esta app (igual que GPM_BUILD en gpmapper.c). */
    public static final int MODULE_BUILD = 5;
    /** Nombre con version: no se confunde con zips de versiones anteriores en Descargas. */
    public static final String MODULE_FILE = "GamepadMapperPluton-root-v" + MODULE_BUILD + ".zip";

    private RootMode() {
    }

    public static boolean hasRepo() {
        return !REPO_URL.contains("TU_USUARIO");
    }

    /** ¿El telefono tiene root? (Magisk instalado o un binario su). */
    public static boolean detected(Context c) {
        try {
            c.getPackageManager().getPackageInfo("com.topjohnwu.magisk", 0);
            return true;
        } catch (Exception ignored) {
        }
        for (String d : new String[]{"/system/bin", "/system/xbin", "/sbin", "/debug_ramdisk", "/su/bin",
                "/data/adb/magisk", "/data/adb/ksu/bin", "/data/adb/ap/bin"}) {
            if (new File(d, "su").exists() || new File(d, "magisk").exists() || new File(d, "ksud").exists())
                return true;
        }
        return false;
    }

    /** ¿El modulo root esta funcionando? (gpmapper como root escribe status.txt). */
    public static boolean active() {
        Mapper.Status s = Mapper.status();
        return s.running && s.root;
    }

    /** Copia el modulo incluido en la app a Descargas. Devuelve el archivo creado. */
    /**
     * Guarda el modulo en Descargas sin permisos (Android 10+, MediaStore). Si ya hay un archivo con
     * ese nombre (de otra instalacion), Android le pone "(1)". Devuelve el nombre guardado.
     * En Android 8-9 no se puede sin permiso: usar writeModule() con un "Guardar como" (SAF).
     */
    public static String exportModule(Context c) throws IOException {
        if (android.os.Build.VERSION.SDK_INT < 29) throw new IOException("SAF");
        android.content.ContentValues v = new android.content.ContentValues();
        v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, MODULE_FILE);
        v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/zip");
        v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        android.content.ContentResolver cr = c.getContentResolver();
        android.net.Uri uri = cr.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
        if (uri == null) throw new IOException(L.t("No se pudo abrir Descargas"));
        try (OutputStream o = cr.openOutputStream(uri)) {
            writeModule(c, o);
        } catch (IOException e) {
            cr.delete(uri, null, null);
            throw e;
        }
        String name = MODULE_FILE;
        try (android.database.Cursor q = cr.query(uri, new String[]{android.provider.MediaStore.MediaColumns.DISPLAY_NAME},
                null, null, null)) {
            if (q != null && q.moveToFirst()) name = q.getString(0);
        }
        return name;
    }

    /** Copia el modulo (incluido en la app) a un destino ya abierto. */
    public static void writeModule(Context c, OutputStream o) throws IOException {
        if (o == null) throw new IOException(L.t("No se pudo crear el archivo"));
        try (InputStream in = c.getAssets().open(MODULE_ASSET)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
        }
    }
}
