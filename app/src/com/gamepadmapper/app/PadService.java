package com.gamepadmapper.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.accessibilityservice.GestureDescription;
import android.content.ComponentName;
import android.content.Context;
import android.graphics.Path;
import android.graphics.Point;
import android.graphics.Rect;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Mapeador sin root: servicio de accesibilidad que lee el mando y toca la pantalla.
 * <ul>
 *   <li>Botones: onKeyEvent (cualquier Android).</li>
 *   <li>Sticks, gatillos y cruceta analogica: onMotionEvent con setMotionEventSources
 *       (Android 14+).</li>
 *   <li>Toques: dispatchGesture. Cada dedo es un trazo que se mantiene con continueStroke,
 *       asi que se pueden mantener varios a la vez (stick + botones).</li>
 * </ul>
 * Usa los mismos perfiles que gpmapper (<Profile.baseDir()>/profiles) y el mismo
 * protocolo de L.t("Detectar") (archivos learn / learn_result). Si gpmapper (root) esta en
 * marcha, este servicio no hace nada.
 */
public class PadService extends AccessibilityService {
    /** Ganchos de prueba (debug_pkg, debug_capture) solo en compilaciones depurables, nunca en Play. */
    private boolean debuggable;
    private static final long SEG_MS = 8;          // duracion de cada tramo de gesto
    private static final long TAP_MIN_MS = 30;     // toque pulsado y soltado antes de enviarse
    private static final float AX_PRESS = 0.5f, AX_RELEASE = 0.35f;

    /** Estado para la app (pantalla principal). */
    static volatile boolean running = false;
    static volatile String lastPad = "", lastProfile = "";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WindowManager wm;

    // ------------------------------------------------------------------ ciclo de vida
    /** Instancia conectada (para que el editor pida capturas). null si no esta activo. */
    static volatile PadService instance;
    /** «Probar perfil»: el mando no toca la pantalla; se dibujan circulos donde tocaria. */
    static volatile boolean dryRun = false;
    private GhostView ghost;

    public interface FramesCallback {
        void done(List<android.graphics.Bitmap> frames, String error);
    }

    /** ¿Se pueden hacer capturas para detectar botones? (Android 11+ y servicio activo) */
    public static boolean canCapture() {
        return Build.VERSION.SDK_INT >= 30 && instance != null;
    }

