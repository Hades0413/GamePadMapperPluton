package com.gamepadmapper.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Perfiles de versiones anteriores (1.0/1.1), que vivian en /sdcard/gamepad-mapper. Sin el permiso
 * de "todos los archivos" la app no puede leer esa carpeta por su cuenta: el usuario la elige una
 * vez en el selector de Android (ACTION_OPEN_DOCUMENT_TREE) y se copian los perfiles.
 * (Con el modulo root, service.sh los migra solo.)
 */
final class Migrate {
    private static final String STORAGE = "com.android.externalstorage.documents";

    private Migrate() {
    }

    /** ¿Ofrecer la importacion? Solo si aun no hay perfiles y no se descarto. */
    static boolean offer(Context c) {
        if (prefs(c).getBoolean("legacy_done", false)) return false;
        File[] confs = Profile.profilesDir().listFiles((d, n) -> n.endsWith(".conf"));
        return confs == null || confs.length == 0;
    }

    static void dismiss(Context c) {
        prefs(c).edit().putBoolean("legacy_done", true).apply();
    }

    /** Selector de carpetas abierto directamente en /sdcard/gamepad-mapper. */
    static Intent pickIntent() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        if (Build.VERSION.SDK_INT >= 26) {
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI,
                    DocumentsContract.buildDocumentUri(STORAGE, "primary:" + Profile.LEGACY_DIR));
        }
        return i;
    }

    /**
     * Copia los .conf (de la carpeta elegida o de su subcarpeta "profiles") y active.txt.
     * No pisa perfiles que ya existan. Devuelve cuantos perfiles copio.
     */
    static int importTree(Context c, Uri tree) throws Exception {
        ContentResolver cr = c.getContentResolver();
        String rootId = DocumentsContract.getTreeDocumentId(tree);
        File dst = Profile.profilesDir();
        if (!dst.exists() && !dst.mkdirs()) throw new java.io.IOException("No se pudo crear " + dst);
        int n = copyConfs(cr, tree, rootId, dst);
        String profilesId = childId(cr, tree, rootId, "profiles");
        if (profilesId != null) n += copyConfs(cr, tree, profilesId, dst);
        String activeId = childId(cr, tree, rootId, "active.txt");
        File active = new File(Profile.baseDir(), "active.txt");
        if (activeId != null && !active.exists()) copy(cr, DocumentsContract.buildDocumentUriUsingTree(tree, activeId), active);
        if (n > 0) dismiss(c);
        return n;
    }

    private static int copyConfs(ContentResolver cr, Uri tree, String dirId, File dst) throws Exception {
        int n = 0;
        try (Cursor q = children(cr, tree, dirId)) {
            while (q != null && q.moveToNext()) {
                String id = q.getString(0), name = q.getString(1);
                // Nombre sin rutas ("../") y contenido que sea un perfil valido.
                if (name == null || !name.matches(Library.SAFE_CONF_NAME)) continue;
                File out = new File(dst, name);
                if (out.exists()) continue;   // no pisar perfiles nuevos
                String conf;
                try (InputStream in = cr.openInputStream(DocumentsContract.buildDocumentUriUsingTree(tree, id))) {
                    if (in == null) continue;
                    conf = Library.readLimited(in);
                }
                try {
                    Library.install(conf, out);
                    n++;
                } catch (java.io.IOException ignored) {
                    // no es un perfil valido (o es de una app sensible): se omite
                }
            }
        }
        return n;
    }

    private static String childId(ContentResolver cr, Uri tree, String dirId, String name) {
        try (Cursor q = children(cr, tree, dirId)) {
            while (q != null && q.moveToNext()) if (name.equals(q.getString(1))) return q.getString(0);
        }
        return null;
    }

    private static Cursor children(ContentResolver cr, Uri tree, String dirId) {
        return cr.query(DocumentsContract.buildChildDocumentsUriUsingTree(tree, dirId),
                new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME},
                null, null, null);
    }

    private static void copy(ContentResolver cr, Uri src, File out) throws Exception {
        File tmp = new File(out.getParentFile(), out.getName() + ".tmp");
        try (InputStream in = cr.openInputStream(src); OutputStream os = new FileOutputStream(tmp)) {
            if (in == null) throw new java.io.IOException("No se pudo leer " + src);
            byte[] buf = new byte[16384];
            int r;
            while ((r = in.read(buf)) > 0) os.write(buf, 0, r);
        }
        if (!tmp.renameTo(out)) throw new java.io.IOException("No se pudo guardar " + out);
    }

    private static android.content.SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE);
    }
}
