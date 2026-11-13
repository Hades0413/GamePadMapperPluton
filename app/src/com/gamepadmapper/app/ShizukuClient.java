package com.gamepadmapper.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Binder;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.Parcel;
import android.os.RemoteException;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Cliente minimo de Shizuku (https://shizuku.rikka.app), sin librerias.
 * <p>
 * Shizuku es una app gratuita que se activa con la depuracion inalambrica del propio telefono
 * (sin PC) y deja a otras apps ejecutar procesos como el usuario "shell" de ADB. Con eso,
 * gpmapper funciona igual que con root: lee el mando directamente y crea la pantalla tactil
 * virtual (modo rapido: menos retraso, sticks en cualquier Android).
 * <p>
 * Protocolo (Shizuku-API, Apache 2.0): el servidor de Shizuku llama al ContentProvider de la
 * app ({@link Provider}, autoridad "&lt;paquete&gt;.shizuku") con "sendBinder" y un
 * moe.shizuku.api.BinderContainer. Con ese binder (IShizukuService) la app se presenta
 * (attachApplication), pide permiso y lanza procesos (newProcess).
 * Codigos de transaccion = numero del AIDL + 1 (FIRST_CALL_TRANSACTION).
 */
public final class ShizukuClient {
    public static final String MANAGER_PACKAGE = "moe.shizuku.privileged.api";
    private static final String SERVICE = "moe.shizuku.server.IShizukuService";
    private static final String APPLICATION = "moe.shizuku.server.IShizukuApplication";
    private static final String EXTRA_BINDER = "moe.shizuku.privileged.api.intent.extra.BINDER";
    private static final int API_VERSION = 13;

    // IShizukuService (AIDL "= N" -> N + 1)
    private static final int TX_GET_VERSION = 3, TX_GET_UID = 4, TX_NEW_PROCESS = 8, TX_REQUEST_PERMISSION = 15,
            TX_CHECK_SELF_PERMISSION = 16, TX_ATTACH_APPLICATION = 18;
    // IShizukuApplication
    private static final int TX_BIND_APPLICATION = 2, TX_PERMISSION_RESULT = 3, TX_SHOW_CONFIRMATION = 10001;

    private static volatile IBinder service;
    private static volatile boolean permission;
    private static volatile int serverUid = -1;
    private static Runnable listener;
    private static final Handler main = new Handler(Looper.getMainLooper());

    private ShizukuClient() {
    }

    /** Se llama cuando cambia algo (conexion, permiso). */
    public static void setListener(Runnable r) {
        listener = r;
    }

    private static void changed() {
        Runnable r = listener;
        if (r != null) main.post(r);
    }

    public static boolean installed(Context c) {
        try {
            c.getPackageManager().getPackageInfo(MANAGER_PACKAGE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Shizuku esta en marcha y nos ha dado su binder. */
    public static boolean running() {
        IBinder b = service;
        return b != null && b.pingBinder();
    }

    public static boolean hasPermission() {
        if (!running()) return false;
        if (permission) return true;
        try {
            permission = callBoolean(TX_CHECK_SELF_PERMISSION);
        } catch (Exception ignored) {
        }
        return permission;
    }

    /** uid del servidor: 2000 = shell (ADB / depuracion inalambrica), 0 = root. */
    public static int serverUid() {
        return serverUid;
    }

    // ------------------------------------------------------------------ binder recibido
    static void onBinderReceived(IBinder b, String packageName) {
        if (b == null) return;
        service = b;
        try {
            b.linkToDeath(() -> {
                service = null;
                permission = false;
                changed();
            }, 0);
        } catch (RemoteException ignored) {
        }
        attach(packageName);
        changed();
    }

    /** attachApplication (API 13): presenta la app y registra el receptor de respuestas. */
    private static void attach(String packageName) {
        IBinder b = service;
        if (b == null) return;
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(SERVICE);
            data.writeStrongBinder(APP_STUB);
            Bundle args = new Bundle();
            args.putInt("shizuku:attach-api-version", API_VERSION);
            args.putString("shizuku:attach-package-name", packageName);
            data.writeInt(1);
            args.writeToParcel(data, 0);
            b.transact(TX_ATTACH_APPLICATION, data, reply, 0);
            reply.readException();
        } catch (Exception ignored) {
            // servidores antiguos: el permiso se consultara con checkSelfPermission
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    /** Receptor de Shizuku (IShizukuApplication): datos al conectar y resultado del permiso. */
    private static final Binder APP_STUB = new Binder() {
        {
            attachInterface(null, APPLICATION);
        }

        @Override
        protected boolean onTransact(int code, Parcel data, Parcel reply, int flags) throws RemoteException {
            switch (code) {
                case TX_BIND_APPLICATION: {
                    data.enforceInterface(APPLICATION);
                    Bundle b = data.readInt() != 0 ? Bundle.CREATOR.createFromParcel(data) : null;
                    if (b != null) {
                        serverUid = b.getInt("shizuku:attach-reply-uid", -1);
                        permission = b.getBoolean("shizuku:attach-reply-permission-granted", false);
                    }
                    autoStart();
                    changed();
                    return true;
                }
                case TX_PERMISSION_RESULT: {
                    data.enforceInterface(APPLICATION);
                    data.readInt();   // requestCode
                    Bundle b = data.readInt() != 0 ? Bundle.CREATOR.createFromParcel(data) : null;
                    permission = b != null && b.getBoolean("shizuku:request-permission-reply-allowed", false);
                    changed();
                    return true;
                }
                case TX_SHOW_CONFIRMATION:   // solo para Sui; no aplica
                    data.enforceInterface(APPLICATION);
                    if (reply != null) reply.writeNoException();
                    return true;
                default:
                    return super.onTransact(code, data, reply, flags);
            }
        }
    };

    // ------------------------------------------------------------------ llamadas
    private static boolean callBoolean(int code) throws RemoteException {
        IBinder b = service;
        if (b == null) throw new RemoteException("Shizuku no conectado");
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(SERVICE);
            b.transact(code, data, reply, 0);
            reply.readException();
            return reply.readInt() != 0;
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    /** Muestra el dialogo de permiso de Shizuku. El resultado llega al listener. */
    public static void requestPermission() {
        IBinder b = service;
        if (b == null) return;
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(SERVICE);
            data.writeInt(1);   // requestCode
            b.transact(TX_REQUEST_PERMISSION, data, reply, 0);
            reply.readException();
        } catch (Exception ignored) {
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    /** Ejecuta "sh -c cmd" como el usuario de Shizuku (shell). Devuelve el binder del proceso. */
    public static IBinder exec(String cmd) throws RemoteException {
        IBinder b = service;
        if (b == null) throw new RemoteException("Shizuku no conectado");
        Parcel data = Parcel.obtain(), reply = Parcel.obtain();
        try {
            data.writeInterfaceToken(SERVICE);
            data.writeStringArray(new String[]{"sh", "-c", cmd});
            data.writeStringArray(null);   // env
            data.writeString(null);        // dir
            b.transact(TX_NEW_PROCESS, data, reply, 0);
            reply.readException();
            return reply.readStrongBinder();
        } finally {
            data.recycle();
            reply.recycle();
        }
    }

    // ------------------------------------------------------------------ modo rapido
    /**
     * Copia gpmapper (incluido en la app) a <base>/bin y lo lanza a traves de
     * Shizuku como el usuario shell, en segundo plano y reiniciandolo si se cierra. Opciones:
     * -R gira segun la rotacion que escribe la app, -t reenvia mandos en modo tactil,
     * -p 7a02 pantalla virtual sin IDC.
     */
    public static void startMapper(Context c) throws IOException, RemoteException {
        File dir = new File(Profile.baseDir(), "bin");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("No se pudo crear " + dir);
        File bin = new File(dir, "gpmapper");
        File tmp = new File(dir, "gpmapper.tmp");
        // Huellas del binario original: en Android 10 o anterior otras apps pueden escribir en esta
        // carpeta, asi que la copia en /data/local/tmp se comprueba antes de ejecutarla.
        java.security.MessageDigest sha, md5;
        try {
            sha = java.security.MessageDigest.getInstance("SHA-256");
            md5 = java.security.MessageDigest.getInstance("MD5");
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
        try (InputStream in = c.getAssets().open("gpmapper"); OutputStream out = new FileOutputStream(tmp)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                sha.update(buf, 0, n);
                md5.update(buf, 0, n);
            }
        }
        String shaHex = hex(sha.digest()), md5Hex = hex(md5.digest());
        if (!tmp.renameTo(bin)) {
            //noinspection ResultOfMethodCallIgnored
            bin.delete();
            if (!tmp.renameTo(bin)) throw new IOException("No se pudo guardar " + bin);
        }
        String D = Profile.baseDir().getAbsolutePath();
        if (!D.matches("[A-Za-z0-9/._-]+")) throw new IOException("Ruta no válida: " + D);
        String B = "/data/local/tmp/gpmapper-pluton";
        // Los [] evitan que pkill se encuentre a si mismo en esta linea de comandos.
        // La copia en /data/local/tmp (solo la escribe el usuario shell) se comprueba con SHA-256
        // (o MD5 en Android antiguo sin sha256sum); si no coincide, se borra y no se ejecuta.
        String verify = "if command -v sha256sum >/dev/null 2>&1; then h=$(sha256sum " + B + "); want=" + shaHex
                + "; else h=$(md5sum " + B + "); want=" + md5Hex + "; fi; [ \"${h%% *}\" = \"$want\" ]";
        String cmd = "pkill -f 'gpmapper-pluto[n]'; sleep 0.3; "
                + "cp '" + D + "/bin/gpmapper' " + B + " && chmod 755 " + B + " && { " + verify
                + " || { rm -f " + B + "; echo 'gpmapper alterado: no se ejecuta' >> '" + D + "/mapper.log'; exit 1; }; } && "
                + "mkdir -p '" + D + "/profiles' && "
                + "(setsid nohup sh -c 'while true; do " + B + " -d \"" + D + "/profiles\" -R -t -p 7a02 >> \"" + D
                + "/mapper.log\" 2>&1; sleep 3; done' > /dev/null 2>&1 < /dev/null &)";
        exec(cmd);
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder(b.length * 2);
        for (byte x : b) s.append(String.format(java.util.Locale.ROOT, "%02x", x));
        return s.toString();
    }

    public static void stopMapper() throws RemoteException {
        exec("pkill -f 'gpmapper-pluto[n]'");
    }

    private static Context appCtx;

    public static boolean autoEnabled(Context c) {
        return c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE).getBoolean("fast_mode", false);
    }

    public static void setAuto(Context c, boolean on) {
        c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE).edit().putBoolean("fast_mode", on).apply();
    }

    /** Si el usuario dejo activado el modo rapido, lanzarlo en cuanto Shizuku conecte. */
    static void autoStart() {
        final Context c = appCtx;
        if (c == null || !permission || !autoEnabled(c)) return;
        new Thread(() -> {
            if (Mapper.status().running) return;   // ya esta (o el modulo root)
            try {
                startMapper(c);
            } catch (Exception ignored) {
            }
        }).start();
    }

    // ------------------------------------------------------------------ proveedor
    /** Shizuku entrega aqui su binder ("sendBinder"). Autoridad: com.gamepadmapper.app.shizuku */
    public static class Provider extends ContentProvider {
        @Override
        public boolean onCreate() {
            if (getContext() != null) appCtx = getContext().getApplicationContext();
            return true;
        }

        @Override
        public Bundle call(String method, String arg, Bundle extras) {
            if (extras == null) return null;
            extras.setClassLoader(moe.shizuku.api.BinderContainer.class.getClassLoader());
            if ("sendBinder".equals(method)) {
                if (!running()) {
                    moe.shizuku.api.BinderContainer bc = extras.getParcelable(EXTRA_BINDER);
                    if (bc != null && bc.binder != null) onBinderReceived(bc.binder, getContext().getPackageName());
                }
                return new Bundle();
            } else if ("getBinder".equals(method)) {
                IBinder b = service;
                if (b == null || !b.pingBinder()) return null;
                Bundle r = new Bundle();
                r.putParcelable(EXTRA_BINDER, new moe.shizuku.api.BinderContainer(b));
                return r;
            }
            return null;
        }

        @Override
        public Cursor query(Uri uri, String[] p, String s, String[] a, String o) {
            return null;
        }

        @Override
        public String getType(Uri uri) {
            return null;
        }

        @Override
        public Uri insert(Uri uri, ContentValues values) {
            return null;
        }

        @Override
        public int delete(Uri uri, String s, String[] a) {
            return 0;
        }

        @Override
        public int update(Uri uri, ContentValues v, String s, String[] a) {
            return 0;
        }
    }
}