    /**
     * Toma 'n' capturas separadas 'intervalMs' (Android limita a ~3 por segundo), reducidas a
     * 'width' de ancho. Llama a cb en el hilo principal.
     */
    public void captureFrames(final int n, final long intervalMs, final int width, final FramesCallback cb) {
        if (Build.VERSION.SDK_INT < 30) {
            cb.done(null, L.t("Necesita Android 11 o superior"));
            return;
        }
        final List<android.graphics.Bitmap> frames = new ArrayList<>();
        final int[] retries = {0};
        Runnable shot = new Runnable() {
            @Override
            public void run() {
                final Runnable self = this;
                takeScreenshot(android.view.Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
                    @Override
                    public void onSuccess(ScreenshotResult r) {
                        try {
                            android.hardware.HardwareBuffer hb = r.getHardwareBuffer();
                            android.graphics.Bitmap hw = android.graphics.Bitmap.wrapHardwareBuffer(hb, r.getColorSpace());
                            android.graphics.Bitmap sw = hw.copy(android.graphics.Bitmap.Config.ARGB_8888, false);
                            hb.close();
                            int h = Math.max(1, Math.round((float) width * sw.getHeight() / sw.getWidth()));
                            frames.add(android.graphics.Bitmap.createScaledBitmap(sw, width, h, true));
                            sw.recycle();
                        } catch (Exception e) {
                            cb.done(frames, L.t("No se pudo leer la captura: ") + e.getMessage());
                            return;
                        }
                        if (frames.size() >= n) cb.done(frames, null);
                        else handler.postDelayed(self, intervalMs);
                    }

                    @Override
                    public void onFailure(int code) {
                        // Demasiado seguido: reintentar un poco despues.
                        if (code == ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT && retries[0]++ < 10) {
                            handler.postDelayed(self, 200);
                        } else if (frames.size() >= 2) {
                            cb.done(frames, null);
                        } else {
                            cb.done(frames, code == ERROR_TAKE_SCREENSHOT_SECURE_WINDOW
                                    ? L.t("El juego no permite capturas de pantalla") : L.t("No se pudo capturar la pantalla (") + code + ")");
                        }
                    }
                });
            }
        };
        handler.post(shot);
    }

    private void debugCapture() {
        final long t0 = SystemClock.uptimeMillis();
        captureFrames(6, 450, ButtonFinder.WORK_WIDTH, (frames, error) -> {
            dbg(L.t("captura: ") + (frames == null ? 0 : frames.size()) + L.t(" imagenes en ")
                    + (SystemClock.uptimeMillis() - t0) + L.t(" ms") + (error != null ? L.t(" ERROR ") + error : ""));
            if (frames == null || frames.isEmpty()) return;
            screen();
            final int w = scrW, h = scrH;
            new Thread(() -> {
                long t1 = SystemClock.uptimeMillis();
                List<ButtonFinder.Cand> res = ButtonFinder.find(frames, w, h);
                long ms = SystemClock.uptimeMillis() - t1;
                handler.post(() -> {
                    dbg(L.t("analisis: ") + res.size() + L.t(" candidatos en ") + ms + L.t(" ms (pantalla ") + w + "x" + h + ")");
                    for (ButtonFinder.Cand c : res)
                        dbg(String.format(java.util.Locale.ROOT, "  %s x=%.0f y=%.0f r=%.0f %s", c.roleName(), c.x, c.y,
                                c.r, c.include ? "" : "(descartado)"));
                });
            }).start();
        });
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        debuggable = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        L.init(this);   // idioma de la interfaz
        Profile.init(this);
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        running = true;
        instance = this;
        dbg(L.t("servicio conectado (Android ") + Build.VERSION.SDK_INT + ")");
        handler.post(poll);
        handler.post(learnPoll);
        android.hardware.input.InputManager im = (android.hardware.input.InputManager) getSystemService(INPUT_SERVICE);
        if (im != null) im.registerInputDeviceListener(deviceListener, handler);
        Perms.onAccessibilityEnabled(this);   // si venia de la guia: volver a la app
    }

    @Override
    public void onDestroy() {
        setPadWindow(false);
        if (sensors != null) sensors.unregisterListener(gyroListener);
        gyroOn = false;
        applyDryRun(false);
        android.hardware.input.InputManager im = (android.hardware.input.InputManager) getSystemService(INPUT_SERVICE);
        if (im != null) im.unregisterInputDeviceListener(deviceListener);
        running = false;
        instance = null;
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        setPadWindow(false);
        applyDryRun(false);
        running = false;
        instance = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onInterrupt() {
    }

    /** ¿Esta activado en Ajustes > Accesibilidad? */
    public static boolean isEnabled(Context c) {
        String s = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (s == null) return false;
        ComponentName me = new ComponentName(c, PadService.class);
        for (String part : s.split(":")) {
            ComponentName cn = ComponentName.unflattenFromString(part);
            if (me.equals(cn)) return true;
        }
        return false;
    }

    /** Los sticks solo llegan a un servicio de accesibilidad en Android 14+. */
    public static boolean sticksSupported() {
        return Build.VERSION.SDK_INT >= 34 || padWindowWorked;
    }

    /** La ventana del stick obtuvo el foco alguna vez: los sticks funcionan en cualquier Android. */
    static volatile boolean padWindowWorked = false;

    // ------------------------------------------------------------------ juego en primer plano
    private String fgPkg = "";
    private long lastWindowEvent = -10000;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        if (e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED || e.getPackageName() == null) return;
        String pkg = e.getPackageName().toString();
        lastWindowEvent = SystemClock.uptimeMillis();
        CharSequence cls0 = e.getClassName();
        // Nuestra propia app delante: la burbuja se oculta, pero el perfil del juego se mantiene.
        if (pkg.equals(getPackageName())) {
            if (isActivity(pkg, cls0 == null ? null : cls0.toString())) topPkg = pkg;
            return;
        }
        // El teclado no cambia de juego.
        if (pkg.contains("inputmethod") || pkg.contains(".ime")) return;
        if (new File(Profile.baseDir(), "debug_pkg").exists()) return;  // pruebas: app fijada
        // Solo cuenta si se abre una pantalla de verdad (Activity). Una notificacion emergente,
        // un aviso, la barra del sistema o un dialogo de otra app NO sacan del juego: antes se
        // perdia el perfil y el mando dejaba de tocar hasta volver a abrir el juego.
        CharSequence cls = e.getClassName();
        if (!isActivity(pkg, cls == null ? null : cls.toString())) {
            dbg(L.t("ventana ignorada: ") + pkg + "/" + cls);
            return;
        }
        topPkg = pkg;
        if (!pkg.equals(fgPkg)) {
            dbg(L.t("ventana: ") + pkg);
            fgPkg = pkg;
            loadProfile();
        }
    }

    /** App con una pantalla (Activity) delante, incluida esta app. Para la burbuja sin "Acceso de uso". */
    private volatile String topPkg = "";

    /** App en primer plano segun la accesibilidad, o null si el servicio no esta activo. */
    static String topApp() {
        PadService s = instance;
        return s == null ? null : s.topPkg;
    }

    private final Map<String, Boolean> activityCache = new HashMap<>();

    /** ¿Es (pkg, cls) una Activity? Las notificaciones y avisos no lo son. */
    private boolean isActivity(String pkg, String cls) {
        if (cls == null || cls.isEmpty()) return false;
        String k = pkg + "/" + cls;
        Boolean v = activityCache.get(k);
        if (v == null) {
            try {
                getPackageManager().getActivityInfo(new ComponentName(pkg, cls), 0);
                v = true;
            } catch (Exception ex) {
                v = false;
            }
            activityCache.put(k, v);
        }
        return v;
    }

    // ------------------------------------------------------------------ perfiles
    private Profile cur;
    /** Desde cuando se esta usando 'cur' (para preguntar «¿Te funcionó?» despues de jugar). */
    private long curSince;
    private long profSig = 0;
    private boolean daemonRunning = false;
    private boolean enabled = true;   // SELECT + START (1 s) o el boton de Ajustes rapidos pausa
    /** Ultimo estado visto de <base>/paused (solo cuentan los cambios). */
    private boolean pausedSeen = false;

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            // Bateria: con la pantalla apagada no se juega; se comprueba cada 5 s.
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                handler.postDelayed(this, 5000);
                return;
            }
            try {
                // Solo pruebas (compilacion depurable): <base>/debug_pkg fija la app objetivo.
                File force = new File(Profile.baseDir(), "debug_pkg");
                if (debuggable && force.exists()) {
                    String fp = new String(java.nio.file.Files.readAllBytes(force.toPath()), StandardCharsets.UTF_8).trim();
                    if (!fp.equals(fgPkg)) {
                        dbg(L.t("app forzada: ") + fp);
                        fgPkg = fp;
                        loadProfile();
                    }
                } else
                // Respaldo por si no llego el aviso de cambio de ventana (p. ej. el servicio se
                // activo con el juego ya abierto): app en primer plano segun el acceso de uso.
                if (SystemClock.uptimeMillis() - lastWindowEvent > 3000 && Games.hasUsageAccess(PadService.this)) {
                    String fg = Games.foreground(PadService.this);
                    if (fg != null && !fg.isEmpty() && !fg.equals(getPackageName()) && !fg.equals(fgPkg)) {
                        dbg(L.t("primer plano (uso): ") + fg);
                        fgPkg = fg;
                        loadProfile();
                    }
                }
                // Solo pruebas: <base>/debug_capture -> capturar, analizar y escribir en pad.log.
                File dc = new File(Profile.baseDir(), "debug_capture");
                if (debuggable && dc.exists() && dc.delete()) debugCapture();
                checkPausedFlag();
                long sig = dirSignature();
                if (sig != profSig) loadProfile();
                boolean d = Mapper.status().running;
                if (d != daemonRunning) {
                    daemonRunning = d;
                    releaseAll();
                    updateSources();
                }
            } catch (Exception ignored) {
            }
            handler.postDelayed(this, 1000);
        }
    };

    private static long dirSignature() {
        long sig = 0;
        File[] fs = Profile.profilesDir().listFiles((d, n) -> n.endsWith(".conf"));
        if (fs != null) for (File f : fs) sig += f.lastModified() * 31 + f.length() + f.getName().hashCode();
        File act = new File(Profile.baseDir(), "active.txt");
        sig += act.lastModified() * 7 + act.length();
        return sig == 0 ? 1 : sig;
    }

    private void loadProfile() {
        profSig = dirSignature();
        Profile p = null;
        if (!fgPkg.isEmpty()) {
            File f = Library.targetFile(fgPkg);
            if (f.exists()) {
                try {
                    p = Profile.load(f);
                    if (!fgPkg.equals(p.pkg)) p = null;
                } catch (Exception ignored) {
                }
            }
        }
        boolean changed = (p == null) != (cur == null) || (p != null && !p.file.equals(cur.file));
        if (changed || p != null) {
            releaseAll();
            if (changed) {
                if (dryRun) applyDryRun(false);
                if (cur != null) CommunityLinks.onPlayed(this, cur.file, SystemClock.uptimeMillis() - curSince);
                curSince = SystemClock.uptimeMillis();
            }
            cur = p;
            indexProfile();
            lastProfile = p == null ? "" : p.displayName();
            updateSources();
            dbg(L.t("app ") + fgPkg + L.t(" -> perfil ") + (p == null ? "-" : p.file.getName()) + L.t(" fuentes=") + sourcesOn);
        }
    }

    /** Solo capturar el mando mientras haga falta (juego con perfil o detectando). */
    private boolean active() {
        return !daemonRunning && (learning || (cur != null && enabled));
    }

    private boolean sourcesOn = false;

    /**
     * Como se leen los sticks mientras hay un perfil activo:
     * 1. Ventana invisible con foco (padWin), cualquier Android. Es lo preferido: los eventos del
     *    stick no pasan por el filtro de accesibilidad, que en Android 14+ cancela los toques
     *    inyectados con cada evento (no se podia mantener un boton mientras te movias).
     * 2. Respaldo (Android 14+): setMotionEventSources(SOURCE_JOYSTICK), solo si la ventana no
     *    consigue el foco.
     * Sin perfil (u otra app), nada: el mando funciona normal.
     */
    private void updateSources() {
        boolean want = !daemonRunning && (learning || (cur != null && enabled));
        setPadWindow(want);
        updateGyro();
        updateMouseCapture();
        boolean viaA11y = Build.VERSION.SDK_INT >= 34 && !daemonRunning && (learning || cur != null)
                && !(want && padWinFocused);
        if (viaA11y == sourcesOn) return;
        try {
            AccessibilityServiceInfo info = getServiceInfo();
            if (info == null) return;
            info.setMotionEventSources(viaA11y ? InputDevice.SOURCE_JOYSTICK : 0);
            setServiceInfo(info);
            sourcesOn = viaA11y;
            dbg(viaA11y ? L.t("stick por accesibilidad (respaldo)") : L.t("stick por ventana con foco"));
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------ ventana del stick
    private PadWindow padWin;
    private boolean padWinFocused = false;

    /** Ventana de 1x1 px, invisible y sin toques, que toma el foco para recibir el stick. */
    private final class PadWindow extends android.view.View {
        PadWindow() {
            super(PadService.this);
            setFocusable(true);
            setFocusableInTouchMode(true);
        }

        @Override
        public boolean dispatchCapturedPointerEvent(MotionEvent ev) {
            handleMouse(ev);
            return true;
        }

        @Override
        public void onWindowFocusChanged(boolean hasFocus) {
            super.onWindowFocusChanged(hasFocus);
            if (hasFocus) requestFocus();
            padWinFocused = hasFocus;
            if (hasFocus) handler.post(PadService.this::updateMouseCapture);
            if (hasFocus) padWindowWorked = true;
            handler.post(PadService.this::updateSources);
        }

        @Override
        public boolean dispatchGenericMotionEvent(MotionEvent ev) {
            if (!isPadSource(ev.getSource())) return false;
            handleMotion(ev);
            return true;
        }

        @Override
        public boolean dispatchKeyEvent(android.view.KeyEvent ev) {
            // Los botones del mando ya los gestiona onKeyEvent (accesibilidad). Aqui solo llegan
            // teclas que nadie consumio. Atras del telefono: ceder el foco un momento y repetirlo
            // para que lo reciba el juego.
            if (ev.getKeyCode() == android.view.KeyEvent.KEYCODE_BACK && !isPadSource(ev.getSource())) {
                if (ev.getAction() == android.view.KeyEvent.ACTION_UP) passBackToGame();
                return true;
            }
            return isPadSource(ev.getSource());   // teclas del mando sin accion: no al juego
        }
    }

    private void setPadWindow(boolean on) {
        if (wm == null) return;
        if (on && padWin == null) {
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(1, 1,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    // ALT_FOCUSABLE_IM: tiene el foco pero no es destino del teclado, asi el
                    // teclado del juego (chat) sigue yendo al juego.
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                            | WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM,
                    android.graphics.PixelFormat.TRANSPARENT);
            lp.gravity = android.view.Gravity.TOP | android.view.Gravity.START;
            lp.setTitle("GamepadMapperPad");
            PadWindow v = new PadWindow();
            try {
                wm.addView(v, lp);
                padWin = v;
                dbg(L.t("ventana del stick creada"));
            } catch (Exception e) {
                dbg(L.t("ventana del stick no disponible: ") + e);
            }
        } else if (!on && padWin != null) {
            try {
                wm.removeView(padWin);
            } catch (Exception ignored) {
            }
            padWin = null;
            padWinFocused = false;
        }
    }

    // ------------------------------------------------------------------ «Probar perfil»

    /** ¿Se puede usar «Probar perfil»? (accesibilidad activa y sin el motor root en marcha). */
    static boolean canDryRun() {
        PadService s = instance;
        return s != null && !s.daemonRunning;
    }

    /** Activa o quita el modo prueba (solo con la accesibilidad; con root no aplica). */
    static boolean setDryRun(boolean on) {
        PadService s = instance;
        if (s == null || s.daemonRunning) return false;
        s.handler.post(() -> s.applyDryRun(on));
        return true;
    }

    private void applyDryRun(boolean on) {
        if (dryRun == on && (ghost != null) == on) return;
        releaseAll();
        dryRun = on;
        if (on && ghost == null && wm != null) {
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    android.graphics.PixelFormat.TRANSLUCENT);
            lp.gravity = android.view.Gravity.TOP | android.view.Gravity.START;
            if (Build.VERSION.SDK_INT >= 28) {
                lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }
            lp.setTitle("GamepadMapperGhost");
            GhostView g = new GhostView();
            try {
                wm.addView(g, lp);
                ghost = g;
            } catch (Exception e) {
                dryRun = false;
                dbg(L.t("modo prueba no disponible: ") + e);
            }
        } else if (!on && ghost != null) {
            try {
                wm.removeView(ghost);
            } catch (Exception ignored) {
            }
            ghost = null;
        }
    }

    /** Circulos donde tocaria el mando (modo prueba). No recibe toques. */
    private final class GhostView extends android.view.View {
        private final android.graphics.Paint fill = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        private final android.graphics.Paint ring = new android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG);
        private final List<float[]> held = new ArrayList<>();      // x, y, ax, ay, stick
        private final List<float[]> flashes = new ArrayList<>();   // x, y, hasta (uptime ms)
        private final int[] loc = new int[2];

        GhostView() {
            super(PadService.this);
            ring.setStyle(android.graphics.Paint.Style.STROKE);
            ring.setStrokeWidth(getResources().getDisplayMetrics().density * 3);
        }

        void show(List<float[]> nowHeld, List<float[]> taps) {
            held.clear();
            held.addAll(nowHeld);
            long until = SystemClock.uptimeMillis() + 250;
            for (float[] t : taps) flashes.add(new float[]{t[0], t[1], until});
            invalidate();
        }

        @Override
        protected void onDraw(android.graphics.Canvas c) {
            float d = getResources().getDisplayMetrics().density;
            getLocationOnScreen(loc);   // los toques van en coordenadas de pantalla
            c.translate(-loc[0], -loc[1]);
            for (float[] h : held) {
                if (h[4] > 0) {   // joystick: centro y dedo
                    ring.setColor(0x6638E0C8);
                    c.drawCircle(h[2], h[3], 34 * d, ring);
                    c.drawLine(h[2], h[3], h[0], h[1], ring);
                }
                fill.setColor(h[4] > 0 ? 0x9938E0C8 : 0x998B7CFF);
                c.drawCircle(h[0], h[1], 22 * d, fill);
                ring.setColor(0xFFFFFFFF);
                c.drawCircle(h[0], h[1], 22 * d, ring);
            }
            long n = SystemClock.uptimeMillis();
            flashes.removeIf(f -> f[2] < n);
            for (float[] f : flashes) {
                fill.setColor(0x99FFC94D);
                c.drawCircle(f[0], f[1], 18 * d, fill);
            }
            if (!flashes.isEmpty()) postInvalidateDelayed(50);
        }
    }

    private boolean passingBack = false;

    /** Atras del telefono: quitar el foco a la ventana, enviar Atras al juego y recuperarlo. */
    private void passBackToGame() {
        if (padWin == null || passingBack) return;
        passingBack = true;
        WindowManager.LayoutParams lp = (WindowManager.LayoutParams) padWin.getLayoutParams();
        lp.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        try {
            wm.updateViewLayout(padWin, lp);
        } catch (Exception ignored) {
        }
        handler.postDelayed(() -> {
            performGlobalAction(GLOBAL_ACTION_BACK);
            handler.postDelayed(() -> {
                passingBack = false;
                if (padWin == null) return;
                WindowManager.LayoutParams l2 = (WindowManager.LayoutParams) padWin.getLayoutParams();
                l2.flags &= ~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
                try {
                    wm.updateViewLayout(padWin, l2);
                } catch (Exception ignored) {
                }
            }, 300);
        }, 60);
    }

    // ------------------------------------------------------------------ entrada del mando
    private final Set<String> keys = new HashSet<>();         // botones fisicos pulsados
    private final Set<String> virt = new HashSet<>();         // derivados de ejes (cruceta, gatillos)
    private final Map<Integer, Float> axes = new HashMap<>(); // solo al detectar: eje Android -> valor
    private float[] axv = new float[64];                      // ejes del mando que manda ahora
    private final Map<Integer, float[]> devAxes = new HashMap<>();   // ejes de cada mando conectado
    private static final float[] NO_AXES = new float[64];
    private static final int[] AXES_READ = {MotionEvent.AXIS_X, MotionEvent.AXIS_Y, MotionEvent.AXIS_Z,
            MotionEvent.AXIS_RX, MotionEvent.AXIS_RY, MotionEvent.AXIS_RZ, MotionEvent.AXIS_HAT_X,
            MotionEvent.AXIS_HAT_Y, MotionEvent.AXIS_GAS, MotionEvent.AXIS_BRAKE, MotionEvent.AXIS_LTRIGGER,
            MotionEvent.AXIS_RTRIGGER, MotionEvent.AXIS_THROTTLE, MotionEvent.AXIS_RUDDER, MotionEvent.AXIS_WHEEL};
    private final Set<String> axDown = new HashSet<>();       // "AXIS_9+" ... pulsados (histeresis)
    private final Set<String> consumed = new HashSet<>();     // R1/L1 usados en SELECT + R1/L1
    private InputDevice lastDevice;

    /**
     * Mando desconectado (apagado, sin bateria, Bluetooth perdido): soltar todos los dedos y
     * olvidar sus ejes. Sin esto, un stick inclinado al desconectarse dejaba al personaje andando.
     */
    private final android.hardware.input.InputManager.InputDeviceListener deviceListener =
            new android.hardware.input.InputManager.InputDeviceListener() {
                @Override
                public void onInputDeviceAdded(int id) {
                    InputDevice d = InputDevice.getDevice(id);
                    if (d != null && !d.isVirtual() && isPadSource(d.getSources())) activateForController(d.getName());
                    updateMouseCapture();
                }

                @Override
                public void onInputDeviceChanged(int id) {
                }

                @Override
                public void onInputDeviceRemoved(int id) {
                    boolean known = devAxes.remove(id) != null
                            || (lastDevice != null && lastDevice.getId() == id);
                    if (!known) return;
                    dbg(L.t("mando desconectado: se sueltan los toques"));
                    if (lastDevice != null && lastDevice.getId() == id) lastDevice = null;
                    releaseAll();
                    axv = devAxes.isEmpty() ? NO_AXES : devAxes.values().iterator().next();
                    update();
                }
            };

    private static boolean isPadSource(int s) {
        return (s & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (s & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    static String keyToken(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_BUTTON_A: return "A";
            case KeyEvent.KEYCODE_BUTTON_B: return "B";
            case KeyEvent.KEYCODE_BUTTON_C: return "C";
            case KeyEvent.KEYCODE_BUTTON_X: return "X";
            case KeyEvent.KEYCODE_BUTTON_Y: return "Y";
            case KeyEvent.KEYCODE_BUTTON_Z: return "Z";
            case KeyEvent.KEYCODE_BUTTON_L1: return "L1";
            case KeyEvent.KEYCODE_BUTTON_R1: return "R1";
            case KeyEvent.KEYCODE_BUTTON_L2: return "L2";
            case KeyEvent.KEYCODE_BUTTON_R2: return "R2";
            case KeyEvent.KEYCODE_BUTTON_THUMBL: return "L3";
            case KeyEvent.KEYCODE_BUTTON_THUMBR: return "R3";
            case KeyEvent.KEYCODE_BUTTON_SELECT:
            case KeyEvent.KEYCODE_BACK: return "SELECT";
            case KeyEvent.KEYCODE_BUTTON_START: return "START";
            case KeyEvent.KEYCODE_BUTTON_MODE: return "HOME";
            case KeyEvent.KEYCODE_DPAD_UP: return "DPAD_UP";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "DPAD_DOWN";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "DPAD_LEFT";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "DPAD_RIGHT";
            default: return "KEY_" + code;
        }
    }

    // Ejes Android <-> codigo Linux (los perfiles usan AXIS_<hex Linux>, igual que gpmapper).
    private static final int[][] AXMAP = {
            {MotionEvent.AXIS_X, 0x00}, {MotionEvent.AXIS_Y, 0x01}, {MotionEvent.AXIS_Z, 0x02},
            {MotionEvent.AXIS_RX, 0x03}, {MotionEvent.AXIS_RY, 0x04}, {MotionEvent.AXIS_RZ, 0x05},
            {MotionEvent.AXIS_THROTTLE, 0x06}, {MotionEvent.AXIS_RUDDER, 0x07}, {MotionEvent.AXIS_WHEEL, 0x08},
            {MotionEvent.AXIS_GAS, 0x09}, {MotionEvent.AXIS_BRAKE, 0x0A},
            {MotionEvent.AXIS_HAT_X, 0x10}, {MotionEvent.AXIS_HAT_Y, 0x11},
    };

    // Nombres "AXIS_<hex>+/-" de cada eje, calculados una vez (antes: 22 String.format por evento).
    private static final String[] AX_POS = new String[AXMAP.length], AX_NEG = new String[AXMAP.length];

    static {
        for (int i = 0; i < AXMAP.length; i++) {
            AX_POS[i] = String.format(java.util.Locale.ROOT, "AXIS_%X+", AXMAP[i][1]);
            AX_NEG[i] = String.format(java.util.Locale.ROOT, "AXIS_%X-", AXMAP[i][1]);
        }
    }

    private static int linuxOf(int axis) {
        for (int[] m : AXMAP) if (m[0] == axis) return m[1];
        return -1;
    }

    private static int androidOf(int linux) {
        for (int[] m : AXMAP) if (m[1] == linux) return m[0];
        return -1;
    }

    /** Ejes del mando mas inclinado (en empate, el que acaba de mandar el evento). */
    private float[] dominant(float[] current) {
        float[] best = current;
        float bestMag = deflection(current);
        for (float[] d : devAxes.values()) {
            float m = deflection(d);
            if (m > bestMag + 0.05f) {
                best = d;
                bestMag = m;
            }
        }
        return best;
    }

    private static float deflection(float[] d) {
        float m = 0;
        for (int a : AXES_READ) m += Math.abs(d[a]);
        return m;
    }

    private float axis(int a) {
        float r = a >= 0 && a < axv.length ? axv[a] : 0;
        // Gatillos: unos mandos usan GAS/BRAKE y otros RTRIGGER/LTRIGGER.
        if (a == MotionEvent.AXIS_GAS) r = Math.max(r, axis(MotionEvent.AXIS_RTRIGGER));
        if (a == MotionEvent.AXIS_BRAKE) r = Math.max(r, axis(MotionEvent.AXIS_LTRIGGER));
        return r;
    }

    private boolean pressed(String token) {
        return keys.contains(token) || virt.contains(token) || axDown.contains(token);
    }

    @Override
    protected boolean onKeyEvent(KeyEvent ev) {
        boolean pad = isPadSource(ev.getSource());
        String kb = pad ? null : keyboardToken(ev);
        if (!pad && kb == null) return false;
        if (pad && ev.getDevice() != null) {
            lastDevice = ev.getDevice();
            lastPad = lastDevice.getName();
        }
        if (!active()) return false;
        if (ev.getAction() != KeyEvent.ACTION_DOWN && ev.getAction() != KeyEvent.ACTION_UP) return false;
        String t = pad ? keyToken(ev.getKeyCode()) : kb;
        // Teclado: solo se queda las teclas que usa el perfil (o al asignar en el editor).
        if (!pad && !learning && !isBound(t)) return false;
        boolean down = ev.getAction() == KeyEvent.ACTION_DOWN;
        if (ev.getRepeatCount() == 0 && dbgEnabled()) dbg(L.t("tecla ") + t + (down ? L.t(" abajo") : L.t(" arriba")));
        if (learning) {
            if (down && ev.getRepeatCount() == 0) learnReport(t);
            return true;
        }
        if (down) keys.add(t);
        else keys.remove(t);
        boolean used = handleCombos(t, down) || isBound(t) || "SELECT".equals(t) && boundCombo();
        update();
        return used;
    }

    @Override
    public void onMotionEvent(MotionEvent ev) {
        handleMotion(ev);
    }

    /** Ejes del mando: llegan por la ventana con foco (padWin) o por accesibilidad (respaldo). */
    private void handleMotion(MotionEvent ev) {
        if (!isPadSource(ev.getSource())) return;
        if (ev.getDevice() != null) {
            lastDevice = ev.getDevice();
            lastPad = lastDevice.getName();
        }
        // Cada mando guarda sus propios ejes; manda el mas inclinado (dos mandos no se mezclan).
        float[] arr = devAxes.get(ev.getDeviceId());
        if (arr == null) devAxes.put(ev.getDeviceId(), arr = new float[64]);
        for (int a : AXES_READ) {
            float v = ev.getAxisValue(a);
            arr[a] = v;
            if (learning) axes.put(a, v);
        }
        axv = devAxes.size() == 1 ? arr : dominant(arr);
        if (dbgEnabled()) {
            dbg(String.format(java.util.Locale.ROOT, "ejes x=%.2f y=%.2f z=%.2f rz=%.2f hat=%.0f,%.0f",
                    axis(MotionEvent.AXIS_X), axis(MotionEvent.AXIS_Y), axis(MotionEvent.AXIS_Z),
                    axis(MotionEvent.AXIS_RZ), axis(MotionEvent.AXIS_HAT_X), axis(MotionEvent.AXIS_HAT_Y)));
        }
        if (learning) {
            learnAxes();
            return;
        }
        update();
    }

    /** Botones que se usan como modificador de capa ("L2+A"): no tocan por si solos. */
    private Set<String> mods = new HashSet<>();
    /** Botones base con alguna accion (sin capa o en alguna capa). */
    private final List<String> bases = new ArrayList<>();

    private void indexProfile() {
        mods = cur == null ? new HashSet<>() : cur.modifiersInUse();
        bases.clear();
        if (cur == null) return;
        for (Profile.Binding b : cur.bindings.values()) {
            if (Profile.isStick(b.key)) continue;
            String base = Profile.baseOf(b.key);
            if (!bases.contains(base)) bases.add(base);
        }
    }

    private boolean isBound(String token) {
        return cur != null && (mods.contains(token) || bases.contains(token) || dpadToStick(token) != null);
    }

    /** Stick (LS/RS) que mueve la cruceta: binding stick con 'dpad' y sin circulo propio para esa flecha. */
    private Profile.Binding dpadToStick(String token) {
        if (cur == null || !token.startsWith("DPAD_") || cur.bindings.containsKey(token)) return null;
        for (String w : new String[]{"LS", "RS"}) {
            Profile.Binding b = cur.bindings.get(w);
            if (b != null && Profile.STICK.equals(b.type) && b.dpad) return b;
        }
        return null;
    }

    /** Vector de la cruceta (diagonales incluidas, longitud 1) o null si no se pulsa ninguna flecha. */
    private float[] dpadVec() {
        float x = 0, y = 0;
        if (dpadToStick("DPAD_LEFT") != null && pressed("DPAD_LEFT")) x -= 1;
        if (dpadToStick("DPAD_RIGHT") != null && pressed("DPAD_RIGHT")) x += 1;
        if (dpadToStick("DPAD_UP") != null && pressed("DPAD_UP")) y -= 1;
        if (dpadToStick("DPAD_DOWN") != null && pressed("DPAD_DOWN")) y += 1;
        if (x == 0 && y == 0) return null;
        float m = (float) Math.hypot(x, y);
        return new float[]{x / m, y / m};
    }

    private boolean boundCombo() {
        return cur != null;  // SELECT se usa para los atajos: no dejarlo pasar al juego
    }
    // SELECT + R1 / L1: perfil siguiente / anterior. SELECT + START (1 s): pausa.
    private long comboSince = 0;
    private boolean comboFired = false;

    private boolean handleCombos(String t, boolean down) {
        if (cur == null) return false;
        if (down && keys.contains("SELECT") && !mods.contains("SELECT") && ("R1".equals(t) || "L1".equals(t))) {
            consumed.add(t);
            switchProfile("R1".equals(t) ? 1 : -1);
            return true;
        }
        if (!down && consumed.remove(t)) return true;
        if (pressed("SELECT") && pressed("START")) {
            if (comboSince == 0) {
                comboSince = SystemClock.uptimeMillis();
                comboFired = false;
                handler.postDelayed(comboCheck, 1000);
            }
        } else {
            comboSince = 0;
            handler.removeCallbacks(comboCheck);
        }
        return false;
    }

    private final Runnable comboCheck = new Runnable() {
        @Override
        public void run() {
            if (comboSince == 0 || comboFired || !(pressed("SELECT") && pressed("START"))) return;
            comboFired = true;
            enabled = !enabled;
            pausedSeen = !enabled;
            PauseTile.setPaused(PadService.this, !enabled);   // el boton de Ajustes rapidos lo refleja
            releaseAll();
            updateSources();   // en pausa se quita la ventana del stick (p. ej. para escribir en el chat)
            toast(enabled ? L.t("Mapeo reanudado") : L.t("Mapeo en pausa (SELECT + START para reanudar)"));
        }
    };

    /** Pausa / reanuda desde el boton de Ajustes rapidos (archivo compartido con gpmapper). */
    private void checkPausedFlag() {
        boolean p = PauseTile.isPaused();
        if (p == pausedSeen) return;
        pausedSeen = p;
        if (enabled != p) return;
        enabled = !p;
        releaseAll();
        updateSources();
        dbg(enabled ? L.t("mapeo reanudado (ajustes rápidos)") : L.t("mapeo en pausa (ajustes rápidos)"));
    }

    private void switchProfile(int dir) {
        List<Profile> list = Library.profilesOf(cur.pkg);
        String msg;
        if (list.size() < 2) {
            msg = L.t("Este juego solo tiene un perfil (") + cur.displayName() + ")";
        } else {
            int pos = 0;
            for (int i = 0; i < list.size(); i++) if (list.get(i).file.equals(cur.file)) pos = i;
            int nx = (pos + dir + list.size()) % list.size();
            try {
                Library.setActive(cur.pkg, list.get(nx).file.getName());
            } catch (Exception ignored) {
            }
            loadProfile();
            msg = L.t("Perfil: ") + list.get(nx).displayName() + " (" + (nx + 1) + "/" + list.size() + ")";
        }
        toast(msg);
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    // Registro de depuracion: solo si existe <base>/debug -> pad.log
    private long dbgCheckAt = 0;
    private boolean dbgOn = false;

    /** ¿Registro activo? (existe <base>/debug; se comprueba cada 2 s) */
    private boolean dbgEnabled() {
        long n = SystemClock.uptimeMillis();
        if (n - dbgCheckAt > 2000) {
            dbgCheckAt = n;
            dbgOn = new File(Profile.baseDir(), "debug").exists();
        }
        return dbgOn;
    }

    private void dbg(String s) {
        if (!dbgEnabled()) return;
        try (FileOutputStream o = new FileOutputStream(new File(Profile.baseDir(), "pad.log"), true)) {
            o.write((SystemClock.uptimeMillis() + " " + s + "\n").getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------ logica (igual que gpmapper)
    private final Map<String, Inj.Ptr> rt = new HashMap<>();
    private final float[] lookCx = new float[2], lookCy = new float[2];
    /** Desde cuando esta cada stick de camara al tope (aceleracion), 0 = no lo esta. */
    private final long[] lookFull = new long[2];

    private void updateDerived() {
        float hx = axis(MotionEvent.AXIS_HAT_X), hy = axis(MotionEvent.AXIS_HAT_Y);
        setVirt("DPAD_LEFT", hx < -0.5f);
        setVirt("DPAD_RIGHT", hx > 0.5f);
        setVirt("DPAD_UP", hy < -0.5f);
        setVirt("DPAD_DOWN", hy > 0.5f);
        for (int i = 0; i < AXMAP.length; i++) {
            int[] m = AXMAP[i];
            if (m[0] == MotionEvent.AXIS_HAT_X || m[0] == MotionEvent.AXIS_HAT_Y) continue;
            float d = axis(m[0]);
            hyst(AX_POS[i], d);
            hyst(AX_NEG[i], -d);
        }
        setVirt("L2", axDown.contains("AXIS_A+"));
        setVirt("R2", axDown.contains("AXIS_9+"));
    }

    private void hyst(String token, float d) {
        boolean was = axDown.contains(token);
        if (was ? d > AX_RELEASE : d > AX_PRESS) axDown.add(token);
        else axDown.remove(token);
    }

    private void setVirt(String t, boolean on) {
        if (on) virt.add(t);
        else virt.remove(t);
    }

    // Accion en curso de cada boton base (se decide al pulsar: capa activa o normal).
    private static final class Act {
        Profile.Binding b;
        Inj.Ptr p;
        boolean down;      // turbo: dedo apoyado ahora
        long next;         // turbo: proximo cambio (uptime ms)
    }

    private static final class Swipe {
        Inj.Ptr p;
        long t0;
        float dur, x1, y1, x2, y2;
    }

    private final Map<String, Act> acts = new HashMap<>();
    private final Map<String, Inj.Ptr> toggled = new HashMap<>();   // interruptores apoyados (por clave)
    private final List<Swipe> swipes = new ArrayList<>();

    private void update() {
        updateDerived();
        if (cur == null || !enabled || daemonRunning) return;
        for (String base : bases) {
            boolean on = pressed(base) && !consumed.contains(base) && !mods.contains(base);
            Act a = acts.get(base);
            if (on && a == null) {
                Profile.Binding b = resolve(base);
                if (b == null) continue;
                a = new Act();
                a.b = b;
                acts.put(base, a);
                press(a);
            } else if (!on && a != null) {
                acts.remove(base);
                release(a);
            }
        }
        applyStick("LS");
        applyStick("RS");
        if (needsTicks()) startTicks();
    }

    /** Si hay un modificador pulsado con capa para este boton, esa accion; si no, la normal. */
    private Profile.Binding resolve(String base) {
        for (String m : mods) {
            if (!pressed(m)) continue;
            Profile.Binding b = cur.bindings.get(m + "+" + base);
            if (b != null) return b;
        }
        return cur.bindings.get(base);
    }

    private void press(Act a) {
        Profile.Binding b = a.b;
        rumble();
        switch (b.type) {
            case Profile.TAP:
                a.p = inj.down(sx(b.x), sy(b.y));
                break;
            case Profile.QUICK:   // toque corto al pulsar; no queda apoyado
                inj.tap(sx(b.x), sy(b.y));
                break;
            case Profile.BURST:   // N toques seguidos al pulsar (se completan aunque se suelte)
                runBurst(b);
                break;
            case Profile.TOGGLE: {   // una pulsacion apoya el dedo, la siguiente lo levanta
                Inj.Ptr held = toggled.remove(b.key);
                if (held != null) inj.up(held);
                else toggled.put(b.key, inj.down(sx(b.x), sy(b.y)));
                break;
            }
            case Profile.TURBO:
                a.p = inj.down(sx(b.x), sy(b.y));
                a.down = true;
                a.next = SystemClock.uptimeMillis() + halfPeriod(b);
                break;
            case Profile.SWIPE: {
                Swipe s = new Swipe();
                s.x1 = sx(b.x);
                s.y1 = sy(b.y);
                s.x2 = sx(b.x2);
                s.y2 = sy(b.y2);
                s.dur = Math.max(20, b.dur);
                s.t0 = SystemClock.uptimeMillis();
                s.p = inj.down(s.x1, s.y1);
                swipes.add(s);
                break;
            }
            case Profile.MACRO:
                runMacro(b);
                break;
            default:
                break;
        }
    }

    private void release(Act a) {
        String t = a.b.type;
        if ((Profile.TAP.equals(t) || Profile.TURBO.equals(t)) && a.p != null) inj.up(a.p);
        // interruptor, deslizar y macro siguen solos
    }

    private static long halfPeriod(Profile.Binding b) {
        return Math.max(15, Math.round(500f / Math.max(1, b.rate)));
    }

    private final List<Runnable> macroTasks = new ArrayList<>();

    /** Rafaga: 'count' toques rapidos en el mismo punto, uno cada 'gap' ms. */
    private void runBurst(Profile.Binding b) {
        final float x = sx(b.x), y = sy(b.y);
        long gap = Math.round(Math.max(Profile.BURST_GAP_MIN, b.gap));
        for (int i = 0; i < b.count; i++) {
            Runnable task = new Runnable() {
                @Override
                public void run() {
                    macroTasks.remove(this);
                    inj.tap(x, y);
                }
            };
            macroTasks.add(task);
            if (i == 0) handler.post(task);
            else handler.postDelayed(task, i * gap);
        }
    }

    /** La macro se ejecuta entera aunque se suelte el boton. */
    private void runMacro(Profile.Binding b) {
        float acc = 0;
        for (Profile.Step s : b.steps) {
            acc += s.delay;
            final float x = sx(s.x), y = sy(s.y);
            final Inj.Ptr[] holder = new Inj.Ptr[1];
            final Runnable upTask = new Runnable() {
                @Override
                public void run() {
                    macroTasks.remove(this);
                    if (holder[0] != null) inj.up(holder[0]);
                }
            };
            final long hold = Math.max(1, Math.round(s.hold));
            Runnable downTask = new Runnable() {
                @Override
                public void run() {
                    macroTasks.remove(this);
                    holder[0] = inj.down(x, y);
                    macroTasks.add(upTask);
                    handler.postDelayed(upTask, hold);
                }
            };
            macroTasks.add(downTask);
            handler.postDelayed(downTask, Math.round(acc));
        }
    }

    private int[] stickAxes(String which) {
        String o = "LS".equals(which) ? cur.lsAxes : cur.rsAxes;
        if (o != null && o.contains(",")) {
            try {
                String[] p = o.split(",");
                int ax = androidOf(Integer.parseInt(p[0].trim(), 16)), ay = androidOf(Integer.parseInt(p[1].trim(), 16));
                if (ax >= 0 && ay >= 0) return new int[]{ax, ay};
            } catch (NumberFormatException ignored) {
            }
        }
        if ("LS".equals(which)) return new int[]{MotionEvent.AXIS_X, MotionEvent.AXIS_Y};
        // Convencion de Android: RX/RY si existen; si no, Z/RZ.
        if (lastDevice != null && lastDevice.getMotionRange(MotionEvent.AXIS_RX) != null
                && lastDevice.getMotionRange(MotionEvent.AXIS_RY) != null)
            return new int[]{MotionEvent.AXIS_RX, MotionEvent.AXIS_RY};
        return new int[]{MotionEvent.AXIS_Z, MotionEvent.AXIS_RZ};
    }

    private float[] stickVec(String which) {
        int[] a = stickAxes(which);
        return new float[]{clamp(axis(a[0])), clamp(axis(a[1]))};
    }

    private static float clamp(float v) {
        return v < -1 ? -1 : v > 1 ? 1 : v;
    }

    /**
     * Vector del stick tras zona muerta y curva (null dentro de la zona muerta).
     * keepOffset: el joystick empieza en la zona muerta (no en 0) para no caer en la zona
     * muerta del propio juego; la camara empieza en 0 (sin saltos).
     */
    private float[] shaped(String which, boolean keepOffset) {
        float[] v = stickVec(which);
        float mag = (float) Math.hypot(v[0], v[1]);
        float dz = cur.deadzoneOf(which);
        if (mag <= dz || mag < 1e-3f) return null;
        float m = Math.min(1f, (mag - dz) / Math.max(0.01f, 1 - dz));
        m = (float) Math.pow(m, cur.curveOf(which));
        if (keepOffset) m = dz + (1 - dz) * m;
        return new float[]{v[0] / mag * m, v[1] / mag * m};
    }

    private void applyStick(String which) {
        Profile.Binding b = cur.bindings.get(which);
        if (b == null || !Profile.STICK.equals(b.type)) return;
        float[] s = shaped(which, true);
        if (s == null && b.dpad) s = dpadVec();   // la cruceta tambien mueve este joystick
        Inj.Ptr p = rt.get(which);
        if (s != null) {
            if (p == null) {
                rt.put(which, p = inj.down(sx(b.x), sy(b.y)));  // el juego ve primero el centro
                p.stick = true;
            }
            inj.move(p, sx(b.x) + s[0] * sr(b.r), sy(b.y) + s[1] * sr(b.r));
        } else if (p != null) {
            inj.up(p);
            rt.remove(which);
        }
    }

    private boolean needsTicks() {
        if (cur == null) return false;
        if (!swipes.isEmpty()) return true;
        for (Act a : acts.values()) if (Profile.TURBO.equals(a.b.type)) return true;
        Profile.Binding l = cur.bindings.get("LS"), r = cur.bindings.get("RS");
        return (l != null && Profile.LOOK.equals(l.type)) || (r != null && Profile.LOOK.equals(r.type));
    }

    private boolean ticking = false;
    private long lastTick;

    private void startTicks() {
        if (ticking) return;
        ticking = true;
        lastTick = SystemClock.uptimeMillis();
        handler.post(tick);
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (cur == null || !enabled || daemonRunning || learning || !needsTicks()) {
                ticking = false;
                return;
            }
            long n = SystemClock.uptimeMillis();
            float dt = Math.min(4f, (n - lastTick) / 16f);
            lastTick = n;
            boolean any = lookTick("LS", 0, dt) | lookTick("RS", 1, dt);
            // Turbo: apoyar / levantar a su ritmo mientras se mantiene el boton.
            for (Act a : acts.values()) {
                if (!Profile.TURBO.equals(a.b.type)) continue;
                any = true;
                if (n < a.next) continue;
                if (a.down) {
                    inj.up(a.p);
                    a.p = null;
                } else {
                    a.p = inj.down(sx(a.b.x), sy(a.b.y));
                }
                a.down = !a.down;
                a.next = n + halfPeriod(a.b);
            }
            // Deslizar: mover de inicio a fin en 'dur' ms y levantar.
            for (Iterator<Swipe> it = swipes.iterator(); it.hasNext(); ) {
                Swipe s = it.next();
                float k = Math.min(1f, (n - s.t0) / s.dur);
                inj.move(s.p, s.x1 + (s.x2 - s.x1) * k, s.y1 + (s.y2 - s.y1) * k);
                if (k >= 1f) {
                    inj.up(s.p);
                    it.remove();
                }
                any = true;
            }
            if (any) handler.postDelayed(this, swipes.isEmpty() ? 16 : 8);
            else ticking = false;   // se reanuda al mover el stick
        }
    };

    /** Camara: arrastre continuo mientras el stick esta inclinado. Devuelve si sigue activo. */
    private boolean lookTick(String which, int i, float dt) {
        Profile.Binding b = cur.bindings.get(which);
        if (b == null || !Profile.LOOK.equals(b.type)) return false;
        float[] s = shaped(which, false);
        Inj.Ptr p = rt.get(which);
        // Giroscopio y raton mueven la misma camara (la de RS, o la de LS si RS no es camara).
        float ex = 0, ey = 0;
        boolean ext = false;
        if (which.equals(extTarget())) {
            ex = extDx;
            ey = extDy;
            extDx = extDy = 0;
            ext = ex != 0 || ey != 0 || SystemClock.uptimeMillis() - extLast < 250;
        }
        if (s == null && !ext) {
            if (p != null) {
                inj.up(p);
                rt.remove(which);
            }
            return false;
        }
        if (p == null) {
            rt.put(which, inj.down(sx(b.x), sy(b.y)));
            lookCx[i] = b.x;
            lookCy[i] = b.y;
            return true;
        }
        float ys = cur.lookY * (cur.lookInvert ? -1 : 1);
        float aim = aimFactor();
        if (s != null) {
            float m = aim * accelFactor(i, s);
            lookCx[i] += s[0] * b.r * m * dt;
            lookCy[i] += s[1] * b.r * ys * m * dt;
        } else {
            lookFull[i] = 0;
        }
        lookCx[i] += ex * aim;
        lookCy[i] += ey * aim;
        float dx = lookCx[i] - b.x, dy = lookCy[i] - b.y, lim = Math.min(cur.sw, cur.sh) * 0.28f;
        boolean out = lookCx[i] < 0 || lookCy[i] < 0 || lookCx[i] >= cur.sw || lookCy[i] >= cur.sh;
        if (out || dx * dx + dy * dy > lim * lim) {   // demasiado lejos: levantar y volver al centro
            inj.up(p);
            rt.put(which, inj.down(sx(b.x), sy(b.y)));
            lookCx[i] = b.x;
            lookCy[i] = b.y;
            return true;
        }
        inj.move(p, sx(lookCx[i]), sy(lookCy[i]));
        return true;
    }

    // ------------------------------------------------------------------ apuntar y aceleracion

    /** Mientras se mantiene aim_button, la camara va a aim_scale. */
    private float aimFactor() {
        return !cur.aimButton.isEmpty() && pressed(cur.aimButton) ? cur.aimScale : 1f;
    }

    /** Con el stick al tope, la camara acelera hasta (1 + look_accel) en 0,6 s. */
    private float accelFactor(int i, float[] s) {
        if (cur.lookAccel <= 0 || s[0] * s[0] + s[1] * s[1] < 0.81f) {
            lookFull[i] = 0;
            return 1f;
        }
        long n = SystemClock.uptimeMillis();
        if (lookFull[i] == 0) lookFull[i] = n;
        return 1f + cur.lookAccel * Math.min(1f, (n - lookFull[i]) / 600f);
    }

    // ------------------------------------------------------------------ vibracion del mando

    private long lastRumble;

    /** Vibracion corta del mando al pulsar un boton mapeado (si el perfil la pide y el mando vibra). */
    private void rumble() {
        if (cur == null || cur.rumble <= 0 || lastDevice == null) return;
        long n = SystemClock.uptimeMillis();
        if (n - lastRumble < 60) return;   // varias pulsaciones a la vez: una sola vibracion
        lastRumble = n;
        try {
            android.os.Vibrator v = Build.VERSION.SDK_INT >= 31
                    ? lastDevice.getVibratorManager().getDefaultVibrator() : lastDevice.getVibrator();
            if (v == null || !v.hasVibrator()) return;
            int amp = Math.max(1, Math.min(255, Math.round(cur.rumble * 255)));
            v.vibrate(android.os.VibrationEffect.createOneShot(35, v.hasAmplitudeControl() ? amp : android.os.VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (Exception ignored) {
            // el mando no admite vibracion
        }
    }

    // ------------------------------------------------------------------ perfil segun el mando

    /** Al conectar un mando: en cada juego se activa el perfil cuyo 'controller' aparece en su nombre. */
    private void activateForController(String padName) {
        if (padName == null || padName.isEmpty() || daemonRunning) return;   // con root lo hace gpmapper
        Map<String, Profile> pick = new HashMap<>();
        File[] fs = Profile.profilesDir().listFiles((d, n) -> n.endsWith(".conf"));
        if (fs == null) return;
        java.util.Arrays.sort(fs);
        for (File f : fs) {
            try {
                Profile p = Profile.load(f);
                if (p.matchesController(padName) && !pick.containsKey(p.pkg)) pick.put(p.pkg, p);
            } catch (Exception ignored) {
            }
        }
        for (Profile p : pick.values()) {
            try {
                if (p.file.getName().equals(Library.activeFile(p.pkg))) continue;
                Library.setActive(p.pkg, p.file.getName());
                dbg(L.t("mando ") + padName + L.t(": perfil ") + p.displayName());
            } catch (Exception ignored) {
            }
        }
        if (!pick.isEmpty()) loadProfile();
    }

    // ------------------------------------------------------------------ giroscopio y raton (camara)

    /** Movimiento pendiente de la camara por giroscopio o raton (px del perfil). */
    private float extDx, extDy;
    private long extLast;

    /** Camara que mueven el giroscopio y el raton: RS si es camara, si no LS. */
    private String extTarget() {
        if (cur == null) return "";
        Profile.Binding r = cur.bindings.get("RS");
        if (r != null && Profile.LOOK.equals(r.type)) return "RS";
        Profile.Binding l = cur.bindings.get("LS");
        return l != null && Profile.LOOK.equals(l.type) ? "LS" : "";
    }

    private void addExternal(float dx, float dy) {
        if (Math.abs(dx) + Math.abs(dy) < 0.05f) return;
        extDx += dx;
        extDy += dy;
        extLast = SystemClock.uptimeMillis();
        startTicks();
    }

    private android.hardware.SensorManager sensors;
    private boolean gyroOn;
    private long gyroLastNs;

    private final android.hardware.SensorEventListener gyroListener = new android.hardware.SensorEventListener() {
        @Override
        public void onSensorChanged(android.hardware.SensorEvent e) {
            long prev = gyroLastNs;
            gyroLastNs = e.timestamp;
            if (prev == 0 || cur == null || !enabled || cur.gyro <= 0) return;
            if (!cur.gyroButton.isEmpty() && !pressed(cur.gyroButton)) return;
            float dt = Math.min(0.05f, (e.timestamp - prev) / 1e9f);
            float gx = e.values[0], gy = e.values[1];
            if (Math.abs(gx) < 0.02f) gx = 0;   // reposo: sin deriva
            if (Math.abs(gy) < 0.02f) gy = 0;
            float[] d = gyroToScreen(gx, gy);
            float k = Math.min(cur.sw, cur.sh) * 0.5f * cur.gyro * dt;
            addExternal(d[0] * k, d[1] * k * (cur.gyroInvert ? -1 : 1));
        }

        @Override
        public void onAccuracyChanged(android.hardware.Sensor s, int a) {
        }
    };

    /**
     * Giro del telefono (rad/s en los ejes del telefono) -> movimiento de camara en pantalla: girar
     * a la derecha mueve a la derecha; inclinar el borde de arriba hacia delante mira arriba.
     */
    private float[] gyroToScreen(float gx, float gy) {
        int rot;
        try {
            //noinspection deprecation
            rot = wm.getDefaultDisplay().getRotation();
        } catch (Exception e) {
            rot = android.view.Surface.ROTATION_90;
        }
        switch (rot) {
            case android.view.Surface.ROTATION_0: return new float[]{-gy, gx};
            case android.view.Surface.ROTATION_180: return new float[]{gy, -gx};
            case android.view.Surface.ROTATION_270: return new float[]{gx, gy};
            default: return new float[]{-gx, -gy};   // ROTATION_90 (horizontal, lo normal)
        }
    }

    /** El giroscopio solo esta encendido con un perfil que lo usa (ahorra bateria). */
    private void updateGyro() {
        boolean want = cur != null && enabled && !daemonRunning && !learning && cur.gyro > 0 && !extTarget().isEmpty();
        if (want == gyroOn) return;
        if (sensors == null) sensors = (android.hardware.SensorManager) getSystemService(SENSOR_SERVICE);
        if (sensors == null) return;
        if (want) {
            android.hardware.Sensor g = sensors.getDefaultSensor(android.hardware.Sensor.TYPE_GYROSCOPE);
            if (g == null) {
                dbg(L.t("este teléfono no tiene giroscopio"));
                return;
            }
            gyroLastNs = 0;
            gyroOn = sensors.registerListener(gyroListener, g, android.hardware.SensorManager.SENSOR_DELAY_GAME, handler);
        } else {
            sensors.unregisterListener(gyroListener);
            gyroOn = false;
        }
    }

    /** ¿El perfil usa el raton? (camara con 'mouse' o botones MOUSE_*). */
    private boolean wantsMouse() {
        if (cur == null) return false;
        if (cur.mouse > 0 && !extTarget().isEmpty()) return true;
        for (String k : cur.bindings.keySet()) if (Profile.baseOf(k).startsWith("MOUSE_")) return true;
        return false;
    }

    /** Captura el raton en la ventana del stick mientras el perfil lo use (el cursor desaparece). */
    private void updateMouseCapture() {
        if (Build.VERSION.SDK_INT < 26 || padWin == null) return;
        boolean want = padWinFocused && wantsMouse() && enabled && !learning && hasMouse();
        try {
            if (want && !padWin.hasPointerCapture()) padWin.requestPointerCapture();
            else if (!want && padWin.hasPointerCapture()) padWin.releasePointerCapture();
        } catch (Exception ignored) {
        }
    }

    private static boolean hasMouse() {
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (d != null && !d.isVirtual() && d.supportsSource(InputDevice.SOURCE_MOUSE)) return true;
        }
        return false;
    }

    private int mouseButtons;
    private static final int[] MOUSE_BITS = {MotionEvent.BUTTON_PRIMARY, MotionEvent.BUTTON_SECONDARY,
            MotionEvent.BUTTON_TERTIARY, MotionEvent.BUTTON_BACK, MotionEvent.BUTTON_FORWARD};
    private static final String[] MOUSE_NAMES = {"MOUSE_LEFT", "MOUSE_RIGHT", "MOUSE_MIDDLE", "MOUSE_BACK", "MOUSE_FORWARD"};

    /** Raton capturado: movimiento -> camara, botones -> MOUSE_*, rueda -> MOUSE_WHEEL_UP/DOWN. */
    private void handleMouse(MotionEvent ev) {
        if (cur == null || !enabled) return;
        int state = ev.getButtonState();
        if (state != mouseButtons) {
            for (int i = 0; i < MOUSE_BITS.length; i++) {
                boolean was = (mouseButtons & MOUSE_BITS[i]) != 0, now = (state & MOUSE_BITS[i]) != 0;
                if (was != now) virtualKey(MOUSE_NAMES[i], now);
            }
            mouseButtons = state;
        }
        float wheel = ev.getAxisValue(MotionEvent.AXIS_VSCROLL);
        if (wheel != 0) {
            final String w = wheel > 0 ? "MOUSE_WHEEL_UP" : "MOUSE_WHEEL_DOWN";
            virtualKey(w, true);
            handler.postDelayed(() -> virtualKey(w, false), 60);
        }
        if (ev.getActionMasked() == MotionEvent.ACTION_MOVE && cur.mouse > 0) {
            float dx = 0, dy = 0;
            for (int h = 0; h < ev.getHistorySize(); h++) {
                dx += ev.getHistoricalX(h);
                dy += ev.getHistoricalY(h);
            }
            dx += ev.getX();
            dy += ev.getY();
            addExternal(dx * cur.mouse, dy * cur.mouse * (cur.lookInvert ? -1 : 1));
        }
    }

    /** Pulsar / soltar una tecla que no viene del mando (raton). */
    private void virtualKey(String token, boolean down) {
        if (learning) {
            if (down) learnReport(token);
            return;
        }
        if (down) keys.add(token);
        else keys.remove(token);
        update();
    }

    /**
     * Tecla de un teclado fisico externo ("KB_W", "KB_SPACE") o null si no es de un teclado
     * (las teclas del propio telefono, como volumen o encendido, nunca se usan).
     */
    private static String keyboardToken(KeyEvent ev) {
        InputDevice d = ev.getDevice();
        if (d == null || d.isVirtual() || (ev.getSource() & InputDevice.SOURCE_KEYBOARD) != InputDevice.SOURCE_KEYBOARD
                || d.getKeyboardType() != InputDevice.KEYBOARD_TYPE_ALPHABETIC) return null;
        if (Build.VERSION.SDK_INT >= 29 && !d.isExternal()) return null;
        switch (ev.getKeyCode()) {
            case KeyEvent.KEYCODE_VOLUME_UP: case KeyEvent.KEYCODE_VOLUME_DOWN: case KeyEvent.KEYCODE_VOLUME_MUTE:
            case KeyEvent.KEYCODE_POWER: case KeyEvent.KEYCODE_HOME: case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_APP_SWITCH: case KeyEvent.KEYCODE_SLEEP: case KeyEvent.KEYCODE_WAKEUP:
                return null;
            default:
        }
        String n = KeyEvent.keyCodeToString(ev.getKeyCode());
        if (n == null || !n.startsWith("KEYCODE_")) return null;
        n = n.substring(8);
        return n.matches("[A-Z0-9_]{1,13}") ? "KB_" + n : null;
    }

    private void releaseAll() {
        for (Runnable r : macroTasks) handler.removeCallbacks(r);
        macroTasks.clear();
        acts.clear();
        toggled.clear();
        swipes.clear();
        rt.clear();
        inj.upAll();
        keys.clear();
        virt.clear();
        axDown.clear();
        consumed.clear();
    }
    // Coordenadas del perfil -> pantalla actual (los gestos usan la orientacion visible).
    private int scrW = 0, scrH = 0;
    private long scrAt = 0;

    private void screen() {
        long n = SystemClock.uptimeMillis();
        if (scrW > 0 && n - scrAt < 500) return;
        scrAt = n;
        if (Build.VERSION.SDK_INT >= 30) {
            Rect r = wm.getMaximumWindowMetrics().getBounds();
            scrW = r.width();
            scrH = r.height();
        } else {
            Point pt = new Point();
            //noinspection deprecation
            wm.getDefaultDisplay().getRealSize(pt);
            scrW = pt.x;
            scrH = pt.y;
        }
    }

    /** Coordenadas del perfil -> pantalla real (anclando a los bordes, ver Profile.fitX). */
    private float sx(float x) {
        screen();
        return Profile.fitX(x, cur.sw, cur.sh, scrW, scrH);
    }

    private float sy(float y) {
        screen();
        return Profile.fitY(y, cur.sw, cur.sh, scrW, scrH);
    }

    /** Distancias del perfil (radio del stick) -> pantalla real. */
    private float sr(float r) {
        screen();
        return r * Profile.fitScale(cur.sw, cur.sh, scrW, scrH);
    }

    // ------------------------------------------------------------------ detectar (aprender)
    private boolean learning = false;
    private final Map<Integer, Float> learnPrev = new HashMap<>();

    private final Runnable learnPoll = new Runnable() {
        @Override
        public void run() {
            File flag = new File(Profile.baseDir(), "learn");
            boolean l = !daemonRunning && flag.exists() && System.currentTimeMillis() - flag.lastModified() < 30000;
            if (l != learning) {
                learning = l;
                releaseAll();
                learnPrev.clear();
                axes.clear();
                for (int a : AXES_READ) axes.put(a, axv[a]);   // punto de partida: valores actuales
                for (Map.Entry<Integer, Float> e : axes.entrySet()) learnPrev.put(e.getKey(), Math.abs(e.getValue()));
                updateSources();
            }
            handler.postDelayed(this, 200);
        }
    };

    private void learnAxes() {
        for (Map.Entry<Integer, Float> e : axes.entrySet()) {
            int a = e.getKey();
            float v = e.getValue(), m = Math.abs(v);
            Float prev = learnPrev.get(a);
            float pv = prev == null ? 0 : prev;
            if (m > 0.6f && pv < 0.3f) {
                String tok;
                if (a == MotionEvent.AXIS_HAT_X) tok = v < 0 ? "DPAD_LEFT" : "DPAD_RIGHT";
                else if (a == MotionEvent.AXIS_HAT_Y) tok = v < 0 ? "DPAD_UP" : "DPAD_DOWN";
                else if (a == MotionEvent.AXIS_LTRIGGER) tok = "L2";
                else if (a == MotionEvent.AXIS_RTRIGGER) tok = "R2";
                else {
                    int lx = linuxOf(a);
                    tok = lx < 0 ? null : String.format("AXIS_%X%c", lx, v > 0 ? '+' : '-');
                }
                if (tok != null) learnReport(tok);
            }
            if (m > 0.6f || m < 0.3f) learnPrev.put(a, m);
        }
    }

    private void learnReport(String token) {
        File dir = Profile.baseDir();
        File tmp = new File(dir, "learn_result.tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) {
            o.write((token + "\n").getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return;
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.renameTo(new File(dir, "learn_result"));
    }

    // ------------------------------------------------------------------ inyector de toques
    private final Inj inj = new Inj();

    /**
     * Inyector de toques sobre dispatchGesture.
     *
     * Cada dedo virtual es un trazo que se mantiene con continueStroke(willContinue = true), asi
     * se pueden mantener varios a la vez (stick + botones).
     *
     * Limitacion de Android 14+ (MotionEventInjector): CUALQUIER evento de movimiento que pase por
     * el filtro de accesibilidad -como los del stick, que este servicio lee- cancela los gestos
     * inyectados. Con el stick en movimiento eso pasa decenas de veces por segundo, asi que la
     * cancelacion se trata como parte normal del flujo:
     *  - los dedos que siguen pulsados se vuelven a apoyar enseguida;
     *  - un dedo de joystick se reapoya en su centro y llega a su posicion en 1 ms (si se
     *    reapoyara en el borde, los joysticks flotantes tomarian ese punto como nuevo centro);
     *  - los dedos que ya se estaban soltando no se repiten (la cancelacion ya los solto).
     * Todos los cambios de un mismo evento del mando salen juntos en un solo envio.
     */
    final class Inj {
        final class Ptr {
            float x, y;      // posicion deseada (coordenadas de pantalla)
            float ax, ay;    // punto de apoyo: centro del joystick o el propio boton
            float lx, ly;    // fin exacto del ultimo trazo enviado (para continuarlo)
            boolean down = true;
            boolean stick;   // dedo de joystick: al reapoyar va primero
            boolean quick;   // toque rapido: si Android lo cancela antes de acabar, se repite
            boolean shown;   // modo prueba: ya se dibujo apoyado
            int retries;
            GestureDescription.StrokeDescription last;   // null = hay que (re)apoyarlo
        }

        private static final long QUICK_MS = 25;   // duracion del toque rapido
        private static final int QUICK_RETRIES = 3;

        private static final long PRESS_MS = 1;   // apoyo + arrastre hasta la posicion actual

        private final List<Ptr> ptrs = new ArrayList<>();
        private boolean inFlight = false, dirty = false, flushPosted = false;
        private int cancels = 0;
        private long cancelsSince = 0;

        /** Apoya un dedo en (x, y). Para un joystick: apoyar en el centro y luego move(). */
        Ptr down(float x, float y) {
            Ptr p = new Ptr();
            p.x = p.ax = x;
            p.y = p.ay = y;
            ptrs.add(p);
            changed();
            return p;
        }

        /** Toque rapido: apoyar y soltar en el mismo envio. */
        void tap(float x, float y) {
            Ptr p = new Ptr();
            p.x = p.ax = x;
            p.y = p.ay = y;
            p.down = false;
            p.quick = true;
            ptrs.add(p);
            changed();
        }

        void move(Ptr p, float x, float y) {
            if (p == null || !p.down || (p.x == x && p.y == y)) return;
            p.x = x;
            p.y = y;
            changed();
        }

        void up(Ptr p) {
            if (p == null || !p.down) return;
            p.down = false;
            changed();
        }

        void upAll() {
            for (Ptr p : ptrs) p.down = false;
            changed();
        }

        /** Agrupa los cambios de este evento del mando en un solo envio. */
        private void changed() {
            dirty = true;
            if (!flushPosted) {
                flushPosted = true;
                handler.post(flushTask);
            }
        }

        private final Runnable flushTask = () -> {
            flushPosted = false;
            flush();
        };

        private final GestureResultCallback cb = new GestureResultCallback() {
            @Override
            public void onCompleted(GestureDescription g) {
                inFlight = false;
                flush();
            }

            @Override
            public void onCancelled(GestureDescription g) {
                // Normalmente lo provoca el propio stick (ver arriba) o un toque real en la
                // pantalla. Los dedos pulsados se reapoyan; los que se soltaban ya estan soltados.
                inFlight = false;
                for (Iterator<Ptr> it = ptrs.iterator(); it.hasNext(); ) {
                    Ptr p = it.next();
                    if (p.quick && p.last != null && p.retries < QUICK_RETRIES) {
                        p.retries++;     // el toque rapido no llego a completarse: repetirlo
                        p.last = null;
                    } else if (!p.down) {
                        it.remove();     // se estaba soltando: la cancelacion ya lo solto
                    } else {
                        p.last = null;   // sigue pulsado: reapoyar
                    }
                }
                countCancel();
                dirty = true;
                flush();
            }
        };

        private void countCancel() {
            long n = SystemClock.uptimeMillis();
            if (n - cancelsSince >= 1000) {
                if (cancels > 0) dbg(cancels + L.t(" reapoyos/s (cancelaciones de Android por el stick)"));
                cancels = 0;
                cancelsSince = n;
            }
            cancels++;
        }

        private void flush() {
            if (inFlight || !dirty) return;
            dirty = false;
            screen();
            if (dryRun) {
                dryFlush();
                return;
            }
            GestureDescription.Builder gb = new GestureDescription.Builder();
            List<Ptr> sent = new ArrayList<>();
            List<GestureDescription.StrokeDescription> strokes = new ArrayList<>();
            int max = GestureDescription.getMaxStrokeCount();
            // Si el gesto continua dedos ya apoyados, los dedos nuevos empiezan 1 ms despues:
            // Android solo acepta una continuacion si su primer instante tiene solo continuaciones.
            boolean continuing = false;
            for (Ptr p : ptrs) continuing |= p.last != null;
            long newStart = continuing ? 1 : 0;
            // Al (re)apoyar a la vez un joystick y botones, el joystick va primero y los botones
            // 1 ms despues: el juego nunca toma el dedo de un boton por el del joystick.
            boolean newStick = false;
            for (Ptr p : ptrs) newStick |= p.last == null && p.down && p.stick;
            for (Iterator<Ptr> it = ptrs.iterator(); it.hasNext(); ) {
                Ptr p = it.next();
                if (sent.size() >= max) break;
                float x = cx(p.x), y = cy(p.y);
                Path path = new Path();
                GestureDescription.StrokeDescription s;
                try {
                    if (p.last != null) {
                        // Continuar desde el punto EXACTO donde acabo el trazo anterior.
                        path.moveTo(p.lx, p.ly);
                        if (x != p.lx || y != p.ly) path.lineTo(x, y);
                        s = p.last.continueStroke(path, 0, SEG_MS, p.down);
                    } else if (p.down) {
                        // Apoyar (o reapoyar tras una cancelacion) en el punto de apoyo y llegar
                        // a la posicion actual en 1 ms.
                        float ax = cx(p.ax), ay = cy(p.ay);
                        path.moveTo(ax, ay);
                        boolean drag = x != ax || y != ay;
                        if (drag) path.lineTo(x, y);
                        long start = newStart + (newStick && !p.stick ? 1 : 0);
                        s = new GestureDescription.StrokeDescription(path, start, drag ? PRESS_MS : SEG_MS, true);
                    } else {
                        // Toque rapido, o pulsado y soltado antes de enviarse: un toque corto.
                        path.moveTo(x, y);
                        long start = newStart + (newStick ? 1 : 0);
                        s = new GestureDescription.StrokeDescription(path, start, p.quick ? QUICK_MS : TAP_MIN_MS, false);
                    }
                } catch (RuntimeException e) {
                    it.remove();
                    continue;
                }
                // Fin exacto tal como lo calcula Android (PathMeasure): el siguiente trazo debe
                // empezar justo ahi o Android rechaza la continuacion.
                float[] end = pathEnd(path, x, y);
                p.lx = end[0];
                p.ly = end[1];
                strokes.add(s);
                sent.add(p);
            }
            if (strokes.isEmpty()) {
                ptrs.removeIf(p -> !p.down);
                return;
            }
            for (GestureDescription.StrokeDescription s : strokes) gb.addStroke(s);
            boolean ok;
            try {
                ok = dispatchGesture(gb.build(), cb, handler);
            } catch (RuntimeException e) {
                ok = false;
            }
            if (dbgOn) {
                StringBuilder sb = new StringBuilder("gesto");
                for (Ptr p : sent) {
                    sb.append(String.format(java.util.Locale.ROOT, " [%.0f,%.0f %s%s]", p.lx, p.ly,
                            p.last == null ? "nuevo" : "sigue", p.down ? "" : L.t(" fin")));
                }
                dbg(sb + (ok ? "" : L.t(" RECHAZADO")));
            }
            if (!ok) {
                for (Ptr p : ptrs) p.last = null;
                ptrs.removeIf(p -> !p.down);
                return;
            }
            inFlight = true;
            for (int i = 0; i < sent.size(); i++) {
                Ptr p = sent.get(i);
                p.last = strokes.get(i);
                if (!p.down) ptrs.remove(p);
            }
        }

        /** Modo prueba: en vez de tocar, se dibuja donde tocaria cada dedo. */
        private void dryFlush() {
            List<float[]> held = new ArrayList<>(), taps = new ArrayList<>();
            for (Ptr p : ptrs) {
                if (p.down) {
                    held.add(new float[]{cx(p.x), cy(p.y), cx(p.ax), cy(p.ay), p.stick ? 1 : 0});
                    p.shown = true;
                } else if (!p.shown) {
                    taps.add(new float[]{cx(p.x), cy(p.y)});
                }
                p.last = null;
            }
            ptrs.removeIf(p -> !p.down);
            GhostView g = ghost;
            if (g != null) g.show(held, taps);
        }

        private final float[] endTmp = new float[2];

        private float[] pathEnd(Path path, float fx, float fy) {
            android.graphics.PathMeasure pm = new android.graphics.PathMeasure(path, false);
            float len = pm.getLength();
            if (len > 0 && pm.getPosTan(len, endTmp, null)) return new float[]{endTmp[0], endTmp[1]};
            return new float[]{fx, fy};
        }

        private float cx(float x) {
            return Math.max(0, Math.min(scrW - 1, x));
        }

        private float cy(float y) {
            return Math.max(0, Math.min(scrH - 1, y));
        }
    }
}
