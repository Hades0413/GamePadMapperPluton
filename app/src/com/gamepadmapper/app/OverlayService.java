package com.gamepadmapper.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/**
 * Editor flotante: una burbuja sobre el juego; al tocarla se muestran los botones del
 * perfil como circulos que se arrastran encima de los controles del juego.
 * <p>
 * UX:
 * - El panel de un boton se coloca en la mitad opuesta al boton seleccionado, se puede
 *   arrastrar por su asa y minimizar. La barra superior tambien se puede arrastrar.
 * - Mientras se arrastra un circulo, barra y panel se vuelven casi transparentes.
 * - Flechas para ajuste fino, cruz en el punto exacto del toque y coordenadas en vivo.
 * - L.t("Detectar") usa el modo aprender de gpmapper (<base>/learn).
 */
public class OverlayService extends Service {
    public static final String EXTRA_PROFILE = "profile";
    private static final String ACTION_STOP = "com.gamepadmapper.app.STOP";
    private static final String CHANNEL = "editor";
    private static final long LEARN_TIMEOUT_MS = 10000;

    // Paleta
    private static final int C_CARD = 0xE6181A20, C_PRIMARY = 0xFF3F51B5, C_OK = 0xFF2E7D32,
            C_WARN = 0xFFE65100, C_DANGER = 0xFFC62828, C_NEUTRAL = 0xFF455A64, C_TEXT2 = 0xFFB0BEC5;

    private interface TokenCallback {
        void onToken(String token);
    }

    private interface IntSetter {
        void set(int v);
    }

    private WindowManager wm;
    // Ventanas con "Mostrar sobre otras apps" (APPLICATION_OVERLAY) o, sin ese permiso, desde el
    // servicio de accesibilidad (ACCESSIBILITY_OVERLAY). Ver syncWindowMode().
    private boolean a11yWin = false;
    private Object wmOwner = null;

    private int winType() {
        return a11yWin ? WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
                : WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
    }

    /**
     * Elige con que se dibujan la burbuja y "Mostrar controles". Con el permiso de superposicion,
     * como siempre; sin el, con el servicio de accesibilidad. Si cambia, se quitan las ventanas del
     * modo anterior (se recrean en el siguiente tick). Devuelve false si no se puede dibujar.
     */
    private boolean syncWindowMode() {
        boolean saw = android.provider.Settings.canDrawOverlays(this);
        PadService ps = PadService.instance;
        if (!saw && ps == null) {
            dropFloating();
            return false;
        }
        boolean want = !saw;
        Object owner = want ? ps : null;
        if (want != a11yWin || owner != wmOwner) {
            dropFloating();
            a11yWin = want;
            wmOwner = owner;
            wm = (WindowManager) (want ? ps : this).getSystemService(WINDOW_SERVICE);
        }
        return true;
    }

    /** Quita la burbuja, su menu y "Mostrar controles" (se recrean al volver a mostrarse). */
    private void dropFloating() {
        closeGuide();
        closeMenu();
        removeHints();
        if (bubble != null) {
            try {
                wm.removeView(bubble);
            } catch (Exception ignored) {
            }
            bubble = null;
        }
    }
    private View bubble;
    private WindowManager.LayoutParams bubbleParams;
    private FrameLayout menu;        // menu de la burbuja
    private View inputWin;           // ventana para escribir (enfocable)
    private FrameLayout editor;
    private Profile profile;
    private final List<Marker> markers = new ArrayList<>();
    private Marker selected;
    private boolean dirty = false;

    private LinearLayout toolbar;
    private TextView toolbarInfo;
    private Button saveButton;
    private View addPanel;
    private LinearLayout editPanel, banner;
    private int offX, offY;          // posicion de la ventana del editor en pantalla

    // Posicion del panel de edicion: automatica salvo que el usuario lo mueva.
    private boolean panelPinned = false, panelCollapsed = false;
    private int panelGravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
    private float panelTx, panelTy;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable learnPoll;

    // Tamano de los circulos (se recuerda) y deshacer movimientos.
    private static final float[] SCALES = {1f, 0.75f, 0.55f};
    private static final String[] SCALE_NAMES = {L.t("Grande"), L.t("Mediano"), L.t("Pequeño")};
    private int scaleIdx = 1;
    private Button sizeButton, undoButton;

    private static final class Move {
        final Marker m;
        final float x, y;

        Move(Marker m, float x, float y) {
            this.m = m;
            this.x = x;
            this.y = y;
        }
    }

    private final ArrayDeque<Move> undo = new ArrayDeque<>();

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        L.init(this);   // idioma de la interfaz
        Profile.init(this);
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        scaleIdx = Math.max(0, Math.min(SCALES.length - 1,
                getSharedPreferences("gamepad_mapper", MODE_PRIVATE).getInt("marker_scale", 1)));
        // gpmapper sin root no sabe como esta girada la pantalla: se lo dice la app.
        android.hardware.display.DisplayManager dm =
                (android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE);
        dm.registerDisplayListener(displayListener, handler);
        writeRotation();
    }

    private final android.hardware.display.DisplayManager.DisplayListener displayListener =
            new android.hardware.display.DisplayManager.DisplayListener() {
                @Override
                public void onDisplayAdded(int displayId) {
                }

                @Override
                public void onDisplayRemoved(int displayId) {
                }

                @Override
                public void onDisplayChanged(int displayId) {
                    if (displayId == android.view.Display.DEFAULT_DISPLAY) writeRotation();
                }
            };

    private void writeRotation() {
        try {
            Mapper.writeRotation(wm.getDefaultDisplay().getRotation());
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------ tamano y deshacer
    private void cycleSize() {
        scaleIdx = (scaleIdx + 1) % SCALES.length;
        getSharedPreferences("gamepad_mapper", MODE_PRIVATE).edit().putInt("marker_scale", scaleIdx).apply();
        for (Marker m : markers) m.layoutToBinding();
        if (sizeButton != null) sizeButton.setText("○ " + SCALE_NAMES[scaleIdx]);
    }

    private void pushUndo(Marker m) {
        undo.push(new Move(m, m.px(), m.py()));
        while (undo.size() > 50) undo.removeLast();
        if (undoButton != null) undoButton.setEnabled(true);
    }

    private void doUndo() {
        while (!undo.isEmpty()) {
            Move mv = undo.pop();
            if (!markers.contains(mv.m)) continue;  // circulo ya eliminado
            mv.m.setPos(mv.x, mv.y);
            mv.m.layoutToBinding();
            markDirty();
            if (selected == mv.m) updatePanelTitle();
            break;
        }
        if (undoButton != null) undoButton.setEnabled(!undo.isEmpty());
    }

    // ------------------------------------------------------------------ servicio
    // Siempre activo: cada segundo mira que app esta en primer plano y muestra la
    // burbuja solo en juegos. Desde la burbuja se gestionan los perfiles del juego.
    private String currentGame;          // juego en primer plano con burbuja
    private String pendingEditPkg;       // abrir el editor al llegar a este juego
    private final java.util.Map<String, Boolean> gameCache = new java.util.HashMap<>();
    private long gameCacheAt;

    private final Runnable monitor = new Runnable() {
        @Override
        public void run() {
            // Bateria: con la pantalla apagada no hay juego que vigilar; se mira cada 5 s.
            android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isInteractive() && editor == null) {
                handler.postDelayed(this, 5000);
                return;
            }
            try {
                tick();
            } catch (Exception ignored) {
            }
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            Games.setBubbleEnabled(this, false);
            if (!Mapper.needsRotation()) {
                stopSelf();
                return START_NOT_STICKY;
            }
            // El mapeador sin root sigue necesitando la rotacion: solo se oculta la burbuja.
            closeMenu();
            if (bubble != null) bubble.setVisibility(View.GONE);
        }
        startInForeground();
        String path = intent != null ? intent.getStringExtra(EXTRA_PROFILE) : null;
        if (path != null) {
            try {
                if (editor != null) closeEditor();
                profile = Profile.load(new File(path));
                dirty = false;
                pendingEditPkg = profile.pkg;  // se abre al llegar al juego
            } catch (Exception e) {
                toast(L.t("No se pudo abrir el perfil: ") + e.getMessage());
            }
        }
        handler.removeCallbacks(monitor);
        handler.post(monitor);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(monitor);
        try {
            ((android.hardware.display.DisplayManager) getSystemService(DISPLAY_SERVICE))
                    .unregisterDisplayListener(displayListener);
        } catch (Exception ignored) {
        }
        stopLearn();
        closeGuide();
        closeMenu();
        closeInput();
        removeHints();
        try {
            if (editor != null) wm.removeView(editor);
        } catch (Exception ignored) {
        }
        try {
            if (bubble != null) wm.removeView(bubble);
        } catch (Exception ignored) {
        }
        editor = null;
        bubble = null;
        super.onDestroy();
    }

    private boolean isGameCached(String pkg) {
        long now = SystemClock.uptimeMillis();
        if (now - gameCacheAt > 30000) {
            gameCache.clear();
            gameCacheAt = now;
        }
        Boolean g = gameCache.get(pkg);
        if (g == null) gameCache.put(pkg, g = Games.isGame(this, pkg));
        return g;
    }

    private void tick() {
        writeRotation();  // por si se perdio algun aviso del listener (solo escribe si cambia)
        if (editor != null || inputWin != null || guideWin != null) return;
        if (!syncWindowMode()) return;
        // App delante: por "Acceso de uso" si esta concedido (como siempre) o por la accesibilidad.
        String fg = Games.hasUsageAccess(this) ? Games.foreground(this) : PadService.topApp();
        if (fg == null) return;
        if (pendingEditPkg != null && pendingEditPkg.equals(fg)) {
            pendingEditPkg = null;
            currentGame = fg;
            closeMenu();
            openEditor();
            return;
        }
        boolean show = fg != null && !fg.isEmpty() && Games.bubbleEnabled(this) && isGameCached(fg)
                && !Games.isHidden(this, fg);
        if (show) {
            if (!fg.equals(currentGame)) closeMenu();
            currentGame = fg;
            showBubbleView();
        } else {
            currentGame = null;
            closeMenu();
            if (bubble != null) bubble.setVisibility(View.GONE);
        }
        updateHints(show ? fg : null);   // L.t("Mostrar controles"): solo en el juego con burbuja
    }

    // ------------------------------------------------------------------ notificacion
    private void startInForeground() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, L.t("Burbuja en juegos"), NotificationManager.IMPORTANCE_MIN));
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, OverlayService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        PendingIntent open = PendingIntent.getActivity(this, 2,
                new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_gamepad)
                .setContentTitle(L.t("Gamepad Mapper Plutón activo"))
                .setContentText(Games.bubbleEnabled(this) ? L.t("La burbuja aparece al abrir un juego")
                        : L.t("Mapeador en marcha (burbuja desactivada)"))
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(null, L.t("Detener burbuja"), stop).build())
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
    }

    // ------------------------------------------------------------------ utilidades UI
    private int dp(float v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private Toast lastToast;   // para quitarlo antes de una captura de pantalla

    private void toast(String s) {
        if (lastToast != null) lastToast.cancel();
        lastToast = Toast.makeText(this, s, Toast.LENGTH_SHORT);
        lastToast.show();
    }

    private GradientDrawable roundBg(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private Button button(String text, int color, View.OnClickListener l) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(Color.WHITE);
        b.setTextSize(13);
        b.setBackground(roundBg(color, 16));
        b.setPadding(dp(10), 0, dp(10), 0);
        b.setMinWidth(0);
        b.setMinimumWidth(dp(36));
        b.setMinHeight(0);
        b.setMinimumHeight(dp(34));
        b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(34));
        lp.setMargins(dp(3), dp(3), dp(3), dp(3));
        b.setLayoutParams(lp);
        return b;
    }

    private Button button(String text, View.OnClickListener l) {
        return button(text, C_PRIMARY, l);
    }

    private TextView text(String s, float size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(size);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    /** Asa para arrastrar un panel. */
    private TextView handle() {
        TextView h = text("⠇⠇", 16, C_TEXT2, true);  // puntos verticales
        h.setGravity(Gravity.CENTER);
        h.setPadding(dp(6), 0, dp(8), 0);
        h.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)));
        return h;
    }

    private LinearLayout row() {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        return r;
    }

    /** Hace que 'target' se pueda arrastrar tocando 'grip'. */
    private void makeDraggable(final View target, View grip, final Runnable onMoved) {
        final int slop = ViewConfiguration.get(this).getScaledTouchSlop();
        grip.setOnTouchListener(new View.OnTouchListener() {
            float dx, dy, sx, sy;
            boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        dx = e.getRawX();
                        dy = e.getRawY();
                        sx = target.getTranslationX();
                        sy = target.getTranslationY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float mx = e.getRawX() - dx, my = e.getRawY() - dy;
                        if (Math.abs(mx) > slop || Math.abs(my) > slop) moved = true;
                        if (moved) {
                            target.setTranslationX(sx + mx);
                            target.setTranslationY(sy + my);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (moved && onMoved != null) onMoved.run();
                        return true;
                }
                return false;
            }
        });
    }

    /** Barra deslizante con etiqueta. */
    private void addSlider(LinearLayout parent, String fmt, int min, int max, int value, IntSetter setter) {
        final TextView lbl = text(String.format(Locale.ROOT, fmt, value), 12, C_TEXT2, false);
        SeekBar sb = new SeekBar(this);
        sb.setMax(max - min);
        sb.setProgress(Math.max(0, Math.min(max - min, value - min)));
        sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar s, int p, boolean user) {
                if (!user) return;
                setter.set(p + min);
                lbl.setText(String.format(Locale.ROOT, fmt, p + min));
                markDirty();
            }

            public void onStartTrackingTouch(SeekBar s) { }

            public void onStopTrackingTouch(SeekBar s) { }
        });
        parent.addView(lbl);
        parent.addView(sb, new LinearLayout.LayoutParams(dp(300), dp(32)));
    }

    /** Tamano de la pantalla tal como se ve ahora (con la rotacion actual). */
    private int[] screenSize() {
        if (Build.VERSION.SDK_INT >= 30) {
            Rect r = wm.getCurrentWindowMetrics().getBounds();
            return new int[]{r.width(), r.height()};
        }
        DisplayMetrics m = new DisplayMetrics();
        //noinspection deprecation
        wm.getDefaultDisplay().getRealMetrics(m);
        return new int[]{m.widthPixels, m.heightPixels};
    }

    // ------------------------------------------------------------------ colocacion inteligente
    private static final int[] SPOTS = {
            Gravity.TOP | Gravity.CENTER_HORIZONTAL, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL, Gravity.CENTER,
            Gravity.TOP | Gravity.START, Gravity.TOP | Gravity.END, Gravity.BOTTOM | Gravity.START,
            Gravity.BOTTOM | Gravity.END, Gravity.CENTER_VERTICAL | Gravity.START, Gravity.CENTER_VERTICAL | Gravity.END,
    };

    private int[] measure(View v) {
        int spec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED);
        v.measure(spec, spec);
        return new int[]{v.getMeasuredWidth(), v.getMeasuredHeight()};
    }

    /** Rectangulo (coordenadas del editor) que ocuparia una vista de w x h con esa gravedad. */
    private Rect spotRect(int gravity, int w, int h) {
        int W = editor.getWidth(), H = editor.getHeight(), m = dp(8);
        int hg = gravity & Gravity.HORIZONTAL_GRAVITY_MASK, vg = gravity & Gravity.VERTICAL_GRAVITY_MASK;
        int x = hg == Gravity.START ? m : hg == Gravity.END ? W - w - m : (W - w) / 2;
        int y = vg == Gravity.TOP ? m : vg == Gravity.BOTTOM ? H - h - m : (H - h) / 2;
        return new Rect(x, y, x + w, y + h);
    }

    private Rect markerRect(Marker mk) {
        float r = mk.radius() + dp(4);
        float x = mk.px() - offX, y = mk.py() - offY;
        return new Rect(Math.round(x - r), Math.round(y - r), Math.round(x + r), Math.round(y + r));
    }

    private static long overlap(Rect a, Rect b) {
        int w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        int h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return w > 0 && h > 0 ? (long) w * h : 0;
    }

    private Rect viewRect(View v) {
        if (v == null || v.getWidth() == 0 || v.getVisibility() != View.VISIBLE) return null;
        int x = Math.round(v.getX()), y = Math.round(v.getY());
        return new Rect(x, y, x + v.getWidth(), y + v.getHeight());
    }

    /** Posicion que menos tapa los circulos (y nunca el seleccionado si se puede). */
    private int bestSpot(int w, int h, Marker keepVisible, View avoid) {
        Rect avoidRect = viewRect(avoid);
        int best = SPOTS[0];
        long bestScore = Long.MAX_VALUE;
        for (int g : SPOTS) {
            Rect r = spotRect(g, w, h);
            long score = 0;
            for (Marker mk : markers) score += overlap(r, markerRect(mk)) * (mk == keepVisible ? 50 : 1);
            if (avoidRect != null) score += overlap(r, avoidRect) * 20;
            if (score < bestScore) {
                bestScore = score;
                best = g;
            }
        }
        return best;
    }

    private FrameLayout.LayoutParams spotParams(int gravity) {
        FrameLayout.LayoutParams flp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, gravity);
        flp.setMargins(dp(8), dp(8), dp(8), dp(8));
        return flp;
    }

    private void markDirty() {
        dirty = true;
        onlyDefaults = false;
        if (saveButton != null) saveButton.setText(L.t("Guardar ●"));
        if (panelSave != null) panelSave.setText(L.t("Guardar ●"));
    }

    // ------------------------------------------------------------------ detectar botones del juego
    // Captura la pantalla mientras se juega, busca los controles (ButtonFinder) y los asigna:
    // uno a uno pulsando el mando, o automaticamente (joystick -> LS, principal -> A, ...).
    private WindowManager.LayoutParams editorLp;
    private boolean onlyDefaults = false;   // el perfil solo tiene la distribucion inicial
    private boolean detecting = false;
    private final List<Ghost> ghosts = new ArrayList<>();
    private static final int CAPTURE_FRAMES = 6;
    private static final long CAPTURE_INTERVAL_MS = 450;

    private void autoDetectIntro() {
        if (editor == null || detecting) return;
        select(null);
        if (!PadService.canCapture()) {
            showBanner(L.t("Hace falta la accesibilidad"),
                    Build.VERSION.SDK_INT < 30 ? L.t("La detección automática necesita Android 11 o superior.")
                            : L.t("Activa Gamepad Mapper Plutón en Ajustes › Accesibilidad para poder ver la pantalla del juego."),
                    C_NEUTRAL, button(L.t("Entendido"), C_NEUTRAL, v -> hideBanner()));
            return;
        }
        showBanner(L.t("Detectar botones del juego"),
                L.t("Entra en una partida con los controles a la vista. Al tocar Empezar, juega 3 segundos ")
                        + L.t("moviéndote (sin abrir menús). Buscaré lo que no cambia en pantalla."),
                C_PRIMARY,
                button(L.t("Empezar"), C_OK, v -> autoDetectCapture()),
                button(L.t("Cancelar"), C_NEUTRAL, v -> hideBanner()));
    }

    /** Oculta el editor (sin bloquear los toques al juego) mientras se hacen las capturas. */
    private void setEditorHidden(boolean hidden) {
        if (editor == null || editorLp == null) return;
        editor.setVisibility(hidden ? View.INVISIBLE : View.VISIBLE);
        if (hidden) editorLp.flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        else editorLp.flags &= ~WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE;
        try {
            wm.updateViewLayout(editor, editorLp);
        } catch (Exception ignored) {
        }
    }

    private void autoDetectCapture() {
        final PadService ps = PadService.instance;
        if (ps == null || editor == null) return;
        hideBanner();
        clearGhosts();
        if (lastToast != null) lastToast.cancel();
        detecting = true;
        setEditorHidden(true);
        // Un momento para que el usuario vuelva a jugar y desaparezcan los avisos.
        handler.postDelayed(() -> ps.captureFrames(CAPTURE_FRAMES, CAPTURE_INTERVAL_MS, ButtonFinder.WORK_WIDTH,
                (frames, error) -> {
                    setEditorHidden(false);
                    if (editor == null) {
                        detecting = false;
                        return;
                    }
                    if (frames == null || frames.size() < 2) {
                        detecting = false;
                        showBanner(L.t("No se pudo capturar la pantalla"), error, C_DANGER,
                                button(L.t("Cerrar"), C_NEUTRAL, v -> hideBanner()));
                        return;
                    }
                    showBanner(L.t("Analizando la pantalla..."), null, C_PRIMARY);
                    final int[] s = screenSize();
                    new Thread(() -> {
                        List<ButtonFinder.Cand> found;
                        try {
                            found = ButtonFinder.find(frames, s[0], s[1]);
                        } catch (Throwable t) {
                            found = new ArrayList<>();
                        }
                        for (android.graphics.Bitmap b : frames) b.recycle();
                        final List<ButtonFinder.Cand> res = found;
                        handler.post(() -> {
                            detecting = false;
                            showDetections(res);
                        });
                    }).start();
                }), 900);
    }

    private void showDetections(List<ButtonFinder.Cand> found) {
        if (editor == null) return;
        clearGhosts();
        int game = 0, menu = 0;
        for (ButtonFinder.Cand c : found) {
            if (c.role == ButtonFinder.MENU) menu++;
            else game++;
        }
        if (game == 0) {
            showBanner(L.t("No encontré botones"),
                    L.t("Prueba en plena partida, con los controles visibles y moviéndote mientras capturo.")
                            + (menu > 0 ? L.t(" (Solo vi ") + menu + L.t(" de menú arriba.)") : ""),
                    C_NEUTRAL,
                    button(L.t("Reintentar"), C_OK, v -> autoDetectIntro()),
                    button(L.t("Cerrar"), C_NEUTRAL, v -> hideBanner()));
            return;
        }
        int n = 1;
        for (ButtonFinder.Cand c : found) {
            Ghost g = new Ghost(this, c, c.role == ButtonFinder.MENU ? 0 : n++);
            ghosts.add(g);
            editor.addView(g);
            g.place();
        }
        if (toolbar != null) toolbar.bringToFront();
        showDetectionBanner();
    }

    private void showDetectionBanner() {
        int inc = 0, menu = 0;
        for (Ghost g : ghosts) {
            if (g.c.include) inc++;
            if (g.c.role == ButtonFinder.MENU) menu++;
        }
        showBanner(L.t("Encontré ") + inc + L.t(" botón") + (inc == 1 ? "" : "es") + L.t(" del juego"),
                L.t("Toca un círculo para usarlo o descartarlo.")
                        + (menu > 0 ? L.t(" Los grises de arriba parecen menú/pausa y no se usan.") : ""),
                C_PRIMARY,
                button(L.t("Asignar con el mando"), C_WARN, v -> startGuided()),
                button(L.t("Automático"), C_OK, v -> applyAuto()),
                button(L.t("Cancelar"), C_NEUTRAL, v -> {
                    clearGhosts();
                    hideBanner();
                }));
    }

    private void clearGhosts() {
        for (Ghost g : ghosts) if (editor != null) editor.removeView(g);
        ghosts.clear();
    }

    private List<ButtonFinder.Cand> includedCands() {
        List<ButtonFinder.Cand> l = new ArrayList<>();
        for (Ghost g : ghosts) if (g.c.include) l.add(g.c);
        return l;
    }

    /** Un perfil nuevo trae una distribucion de ejemplo: se sustituye por lo detectado. */
    private void dropDefaultsIfUntouched() {
        if (!onlyDefaults) return;
        for (Profile.Binding b : new ArrayList<>(profile.bindings.values())) removeMarkers(b);
        profile.bindings.clear();
        onlyDefaults = false;
    }

    /** Coloca (o mueve) el boton 'key' del mando en el sitio detectado. */
    private void assignCand(ButtonFinder.Cand c, String key) {
        String ax = axisOf(key);
        Profile.Binding b;
        if (ax != null && (ax.equals("0") || ax.equals("1"))) key = "LS";             // stick izquierdo
        else if (ax != null && (ax.equals("2") || ax.equals("5") || ax.equals("3") || ax.equals("4"))) key = "RS";
        b = profile.bindings.get(key);
        if (b != null) {
            removeMarkers(b);
            b.x = c.x;
            b.y = c.y;
            if (Profile.MACRO.equals(b.type) && !b.steps.isEmpty()) {
                b.steps.get(0).x = c.x;
                b.steps.get(0).y = c.y;
            }
        } else {
            b = profile.add(key, c.x, c.y);
        }
        if ("LS".equals(key) || ("RS".equals(key) && c.role == ButtonFinder.JOYSTICK)) {
            b.type = Profile.STICK;
            b.r = Math.max(dp(30), c.r * 0.8f);   // radio de arrastre ~ el aro del joystick
            if ("LS".equals(key) && !profile.bindings.containsKey("DPAD_UP")) b.dpad = true;
        }
        c.key = key;
        addMarker(b);
        markDirty();
    }

    // Asignacion guiada: uno a uno, el usuario pulsa en el mando el boton que quiere.
    private int guidedIdx;
    private List<ButtonFinder.Cand> guided;

    private void startGuided() {
        guided = includedCands();
        if (guided.isEmpty()) {
            toast(L.t("No hay ningún círculo marcado"));
            return;
        }
        dropDefaultsIfUntouched();
        guidedIdx = 0;
        guidedStep();
    }

    private void guidedStep() {
        if (editor == null) return;
        if (guidedIdx >= guided.size()) {
            finishDetection();
            return;
        }
        final ButtonFinder.Cand c = guided.get(guidedIdx);
        for (Ghost g : ghosts) g.setHighlighted(g.c == c);
        String what = c.role == ButtonFinder.JOYSTICK
                ? L.t("Mueve el stick del mando que quieras para este joystick")
                : L.t("Pulsa en el mando el botón para este ") + c.roleName();
        startLearn((guidedIdx + 1) + "/" + guided.size() + " · " + what,
                token -> {
                    assignCand(c, token);
                    guidedIdx++;
                    guidedStep();
                },
                30000, this::guidedStep,   // si no se pulsa nada, se vuelve a preguntar
                button(L.t("Saltar"), C_NEUTRAL, v -> {
                    stopLearn();
                    guidedIdx++;
                    guidedStep();
                }),
                button(L.t("Terminar"), C_OK, v -> {
                    stopLearn();
                    finishDetection();
                }));
    }

    /** Asignacion automatica: joystick -> LS, principal -> A, resto B, X, Y, R1... */
    private void applyAuto() {
        List<ButtonFinder.Cand> list = includedCands();
        if (list.isEmpty()) {
            toast(L.t("No hay ningún círculo marcado"));
            return;
        }
        dropDefaultsIfUntouched();
        int k = 0;
        boolean hasLs = profile.bindings.containsKey("LS");
        for (ButtonFinder.Cand c : list) {
            if (c.role == ButtonFinder.JOYSTICK && !hasLs) {
                assignCand(c, "LS");
                hasLs = true;
                continue;
            }
            while (k < ButtonFinder.AUTO_KEYS.length && profile.bindings.containsKey(ButtonFinder.AUTO_KEYS[k])) k++;
            String key = k < ButtonFinder.AUTO_KEYS.length ? ButtonFinder.AUTO_KEYS[k++]
                    : (!profile.bindings.containsKey("START") ? "START" : null);
            if (key == null) break;
            assignCand(c, key);
        }
        finishDetection();
    }

    private void finishDetection() {
        stopLearn();
        clearGhosts();
        guided = null;
        showHint(L.t("Listo. Revisa los círculos (puedes moverlos o cambiar el botón) y toca Guardar."));
    }

    /** Circulo discontinuo de un boton detectado. Tocar = usar / descartar. */
    private class Ghost extends View {
        final ButtonFinder.Cand c;
        final int num;
        private boolean highlighted;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint t = new Paint(Paint.ANTI_ALIAS_FLAG);

        Ghost(Context ctx, ButtonFinder.Cand c, int num) {
            super(ctx);
            this.c = c;
            this.num = num;
            p.setStyle(Paint.Style.STROKE);
            p.setPathEffect(new android.graphics.DashPathEffect(new float[]{dp(6), dp(4)}, 0));
            t.setColor(Color.WHITE);
            t.setTextAlign(Paint.Align.CENTER);
            t.setTypeface(Typeface.DEFAULT_BOLD);
            t.setShadowLayer(dp(2), 0, 0, Color.BLACK);
            setOnClickListener(v -> {
                if (guided != null) return;   // durante la asignacion no se cambia
                c.include = !c.include;
                invalidate();
                showDetectionBanner();
            });
        }

        void place() {
            int size = Math.round(c.r * 2 + dp(8));
            setLayoutParams(new FrameLayout.LayoutParams(size, size));
            setX(c.x - offX - size / 2f);
            setY(c.y - offY - size / 2f);
        }

        void setHighlighted(boolean h) {
            highlighted = h;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas cv) {
            float cx = getWidth() / 2f, cy = getHeight() / 2f, r = c.r;
            int color = c.key != null ? 0xFF4CAF50 : !c.include ? 0xFF9E9E9E
                    : highlighted ? 0xFFFFEB3B : c.role == ButtonFinder.JOYSTICK ? 0xFF4CAF50 : 0xFFFF9800;
            p.setColor(color);
            p.setStrokeWidth(dp(highlighted ? 4 : 2.5f));
            cv.drawCircle(cx, cy, r, p);
            String lbl = c.key != null ? Profile.label(c.key)
                    : !c.include ? (c.role == ButtonFinder.MENU ? L.t("menú") : "✕")
                    : c.role == ButtonFinder.JOYSTICK ? "joystick" : String.valueOf(num);
            t.setTextSize(dp(lbl.length() > 3 ? 11 : 15));
            cv.drawText(lbl, cx, cy - (t.descent() + t.ascent()) / 2, t);
        }
    }

    // ------------------------------------------------------------------ burbuja
    private static final float BUBBLE_IDLE_ALPHA = 0.55f;

    private void showBubbleView() {
        if (bubble == null) createBubble();
        if (bubble.getVisibility() != View.VISIBLE) bubble.setVisibility(View.VISIBLE);
    }

    private void createBubble() {
        final int size = dp(46);
        FrameLayout b = new FrameLayout(this);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(Ui.PRIMARY_DARK);
        g.setStroke(dp(2), 0xCCFFFFFF);
        b.setBackground(g);
        b.setElevation(dp(6));
        ImageView ic = new ImageView(this);
        ic.setImageResource(R.drawable.ic_gamepad);
        ic.setColorFilter(Color.WHITE);
        b.addView(ic, new FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER));
        b.setAlpha(BUBBLE_IDLE_ALPHA);
        bubble = b;

        android.content.SharedPreferences sp = getSharedPreferences(Games.PREFS, MODE_PRIVATE);
        int[] scr = screenSize();
        bubbleParams = new WindowManager.LayoutParams(size, size, winType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = Math.min(sp.getInt("bubble_x", 0), Math.max(0, scr[0] - size));
        bubbleParams.y = Math.min(sp.getInt("bubble_y", scr[1] / 3), Math.max(0, scr[1] - size));
        final int slop = ViewConfiguration.get(this).getScaledTouchSlop();
        b.setOnTouchListener(new View.OnTouchListener() {
            float dx, dy;
            int sx, sy;
            boolean moved;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        dx = e.getRawX();
                        dy = e.getRawY();
                        sx = bubbleParams.x;
                        sy = bubbleParams.y;
                        moved = false;
                        v.setAlpha(1f);
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float mx = e.getRawX() - dx, my = e.getRawY() - dy;
                        if (Math.abs(mx) > slop || Math.abs(my) > slop) moved = true;
                        if (moved) {
                            closeMenu();
                            bubbleParams.x = sx + Math.round(mx);
                            bubbleParams.y = sy + Math.round(my);
                            wm.updateViewLayout(bubble, bubbleParams);
                        }
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (moved) {
                            // Pegarse al borde mas cercano y recordar la posicion.
                            int[] s = screenSize();
                            bubbleParams.x = bubbleParams.x + size / 2 < s[0] / 2 ? 0 : s[0] - size;
                            bubbleParams.y = Math.max(0, Math.min(s[1] - size, bubbleParams.y));
                            wm.updateViewLayout(bubble, bubbleParams);
                            getSharedPreferences(Games.PREFS, MODE_PRIVATE).edit()
                                    .putInt("bubble_x", bubbleParams.x).putInt("bubble_y", bubbleParams.y).apply();
                            v.setAlpha(BUBBLE_IDLE_ALPHA);
                        } else if (e.getActionMasked() == MotionEvent.ACTION_UP) {
                            if (menu != null) closeMenu();
                            else showMenu(MENU_MAIN);
                        }
                        return true;
                }
                return false;
            }
        });
        wm.addView(bubble, bubbleParams);
    }

    // ------------------------------------------------------------------ mostrar controles en el juego
    // Capa que no recibe toques: dibuja en cada punto del perfil activo el boton del mando que lo toca.
    private HintsView hints;
    private File hintsFile;
    private long hintsStamp;

    private boolean showControlsEnabled() {
        return getSharedPreferences(Games.PREFS, MODE_PRIVATE).getBoolean("show_controls", false);
    }

    private void setShowControls(boolean on) {
        getSharedPreferences(Games.PREFS, MODE_PRIVATE).edit().putBoolean("show_controls", on).apply();
    }

    /** Muestra/actualiza/quita la capa segun el juego en primer plano (null = ninguno). */
    private void updateHints(String pkg) {
        if (pkg == null || editor != null || !showControlsEnabled()) {
            removeHints();
            return;
        }
        File f = Library.targetFile(pkg);
        if (!f.exists()) {
            removeHints();
            return;
        }
        long stamp = f.lastModified() + new File(Profile.baseDir(), "active.txt").lastModified();
        if (hints != null && f.equals(hintsFile) && stamp == hintsStamp) return;   // sin cambios
        Profile p;
        try {
            p = Profile.load(f);
        } catch (Exception e) {
            removeHints();
            return;
        }
        hintsFile = f;
        hintsStamp = stamp;
        if (hints == null) {
            hints = new HintsView(this);
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                    winType(),
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = Gravity.TOP | Gravity.START;
            lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                    ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                    : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            if (Build.VERSION.SDK_INT >= 31) lp.alpha = 0.8f;   // Android 12+: ventanas no tactiles deben ser translucidas
            try {
                wm.addView(hints, lp);
            } catch (Exception e) {
                hints = null;
                return;
            }
        }
        hints.setProfile(p);
    }

    private void removeHints() {
        if (hints != null) {
            try {
                wm.removeView(hints);
            } catch (Exception ignored) {
            }
        }
        hints = null;
        hintsFile = null;
    }

    private class HintsView extends View {
        private Profile p;
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint dash = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int[] loc = new int[2];

        HintsView(Context c) {
            super(c);
            ring.setStyle(Paint.Style.STROKE);
            ring.setStrokeWidth(dp(1.8f));
            dash.setStyle(Paint.Style.STROKE);
            dash.setStrokeWidth(dp(2));
            dash.setPathEffect(new android.graphics.DashPathEffect(new float[]{dp(7), dp(5)}, 0));
            txt.setColor(Color.WHITE);
            txt.setTextAlign(Paint.Align.CENTER);
            txt.setTypeface(Typeface.DEFAULT_BOLD);
            txt.setShadowLayer(dp(2), 0, 0, 0xCC000000);
        }

        void setProfile(Profile p) {
            this.p = p;
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            if (p == null) return;
            getLocationOnScreen(loc);
            int[] s = screenSize();
            // Las coordenadas del perfil son de la pantalla tal como se ve con tamano sw x sh.
            float kx = s[0] / p.sw, ky = s[1] / p.sh, kr = Math.min(kx, ky);
            for (Profile.Binding b : p.bindings.values()) {
                String lbl = Profile.label(b.key);
                if (Profile.STICK.equals(b.type)) {
                    float x = b.x * kx - loc[0], y = b.y * ky - loc[1], r = b.r * kr;
                    dash.setColor(0xCC4CAF50);
                    c.drawCircle(x, y, r, dash);
                    if (b.dpad) drawDpadArrows(c, x, y, r, fill);
                    badge(c, x, y, dp(20), lbl, 0xFF4CAF50);
                } else if (Profile.LOOK.equals(b.type)) {
                    float x = b.x * kx - loc[0], y = b.y * ky - loc[1];
                    dash.setColor(0xCCFF9800);
                    c.drawCircle(x, y, dp(38), dash);
                    badge(c, x, y, dp(20), lbl, 0xFFFF9800);
                    txt.setTextSize(dp(10));
                    c.drawText(L.t("cámara"), x, y + dp(34), txt);
                } else if (Profile.MACRO.equals(b.type)) {
                    for (int i = 0; i < b.steps.size(); i++) {
                        Profile.Step st = b.steps.get(i);
                        badge(c, st.x * kx - loc[0], st.y * ky - loc[1], dp(i == 0 ? 18 : 14),
                                b.steps.size() > 1 ? lbl + (i + 1) : lbl, 0xFF8E24AA);
                    }
                } else if (Profile.SWIPE.equals(b.type)) {
                    float x1 = b.x * kx - loc[0], y1 = b.y * ky - loc[1], x2 = b.x2 * kx - loc[0], y2 = b.y2 * ky - loc[1];
                    int col = typeColor(b.type);
                    ring.setColor(col);
                    c.drawLine(x1, y1, x2, y2, ring);
                    double ang = Math.atan2(y2 - y1, x2 - x1), h = dp(12);   // punta de flecha
                    c.drawLine(x2, y2, (float) (x2 - h * Math.cos(ang - 0.5)), (float) (y2 - h * Math.sin(ang - 0.5)), ring);
                    c.drawLine(x2, y2, (float) (x2 - h * Math.cos(ang + 0.5)), (float) (y2 - h * Math.sin(ang + 0.5)), ring);
                    badge(c, x1, y1, dp(18), lbl, col);
                } else {
                    float x = b.x * kx - loc[0], y = b.y * ky - loc[1];
                    badge(c, x, y, dp(18), lbl, typeColor(b.type));
                    String tag = Profile.TURBO.equals(b.type) ? "turbo" : Profile.TOGGLE.equals(b.type) ? "interruptor"
                            : Profile.QUICK.equals(b.type) ? L.t("rápido")
                            : Profile.BURST.equals(b.type) ? "x" + b.count : "";
                    if (!tag.isEmpty()) {
                        txt.setTextSize(dp(9));
                        c.drawText(tag, x, y + dp(29), txt);
                    }
                }
            }
        }

        private void badge(Canvas c, float x, float y, float r, String lbl, int color) {
            fill.setColor(0x8C000000);
            c.drawCircle(x, y, r, fill);
            ring.setColor(color);
            c.drawCircle(x, y, r, ring);
            txt.setTextSize(lbl.length() > 3 ? dp(10) : lbl.length() > 2 ? dp(12) : dp(15));
            c.drawText(lbl, x, y - (txt.descent() + txt.ascent()) / 2, txt);
        }

        @Override
        protected void onSizeChanged(int w, int h, int ow, int oh) {
            invalidate();   // giro de pantalla
        }
    }

    // ------------------------------------------------------------------ menu de la burbuja
    private static final int MENU_MAIN = 0, MENU_SWITCH = 1, MENU_NEW = 2, MENU_DELETE = 3;

    private void closeMenu() {
        if (menu != null) wm.removeView(menu);
        menu = null;
        if (bubble != null) bubble.setAlpha(BUBBLE_IDLE_ALPHA);
    }

    private static Profile activeOf(String pkg, List<Profile> list) {
        String act = Library.activeFile(pkg);
        for (Profile p : list) if (p.file.getName().equals(act)) return p;
        return list.isEmpty() ? null : list.get(0);
    }

    /**
     * Si el panel es mas alto que la pantalla (p. ej. en horizontal con muchas opciones), deja fijas
     * sus primeras 'keep' filas (cabecera) y mete el resto en un ScrollView que cabe. Si ya cabe, no
     * cambia nada. width = ancho exacto, o 0 para medirlo libre.
     */
    private void fitToScreen(LinearLayout panel, int width, int keep) {
        int avail = screenSize()[1] - dp(32);
        int ws = width > 0 ? View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY)
                : View.MeasureSpec.makeMeasureSpec(screenSize()[0] - dp(24), View.MeasureSpec.AT_MOST);
        int hs = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED);
        panel.measure(ws, hs);
        if (panel.getMeasuredHeight() <= avail || panel.getChildCount() <= keep) return;
        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        while (panel.getChildCount() > keep) {
            View c = panel.getChildAt(keep);
            ViewGroup.LayoutParams lp = c.getLayoutParams();
            panel.removeViewAt(keep);
            if (lp != null) body.addView(c, lp);
            else body.addView(c);
        }
        panel.measure(ws, hs);
        int fixed = panel.getMeasuredHeight();
        ScrollView sv = new ScrollView(this);
        sv.setVerticalScrollBarEnabled(true);
        sv.setScrollbarFadingEnabled(false);
        sv.addView(body);
        panel.addView(sv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                Math.max(dp(80), avail - fixed)));
    }

    // ------------------------------------------------------------------ guia
    private View guideWin;

    /** Guia de uso a pantalla completa sobre el juego (sin salir de el). */
    private void showGuide() {
        closeGuide();
        int pad = dp(8);
        View content = Guide.content(this, pad, pad, this::closeGuide);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, winType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.OPAQUE);
        lp.gravity = Gravity.TOP | Gravity.START;
        try {
            wm.addView(content, lp);
            guideWin = content;
            if (bubble != null) bubble.setVisibility(View.GONE);
        } catch (Exception e) {
            toast(L.t("No se pudo abrir la guía"));
        }
    }

    private void closeGuide() {
        if (guideWin == null) return;
        try {
            wm.removeView(guideWin);
        } catch (Exception ignored) {
        }
        guideWin = null;
        if (bubble != null && currentGame != null) bubble.setVisibility(View.VISIBLE);
    }

    private void showMenu(int page) {
        final String pkg = currentGame;
        closeMenu();
        if (pkg == null) return;
        final List<Profile> list = Library.profilesOf(pkg);
        final Profile active = activeOf(pkg, list);

        menu = new FrameLayout(this);
        menu.setBackgroundColor(0x55000000);
        menu.setOnClickListener(v -> closeMenu());
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.roundStroke(this, Ui.SURFACE, 22, Ui.OUTLINE));
        card.setPadding(dp(8), dp(10), dp(8), dp(8));
        card.setElevation(dp(12));
        card.setClickable(true);

        // Cabecera: icono y nombre del juego + perfil activo.
        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        head.setPadding(dp(10), dp(2), dp(10), dp(10));
        if (page != MENU_MAIN) {
            LinearLayout back = Ui.button(this, R.drawable.ic_close, "", Ui.SURFACE_2, Ui.TEXT, v -> showMenu(MENU_MAIN));
            back.setPadding(dp(10), 0, dp(10), 0);
            head.addView(back, new LinearLayout.LayoutParams(dp(40), dp(40)));
        } else {
            ImageView gi = new ImageView(this);
            gi.setImageDrawable(Games.icon(this, pkg));
            Ui.clipRound(gi, dp(12));
            head.addView(gi, new LinearLayout.LayoutParams(dp(44), dp(44)));
        }
        LinearLayout ht = new LinearLayout(this);
        ht.setOrientation(LinearLayout.VERTICAL);
        ht.setPadding(dp(12), 0, 0, 0);
        String title = page == MENU_SWITCH ? L.t("Cambiar perfil") : page == MENU_NEW ? L.t("Nuevo perfil")
                : page == MENU_DELETE ? L.t("Borrar perfil") : Games.label(this, pkg);
        ht.addView(Ui.oneLine(Ui.text(this, title, 16, Ui.TEXT, true)));
        if (page == MENU_MAIN) {
            ht.addView(Ui.chip(this, active == null ? L.t("Sin perfil") : L.t("Perfil: ") + active.displayName(),
                    active == null ? Ui.WARN : Ui.OK), wrap());
        } else {
            ht.addView(Ui.oneLine(Ui.text(this, Games.label(this, pkg), 12, Ui.TEXT_2, false)));
        }
        head.addView(ht, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        card.addView(head);

        if (page == MENU_MAIN) {
            if (active == null) {
                card.addView(Ui.menuRow(this, R.drawable.ic_add, Ui.OK, L.t("Crear perfil"),
                        L.t("Coloca los botones del mando sobre el juego"), v -> createProfile(pkg, null)));
            } else {
                final boolean showing = showControlsEnabled();
                card.addView(Ui.menuRow(this, showing ? R.drawable.ic_hide : R.drawable.ic_gamepad, Ui.PRIMARY,
                        showing ? L.t("Ocultar controles") : L.t("Mostrar controles"),
                        L.t("Ver sobre el juego qué botón del mando toca cada punto"), v -> {
                            setShowControls(!showing);
                            closeMenu();
                            updateHints(pkg);
                            toast(showing ? L.t("Controles ocultos") : L.t("Controles visibles (no bloquean tus toques)"));
                        }));
                card.addView(Ui.menuRow(this, R.drawable.ic_edit, Ui.PRIMARY, L.t("Editar controles"),
                        active.displayName(), v -> editProfile(active)));
                if (list.size() > 1) {
                    card.addView(Ui.menuRow(this, R.drawable.ic_swap, Ui.PRIMARY, L.t("Cambiar perfil"),
                            list.size() + L.t(" perfiles para este juego"), v -> showMenu(MENU_SWITCH)));
                }
                card.addView(Ui.menuRow(this, R.drawable.ic_add, Ui.OK, L.t("Nuevo perfil"),
                        L.t("Para otro modo de juego"), v -> showMenu(MENU_NEW)));
                card.addView(Ui.menuRow(this, R.drawable.ic_list, Ui.TEXT_2, L.t("Renombrar"),
                        active.displayName(), v -> askText(L.t("Nombre del perfil"), active.displayName(), name -> {
                            active.name = name;
                            try {
                                active.save();
                                toast(L.t("Renombrado a \"") + name + "\"");
                            } catch (Exception e) {
                                toast(e.getMessage());
                            }
                        })));
                card.addView(Ui.menuRow(this, R.drawable.ic_delete, Ui.DANGER, L.t("Borrar perfil"),
                        active.displayName(), v -> showMenu(MENU_DELETE)));
            }
            card.addView(Ui.divider(this));
            card.addView(Ui.menuRow(this, R.drawable.ic_info, Ui.PRIMARY, L.t("Guía de uso y ejemplos"),
                    L.t("Cómo funciona cada tipo de botón y cómo configurarlo"), v -> {
                        closeMenu();
                        showGuide();
                    }));
            card.addView(Ui.menuRow(this, R.drawable.ic_hide, Ui.TEXT_3, L.t("Ocultar burbuja en este juego"),
                    L.t("Puedes volver a mostrarla desde la app"), v -> {
                        Games.setHidden(this, pkg, true);
                        closeMenu();
                        if (bubble != null) bubble.setVisibility(View.GONE);
                        toast(L.t("Burbuja oculta en ") + Games.label(this, pkg));
                    }));
        } else if (page == MENU_SWITCH) {
            for (final Profile p : list) {
                boolean on = p == active;
                card.addView(Ui.menuRow(this, on ? R.drawable.ic_check : R.drawable.ic_gamepad,
                        on ? Ui.OK : Ui.TEXT_2, p.displayName(), on ? L.t("En uso") : p.bindings.size() + L.t(" botones"), v -> {
                            try {
                                Library.setActive(pkg, p.file.getName());
                                toast(L.t("Perfil: ") + p.displayName());
                            } catch (Exception e) {
                                toast(e.getMessage());
                            }
                            closeMenu();
                        }));
            }
        } else if (page == MENU_NEW) {
            card.addView(Ui.menuRow(this, R.drawable.ic_add, Ui.OK, L.t("En blanco"),
                    L.t("Empieza con los botones básicos"), v -> createProfile(pkg, null)));
            if (active != null) {
                card.addView(Ui.menuRow(this, R.drawable.ic_copy, Ui.PRIMARY, L.t("Copiar \"") + active.displayName() + "\"",
                        L.t("Y ajustar solo lo que cambia"), v -> createProfile(pkg, active)));
            }
        } else if (page == MENU_DELETE && active != null) {
            TextView q = Ui.text(this, L.t("Se borrará \"") + active.displayName() + L.t("\". No se puede deshacer."), 14,
                    Ui.TEXT_2, false);
            q.setPadding(dp(12), 0, dp(12), dp(10));
            card.addView(q);
            LinearLayout btns = new LinearLayout(this);
            btns.setGravity(Gravity.END);
            btns.setPadding(dp(8), 0, dp(8), dp(4));
            btns.addView(Ui.button(this, 0, L.t("Cancelar"), Ui.SURFACE_2, Ui.TEXT, v -> showMenu(MENU_MAIN)));
            View gap = new View(this);
            btns.addView(gap, new LinearLayout.LayoutParams(dp(8), 1));
            btns.addView(Ui.button(this, R.drawable.ic_delete, L.t("Borrar"), Ui.DANGER, Color.WHITE, v -> {
                boolean ok = active.file.delete();
                List<Profile> rest = Library.profilesOf(pkg);
                try {
                    if (!rest.isEmpty()) Library.setActive(pkg, rest.get(0).file.getName());
                } catch (Exception ignored) {
                }
                gameCache.clear();
                toast(ok ? L.t("Perfil borrado") : L.t("No se pudo borrar"));
                showMenu(MENU_MAIN);
            }));
            card.addView(btns);
        }

        // Colocar la tarjeta junto a la burbuja, dentro de la pantalla.
        int[] scr = screenSize();
        int cardW = Math.min(dp(330), scr[0] - dp(24));
        fitToScreen(card, cardW, 1);   // en horizontal no caben todas las opciones: desplazable
        card.measure(View.MeasureSpec.makeMeasureSpec(cardW, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(scr[1] - dp(24), View.MeasureSpec.AT_MOST));
        int cardH = card.getMeasuredHeight();
        int bx = bubbleParams != null ? bubbleParams.x : 0, by = bubbleParams != null ? bubbleParams.y : 0;
        int x = bx + dp(46) / 2 < scr[0] / 2 ? bx + dp(46) + dp(10) : bx - cardW - dp(10);
        x = Math.max(dp(12), Math.min(scr[0] - cardW - dp(12), x));
        int y = Math.max(dp(12), Math.min(scr[1] - cardH - dp(12), by - dp(20)));
        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(cardW, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.leftMargin = x;
        clp.topMargin = y;
        menu.addView(card, clp);

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                winType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        wm.addView(menu, lp);
        if (bubble != null) bubble.setAlpha(1f);
    }

    private static LinearLayout.LayoutParams wrap() {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = 4;
        return lp;
    }

    private void editProfile(Profile p) {
        try {
            profile = Profile.load(p.file);
            dirty = false;
            closeMenu();
            openEditor();
        } catch (Exception e) {
            toast(L.t("No se pudo abrir: ") + e.getMessage());
        }
    }

    /** Crea un perfil (en blanco o copia de 'base'), lo activa y abre el editor. */
    private void createProfile(String pkg, Profile base) {
        try {
            List<Profile> list = Library.profilesOf(pkg);
            Profile p = base != null ? Profile.load(base.file) : new Profile();
            p.pkg = pkg;
            p.file = Library.newFile(pkg);
            p.name = list.isEmpty() ? L.t("Principal") : L.t("Perfil ") + (list.size() + 1);
            if (base == null) p.bindings.clear();
            p.save();
            Library.setActive(pkg, p.file.getName());
            gameCache.clear();
            toast(L.t("Creado \"") + p.name + L.t("\". Coloca los botones y pulsa Guardar."));
            profile = p;
            dirty = base == null;  // en blanco: hay que guardar la distribucion inicial
            closeMenu();
            openEditor();
        } catch (Exception e) {
            toast(L.t("No se pudo crear: ") + e.getMessage());
        }
    }

    // ------------------------------------------------------------------ escribir texto
    private interface TextCallback {
        void onText(String s);
    }

    private void closeInput() {
        if (inputWin != null) wm.removeView(inputWin);
        inputWin = null;
    }

    /** Ventana enfocable (para el teclado) con un campo de texto. */
    private void askText(String title, String initial, final TextCallback cb) {
        closeMenu();
        closeInput();
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackground(Ui.roundStroke(this, Ui.SURFACE, 22, Ui.OUTLINE));
        box.setPadding(dp(18), dp(16), dp(18), dp(12));
        box.addView(Ui.text(this, title, 17, Ui.TEXT, true));
        final android.widget.EditText et = new android.widget.EditText(this);
        et.setText(initial);
        et.setSelectAllOnFocus(true);
        et.setSingleLine(true);
        et.setTextColor(Ui.TEXT);
        et.setBackground(Ui.round(this, Ui.SURFACE_2, 12));
        et.setPadding(dp(12), dp(10), dp(12), dp(10));
        LinearLayout.LayoutParams elp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        elp.topMargin = dp(12);
        elp.bottomMargin = dp(12);
        box.addView(et, elp);
        LinearLayout btns = new LinearLayout(this);
        btns.setGravity(Gravity.END);
        btns.addView(Ui.button(this, 0, L.t("Cancelar"), Ui.SURFACE_2, Ui.TEXT, v -> closeInput()));
        View gap = new View(this);
        btns.addView(gap, new LinearLayout.LayoutParams(dp(8), 1));
        btns.addView(Ui.button(this, R.drawable.ic_check, L.t("Aceptar"), Ui.PRIMARY_DARK, Color.WHITE, v -> {
            String s = et.getText().toString().trim();
            closeInput();
            if (!s.isEmpty()) cb.onText(s);
        }));
        box.addView(btns);
        int[] scr = screenSize();
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(Math.min(dp(380), scr[0] - dp(32)),
                ViewGroup.LayoutParams.WRAP_CONTENT, winType(),
                WindowManager.LayoutParams.FLAG_DIM_BEHIND, PixelFormat.TRANSLUCENT);
        lp.dimAmount = 0.5f;
        lp.gravity = Gravity.CENTER;
        lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
                | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN;
        inputWin = box;
        wm.addView(box, lp);
        et.requestFocus();
        handler.postDelayed(() -> {
            android.view.inputmethod.InputMethodManager imm =
                    (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(et, 0);
        }, 200);
    }

    // ------------------------------------------------------------------ editor
    private void openEditor() {
        if (profile == null || editor != null) return;
        int[] size = screenSize();
        profile.rescaleTo(size[0], size[1]);
        final boolean fresh = profile.bindings.isEmpty();
        if (fresh) {
            profile.addDefaults();
            dirty = true;
        }
        onlyDefaults = fresh;
        panelPinned = false;
        panelCollapsed = false;

        closeMenu();
        removeHints();   // el editor ya muestra los circulos
        if (bubble != null) bubble.setVisibility(View.GONE);
        editor = new FrameLayout(this);
        editor.setBackgroundColor(0x40000000);
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
                winType(),
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30
                ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        editor.setOnClickListener(v -> select(null));  // tocar fuera deselecciona

        wm.addView(editor, lp);
        editorLp = lp;
        // Esperar al layout para conocer el desplazamiento real de la ventana en pantalla.
        editor.post(() -> {
            int[] loc = new int[2];
            editor.getLocationOnScreen(loc);
            offX = loc[0];
            offY = loc[1];
            for (Profile.Binding b : profile.bindings.values()) addMarker(b);
            buildToolbar();  // despues de los circulos: se coloca donde menos tape
            if (fresh) {
                // Perfil nuevo: ofrecer detectar los botones del juego en vez de colocarlos a mano.
                showBanner(L.t("Perfil nuevo"), L.t("¿Busco los botones del juego automáticamente?"), C_PRIMARY,
                        button(L.t("Detectar botones"), C_OK, v -> autoDetectIntro()),
                        button(L.t("Colocar yo"), C_NEUTRAL, v -> {
                            hideBanner();
                            showHint(L.t("Arrastra cada círculo sobre su botón. Toca uno para configurarlo."));
                        }));
            } else {
                showHint(L.t("Arrastra cada círculo sobre su botón. Toca uno para configurarlo."));
            }
        });
    }

    private void closeEditor() {
        stopLearn();
        clearGhosts();
        detecting = false;
        guided = null;
        if (editor != null) wm.removeView(editor);
        editor = null;
        markers.clear();
        selected = null;
        toolbar = null;
        toolbarInfo = null;
        saveButton = null;
        sizeButton = null;
        undoButton = null;
        undo.clear();
        addPanel = null;
        editPanel = null;
        banner = null;
        gameCache.clear();  // puede haber un perfil nuevo
        if (bubble != null && currentGame != null) bubble.setVisibility(View.VISIBLE);
    }

    private void requestClose() {
        if (!dirty) {
            closeEditor();
            return;
        }
        showBanner(L.t("Hay cambios sin guardar"), null, C_NEUTRAL,
                button(L.t("Guardar y salir"), C_OK, v -> {
                    if (save()) closeEditor();
                }),
                button(L.t("Salir sin guardar"), C_DANGER, v -> {
                    try {
                        profile = Profile.load(profile.file);  // descartar cambios
                    } catch (Exception ignored) {
                    }
                    dirty = false;
                    closeEditor();
                }),
                button(L.t("Cancelar"), C_NEUTRAL, v -> hideBanner()));
    }

    private void buildToolbar() {
        toolbar = row();
        toolbar.setBackground(roundBg(C_CARD, 22));
        toolbar.setPadding(dp(2), dp(2), dp(8), dp(2));
        TextView grip = handle();
        toolbar.addView(grip);
        toolbarInfo = text(profile.displayName(), 12, C_TEXT2, true);
        toolbarInfo.setPadding(0, 0, dp(6), 0);
        toolbarInfo.setMaxWidth(dp(120));
        toolbarInfo.setSingleLine(true);
        toolbarInfo.setEllipsize(android.text.TextUtils.TruncateAt.END);
        toolbar.addView(toolbarInfo);
        toolbar.addView(button(L.t("+ Botón"), v -> toggleAddPanel()));
        undoButton = button("↶", C_NEUTRAL, v -> doUndo());
        undoButton.setEnabled(!undo.isEmpty());
        toolbar.addView(undoButton);
        sizeButton = button("○ " + SCALE_NAMES[scaleIdx], C_NEUTRAL, v -> cycleSize());
        toolbar.addView(sizeButton);
        saveButton = button(dirty ? L.t("Guardar ●") : L.t("Guardar"), C_OK, v -> save());
        toolbar.addView(saveButton);
        toolbar.addView(button(L.t("Cerrar"), C_NEUTRAL, v -> requestClose()));
        int[] sz = measure(toolbar);
        editor.addView(toolbar, spotParams(bestSpot(sz[0], sz[1], null, null)));
        makeDraggable(toolbar, grip, null);
    }

    private boolean save() {
        try {
            profile.save();
            dirty = false;
            if (saveButton != null) saveButton.setText(L.t("Guardar"));
            if (panelSave != null) panelSave.setText(L.t("Guardar"));
            toast(L.t("Guardado: ") + profile.file.getName());
            return true;
        } catch (Exception e) {
            toast(L.t("Error al guardar: ") + e.getMessage());
            return false;
        }
    }

    /** Barra y paneles casi transparentes mientras se arrastra un circulo. */
    private void setChromeFaded(boolean faded) {
        float a = faded ? 0.12f : 1f;
        if (toolbar != null) toolbar.setAlpha(a);
        if (editPanel != null) editPanel.setAlpha(a);
        if (addPanel != null) addPanel.setAlpha(a);
        if (banner != null) banner.setAlpha(a);
    }

    /** Ayuda como aviso flotante: la barra nunca cambia de tamano (los botones no se mueven). */
    private void showHint(String s) {
        if (lastToast != null) lastToast.cancel();
        lastToast = Toast.makeText(this, s, Toast.LENGTH_LONG);
        lastToast.show();
    }

    // ------------------------------------------------------------------ anadir
    private void toggleAddPanel() {
        if (addPanel != null) {
            editor.removeView(addPanel);
            addPanel = null;
            return;
        }
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(roundBg(C_CARD, 18));
        card.setPadding(dp(6), dp(4), dp(6), dp(4));
        LinearLayout head = row();
        TextView grip = handle();
        head.addView(grip);
        head.addView(text(L.t("Añadir botón"), 14, Color.WHITE, true), new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        head.addView(button("✕", C_NEUTRAL, v -> toggleAddPanel()));
        card.addView(head);
        card.addView(button(L.t("🕹 Joystick + cruceta (un solo círculo)"), C_PRIMARY, v -> {
            toggleAddPanel();
            addJoystickCombo();
        }));
        card.addView(button(L.t("Buscar los botones del juego (automático)"), C_OK, v -> {
            toggleAddPanel();
            autoDetectIntro();
        }));
        card.addView(button(L.t("Detectar: pulsar un botón en el mando"), C_WARN, v -> {
            toggleAddPanel();
            startLearn(L.t("Pulsa en el mando el botón que quieres añadir"), token -> {
                Marker existing = findMarker(token);
                if (existing != null) {
                    toast(Profile.label(token) + L.t(" ya esta en el perfil"));
                    select(existing);
                    return;
                }
                addAtCenter(token);
            });
        }));
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        LinearLayout list = row();
        for (final String key : Profile.BUTTONS) {
            if (profile.bindings.containsKey(key)) continue;
            list.addView(button(Profile.label(key), v -> {
                toggleAddPanel();
                addAtCenter(key);
            }));
        }
        scroll.addView(list);
        card.addView(scroll);
        addPanel = card;
        card.setLayoutParams(new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        int[] sz = measure(card);
        int w = Math.min(sz[0], editor.getWidth() - dp(32));
        editor.addView(card, spotParams(bestSpot(w, sz[1], null, toolbar)));
        makeDraggable(card, grip, null);
    }

    private static final String[] DPAD_KEYS = {"DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"};

    /**
     * Joystick con cruceta: un solo circulo (LS) que mueven el stick izquierdo y la cruceta.
     * Sustituye a los circulos sueltos de la cruceta. Si ya habia LS, se queda en su sitio.
     */
    private void addJoystickCombo() {
        Profile.Binding old = profile.bindings.get("LS");
        int[] s = screenSize();
        float x = old != null ? old.x : s[0] * 0.17f, y = old != null ? old.y : s[1] * 0.68f;
        int removed = 0;
        for (String k : DPAD_KEYS) {
            Profile.Binding d = profile.bindings.get(k);
            if (d != null) {
                removeMarkers(d);
                removed++;
            }
        }
        if (old != null) removeMarkers(old);
        selected = null;
        Profile.Binding b = profile.addJoystickWithDpad(x, y);
        markDirty();
        select(addMarker(b));
        showHint(removed > 0
                ? L.t("Listo: la cruceta ahora mueve el joystick. Arrástralo sobre el joystick del juego.")
                : L.t("Arrastra el círculo sobre el joystick del juego. Lo mueven el stick izquierdo y la cruceta."));
    }

    private void addAtCenter(String key) {
        int[] s = screenSize();
        Profile.Binding b = profile.add(key, s[0] / 2f, s[1] / 2f);
        markDirty();
        select(addMarker(b));
    }

    // ------------------------------------------------------------------ banner
    /** Aviso compacto arriba al centro, con botones opcionales. Devuelve el subtitulo. */
    private TextView showBanner(String title, String subtitle, int color, Button... buttons) {
        hideBanner();
        if (editor == null) return null;
        banner = new LinearLayout(this);
        banner.setOrientation(LinearLayout.VERTICAL);
        banner.setGravity(Gravity.CENTER_HORIZONTAL);
        banner.setBackground(roundBg(color, 18));
        banner.setPadding(dp(16), dp(10), dp(16), dp(6));
        TextView t = text(title, 15, Color.WHITE, true);
        t.setGravity(Gravity.CENTER);
        banner.addView(t);
        TextView sub = null;
        if (subtitle != null) {
            sub = text(subtitle, 12, 0xFFFFE0B2, false);
            sub.setGravity(Gravity.CENTER);
            banner.addView(sub);
        }
        LinearLayout r = row();
        for (Button b : buttons) r.addView(b);
        banner.addView(r);
        FrameLayout.LayoutParams flp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        flp.topMargin = dp(58);
        editor.addView(banner, flp);
        return sub;
    }

    private void hideBanner() {
        if (banner != null && editor != null) editor.removeView(banner);
        banner = null;
    }

    // ------------------------------------------------------------------ detectar (aprender)
    private void startLearn(String message, TokenCallback cb) {
        startLearn(message, cb, LEARN_TIMEOUT_MS,
                () -> toast(L.t("No se detecto nada. ¿Está el mando conectado en modo gamepad (Home + X)?")),
                button(L.t("Cancelar"), C_NEUTRAL, v -> stopLearn()));
    }

    /** Escucha el mando: cb con el boton/eje pulsado, o onTimeout si pasa el tiempo. */
    private void startLearn(String message, TokenCallback cb, long timeoutMs, Runnable onTimeout, Button... buttons) {
        stopLearn();
        File flag = new File(Profile.baseDir(), "learn");
        final File result = new File(Profile.baseDir(), "learn_result");
        //noinspection ResultOfMethodCallIgnored
        result.delete();
        try {
            new FileOutputStream(flag).close();
        } catch (Exception e) {
            toast(L.t("No se pudo activar la detección: ") + e.getMessage());
            return;
        }
        final TextView countdown = showBanner(message, L.t("Escuchando el mando... ") + timeoutMs / 1000 + L.t(" s"), C_WARN,
                buttons);
        final long deadline = SystemClock.uptimeMillis() + timeoutMs;
        learnPoll = new Runnable() {
            @Override
            public void run() {
                if (result.exists()) {
                    String token = "";
                    try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(result),
                            StandardCharsets.UTF_8))) {
                        String line = r.readLine();
                        if (line != null) token = line.trim();
                    } catch (Exception ignored) {
                    }
                    //noinspection ResultOfMethodCallIgnored
                    result.delete();
                    stopLearn();
                    if (!token.isEmpty()) cb.onToken(token);
                    return;
                }
                long left = deadline - SystemClock.uptimeMillis();
                if (left <= 0) {
                    stopLearn();
                    if (onTimeout != null) onTimeout.run();
                    return;
                }
                if (countdown != null) countdown.setText(L.t("Escuchando el mando... ") + ((left + 999) / 1000) + L.t(" s"));
                handler.postDelayed(this, 100);
            }
        };
        handler.postDelayed(learnPoll, 100);
    }

    private void stopLearn() {
        if (learnPoll != null) handler.removeCallbacks(learnPoll);
        learnPoll = null;
        //noinspection ResultOfMethodCallIgnored
        new File(Profile.baseDir(), "learn").delete();
        hideBanner();
    }

    /** Deteccion de un stick en dos pasos: derecha (eje X) y abajo (eje Y). */
    private void learnStick(final Profile.Binding b) {
        startLearn(L.t("Mueve el stick ") + b.key + L.t(" a la DERECHA y sueltalo"), t1 -> {
            final String ax = axisOf(t1);
            if (ax == null) {
                toast(L.t("Eso fue un botón (") + Profile.label(t1) + L.t("); hay que mover el stick"));
                return;
            }
            startLearn(L.t("Ahora mueve el stick ") + b.key + L.t(" hacia ABAJO"), t2 -> {
                String ay = axisOf(t2);
                if (ay == null || ay.equals(ax)) {
                    toast(L.t("No se detecto el eje vertical; prueba otra vez"));
                    return;
                }
                if ("LS".equals(b.key)) profile.lsAxes = ax + "," + ay;
                else profile.rsAxes = ax + "," + ay;
                markDirty();
                toast(L.t("Stick ") + b.key + L.t(" detectado (ejes ") + ax + ", " + ay + ")");
                showEditPanel();
            });
        });
    }

    private static String axisOf(String token) {
        if (!token.startsWith("AXIS_") || token.length() < 7) return null;
        return token.substring(5, token.length() - 1);
    }

    // ------------------------------------------------------------------ circulos
    private Marker findMarker(String key) {
        for (Marker m : markers) if (m.step == 0 && m.b.key.equals(key)) return m;
        return null;
    }

    /** Cuatro flechas blancas en el aro de un joystick que tambien mueve la cruceta. */
    private void drawDpadArrows(Canvas c, float cx, float cy, float r, Paint p) {
        float a = Math.max(dp(5), Math.min(dp(9), r * 0.16f)), d = r - a * 1.4f;
        int old = p.getColor();
        p.setColor(0xEEFFFFFF);
        p.setStyle(Paint.Style.FILL);
        android.graphics.Path t = new android.graphics.Path();
        for (int i = 0; i < 4; i++) {
            float dx = i == 2 ? -1 : i == 3 ? 1 : 0, dy = i == 0 ? -1 : i == 1 ? 1 : 0;
            float tx = cx + dx * (d + a), ty = cy + dy * (d + a);     // punta
            float bx = cx + dx * (d - a * 0.2f), by = cy + dy * (d - a * 0.2f);  // base
            t.reset();
            t.moveTo(tx, ty);
            t.lineTo(bx + dy * a, by + dx * a);
            t.lineTo(bx - dy * a, by - dx * a);
            t.close();
            c.drawPath(t, p);
        }
        p.setColor(old);
    }

    /** Anade el circulo de un boton (y uno por paso extra si es una macro). Devuelve el principal. */
    /** Color de cada tipo de accion (editor y L.t("Mostrar controles")). */
    static int typeColor(String type) {
        switch (type) {
            case Profile.STICK: return 0xFF4CAF50;
            case Profile.LOOK: return 0xFFFF9800;
            case Profile.MACRO: return 0xFF8E24AA;
            case Profile.TURBO: return 0xFFE53935;
            case Profile.TOGGLE: return 0xFFFFA000;
            case Profile.QUICK: return 0xFF00ACC1;
            case Profile.BURST: return 0xFF7CB342;
            case Profile.SWIPE: return 0xFF26A69A;
            default: return 0xFF3F51B5;
        }
    }

    private Marker addMarker(Profile.Binding b) {
        Marker main = null;
        int n = Profile.MACRO.equals(b.type) ? Math.max(1, b.steps.size()) : Profile.SWIPE.equals(b.type) ? 2 : 1;
        for (int i = 0; i < n; i++) {
            Marker m = new Marker(this, b, i);
            markers.add(m);
            editor.addView(m, 0);  // debajo de la barra y los paneles
            m.layoutToBinding();
            if (i == 0) main = m;
        }
        return main;
    }

    private void removeMarkers(Profile.Binding b) {
        for (Iterator<Marker> it = markers.iterator(); it.hasNext(); ) {
            Marker m = it.next();
            if (m.b == b) {
                editor.removeView(m);
                it.remove();
            }
        }
    }

    /** Recrea los circulos de un boton (p. ej. al anadir/quitar pasos) y devuelve el del paso pedido. */
    private Marker rebuildMarkers(Profile.Binding b, int step) {
        removeMarkers(b);
        Marker main = addMarker(b), sel = main;
        for (Marker m : markers) if (m.b == b && m.step == step) sel = m;
        return sel;
    }

    private void select(Marker m) {
        Marker prev = selected;
        selected = m;
        if (prev != null) prev.invalidate();
        if (m != null) {
            m.invalidate();
            m.bringToFront();
            if (toolbar != null) toolbar.bringToFront();
        }
        showEditPanel();
    }

    private void nudge(float dx, float dy) {
        if (selected == null) return;
        pushUndo(selected);
        selected.setPos(selected.px() + dx, selected.py() + dy);
        selected.layoutToBinding();
        updatePanelTitle();
        markDirty();
    }

    private TextView panelTitle;
    private Button panelSave;

    private void updatePanelTitle() {
        if (panelTitle != null && selected != null) {
            Profile.Binding b = selected.b;
            String step = Profile.MACRO.equals(b.type) ? L.t("  paso ") + (selected.step + 1)
                    : Profile.SWIPE.equals(b.type) ? (selected.step == 1 ? L.t("  fin") : L.t("  inicio")) : "";
            panelTitle.setText(Profile.label(b.key) + step + "   " + Math.round(selected.px()) + ", "
                    + Math.round(selected.py()));
        }
    }

    // ------------------------------------------------------------------ macros
    /** Fila L.t("etiqueta  [-g] [-f] valor [+f] [+g]") para ajustar un tiempo en ms. */
    private LinearLayout msControl(String name, final float[] holder, float fine, float coarse, float min,
                                   final Runnable onChange) {
        LinearLayout r = row();
        TextView n = text(name, 12, C_TEXT2, false);
        n.setMinWidth(dp(56));
        r.addView(n);
        final TextView val = text(Profile.num(holder[0]) + L.t(" ms"), 13, Color.WHITE, true);
        val.setMinWidth(dp(66));
        val.setGravity(Gravity.CENTER);
        float[] deltas = {-coarse, -fine, fine, coarse};
        for (int i = 0; i < 4; i++) {
            final float d = deltas[i];
            if (i == 2) r.addView(val);
            String lbl = (d > 0 ? "+" : "−") + Profile.num(Math.abs(d));
            r.addView(button(lbl, C_NEUTRAL, v -> {
                holder[0] = Math.max(min, Math.round((holder[0] + d) * 10) / 10f);
                val.setText(Profile.num(holder[0]) + L.t(" ms"));
                onChange.run();
            }));
        }
        return r;
    }

    private void addMacroSection(LinearLayout panel, final Profile.Binding b) {
        panel.addView(text(L.t("  Retraso = espera desde el paso anterior (0 = a la vez). Pulsar = cuánto dura el toque."),
                11, C_TEXT2, false));
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        for (int i = 0; i < b.steps.size(); i++) {
            final int idx = i;
            final Profile.Step s = b.steps.get(i);
            boolean sel = selected != null && selected.step == i;
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setBackground(roundBg(sel ? 0x553F51B5 : 0x22FFFFFF, 12));
            card.setPadding(dp(8), dp(2), dp(4), dp(2));
            LinearLayout head = row();
            head.addView(text(L.t("Paso ") + (i + 1), 13, sel ? 0xFFFFEB3B : Color.WHITE, true),
                    new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            head.addView(button(L.t("Ver"), C_NEUTRAL, v -> {
                Marker m = null;
                for (Marker mk : markers) if (mk.b == b && mk.step == idx) m = mk;
                if (m != null) select(m);
            }));
            if (b.steps.size() > 1) {
                head.addView(button("✕", C_DANGER, v -> {
                    b.steps.remove(idx);
                    b.x = b.steps.get(0).x;
                    b.y = b.steps.get(0).y;
                    markDirty();
                    select(rebuildMarkers(b, Math.max(0, idx - 1)));
                }));
            }
            card.addView(head);
            final float[] delay = {s.delay}, hold = {s.hold};
            if (i > 0 || s.delay > 0) {
                card.addView(msControl(L.t("Retraso"), delay, 0.5f, 10, 0, () -> {
                    s.delay = delay[0];
                    markDirty();
                }));
            }
            card.addView(msControl(L.t("Pulsar"), hold, 1, 10, 1, () -> {
                s.hold = hold[0];
                markDirty();
            }));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.bottomMargin = dp(4);
            list.addView(card, lp);
        }
        ScrollView sv = new ScrollView(this);
        sv.addView(list);
        int[] sz = measure(list);
        int maxH = Math.round(Math.min(profile.sw, profile.sh) * 0.42f);
        panel.addView(sv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.min(sz[1], maxH)));
        if (selected != null && selected.step > 0) {
            final int target = selected.step;
            sv.post(() -> sv.scrollTo(0, list.getChildAt(Math.min(target, list.getChildCount() - 1)).getTop()));
        }
        LinearLayout add = row();
        add.addView(button(L.t("+ Paso"), C_PRIMARY, v -> {
            if (b.steps.size() >= 16) {
                toast(L.t("Máximo 16 pasos por macro"));
                return;
            }
            Profile.Step last = b.steps.get(b.steps.size() - 1);
            float nx = Math.min(profile.sw - 1, last.x + dp(56)), ny = last.y;
            b.steps.add(new Profile.Step(nx, ny, 50, 40));
            markDirty();
            select(rebuildMarkers(b, b.steps.size() - 1));
            toast(L.t("Arrastra el círculo ") + Profile.label(b.key) + (b.steps.size()) + L.t(" a su sitio"));
        }));
        panel.addView(add);
    }

    private void showEditPanel() {
        if (editPanel != null) {
            editor.removeView(editPanel);
            editPanel = null;
            panelTitle = null;
            panelSave = null;
        }
        if (toolbar != null) toolbar.setVisibility(selected == null ? View.VISIBLE : View.GONE);
        if (selected == null || editor == null) return;
        final Profile.Binding b = selected.b;
        final boolean stick = Profile.isStick(b.key);

        editPanel = new LinearLayout(this);
        editPanel.setOrientation(LinearLayout.VERTICAL);
        editPanel.setBackground(roundBg(C_CARD, 18));
        editPanel.setPadding(dp(4), dp(2), dp(8), dp(6));
        editPanel.setClickable(true);  // que los toques en el panel no deseleccionen

        // Cabecera: asa, nombre + coordenadas, minimizar, cerrar.
        LinearLayout head = row();
        TextView grip = handle();
        head.addView(grip);
        panelTitle = text("", 15, Color.WHITE, true);
        head.addView(panelTitle, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        updatePanelTitle();
        // Mientras se edita un boton la barra se oculta; el panel trae su propio Guardar.
        panelSave = button(dirty ? L.t("Guardar ●") : L.t("Guardar"), C_OK, v -> save());
        head.addView(panelSave);
        head.addView(button(panelCollapsed ? "▴" : "▾", C_NEUTRAL, v -> {
            panelCollapsed = !panelCollapsed;
            showEditPanel();
        }));
        head.addView(button("✕", C_NEUTRAL, v -> select(null)));
        editPanel.addView(head);

        if (!panelCollapsed) {
            // Acciones principales.
            LinearLayout actions = row();
            if (stick) {
                actions.addView(button(Profile.STICK.equals(b.type) ? L.t("✓ Joystick") : L.t("Joystick"),
                        Profile.STICK.equals(b.type) ? C_OK : C_PRIMARY, v -> setType(b, Profile.STICK)));
                actions.addView(button(Profile.LOOK.equals(b.type) ? L.t("✓ Cámara") : L.t("Cámara"),
                        Profile.LOOK.equals(b.type) ? C_OK : C_PRIMARY, v -> setType(b, Profile.LOOK)));
                actions.addView(button(L.t("Detectar stick"), C_WARN, v -> learnStick(b)));
                if (Profile.STICK.equals(b.type)) {
                    actions.addView(button(b.dpad ? L.t("✓ + Cruceta") : L.t("+ Cruceta"), b.dpad ? C_OK : C_PRIMARY, v -> {
                        b.dpad = !b.dpad;
                        if (b.dpad) {
                            // Solo un joystick con cruceta: se quita del otro stick.
                            Profile.Binding other = profile.bindings.get("LS".equals(b.key) ? "RS" : "LS");
                            if (other != null && other.dpad) {
                                other.dpad = false;
                                Marker om = findMarker(other.key);
                                if (om != null) om.invalidate();
                            }
                            boolean own = false;
                            for (String k : DPAD_KEYS) own |= profile.bindings.containsKey(k);
                            toast(own ? L.t("La cruceta mueve este joystick (las flechas con círculo propio siguen tocando su sitio)")
                                    : L.t("La cruceta también mueve este joystick"));
                        }
                        markDirty();
                        Marker m = findMarker(b.key);
                        if (m != null) m.invalidate();
                        showEditPanel();
                    }));
                }
            } else {
                actions.addView(button(L.t("Detectar botón"), C_WARN, v -> startLearn(
                        L.t("Pulsa en el mando el botón para ") + Profile.label(b.key), tok -> {
                            // Conserva la capa: en "L2+A", detectar B da "L2+B".
                            String mod = Profile.modOf(b.key);
                            String token = mod.isEmpty() ? tok : mod + "+" + tok;
                            Marker other = findMarker(token);
                            profile.rekey(b, token);
                            markDirty();
                            if (other != null) {
                                other.invalidate();
                                toast(L.t("Intercambiado con el círculo que usaba ") + Profile.label(token));
                            } else {
                                toast(L.t("Asignado: ") + Profile.label(token));
                            }
                            if (selected != null) selected.invalidate();
                            showEditPanel();
                        })));
            }
            actions.addView(button(L.t("Quitar"), C_DANGER, v -> {
                profile.bindings.remove(b.key);
                removeMarkers(b);
                selected = null;
                markDirty();
                showEditPanel();
            }));
            editPanel.addView(actions);

            if (!stick) {
                // Tipo de accion: toque, turbo, interruptor, deslizar o macro.
                HorizontalScrollView ts = new HorizontalScrollView(this);
                ts.setHorizontalScrollBarEnabled(false);
                LinearLayout types = row();
                for (final String t : Profile.BUTTON_TYPES) {
                    final boolean on = t.equals(b.type);
                    types.addView(button((on ? "✓ " : "") + Profile.typeName(t), on ? C_OK : C_PRIMARY, v -> {
                        if (on) return;
                        profile.setButtonType(b, t);
                        markDirty();
                        select(rebuildMarkers(b, 0));
                        if (Profile.SWIPE.equals(t)) toast(L.t("Arrastra el círculo con → al punto donde termina el deslizamiento"));
                    }));
                }
                ts.addView(types);
                editPanel.addView(ts);

                // Capa: mientras se mantiene el modificador, este boton hace otra cosa.
                HorizontalScrollView lsv = new HorizontalScrollView(this);
                lsv.setHorizontalScrollBarEnabled(false);
                LinearLayout layers = row();
                layers.addView(text(L.t("  Capa"), 12, C_TEXT2, false));
                final String mod = Profile.modOf(b.key), base = Profile.baseOf(b.key);
                List<String> opts = new ArrayList<>();
                opts.add("");
                for (String m : Profile.MODIFIERS) if (!m.equals(base)) opts.add(m);
                for (final String m : opts) {
                    final boolean on = m.equals(mod);
                    layers.addView(button((on ? "✓ " : "") + (m.isEmpty() ? L.t("Ninguna") : Profile.label(m)),
                            on ? C_OK : C_NEUTRAL, v -> {
                                if (on) return;
                                profile.rekey(b, m.isEmpty() ? base : m + "+" + base);   // si existia, se intercambian
                                markDirty();
                                for (Marker mk : markers) mk.invalidate();
                                showEditPanel();
                            }));
                }
                layers.addView(button(L.t("+ Duplicar en capa"), C_PRIMARY, v -> duplicateInLayer(b)));
                lsv.addView(layers);
                editPanel.addView(lsv);
                if (!mod.isEmpty()) {
                    editPanel.addView(text(L.t("  Mantén ") + Profile.label(mod) + L.t(" y pulsa ") + Profile.label(base)
                            + ". " + Profile.label(mod) + L.t(" pasa a ser solo modificador (no toca por sí solo)."),
                            11, C_TEXT2, false));
                }
            }

            // Ajuste fino.
            LinearLayout fine = row();
            fine.addView(text(L.t("  Ajuste fino"), 12, C_TEXT2, false));
            fine.addView(button("◀", C_NEUTRAL, v -> nudge(-2, 0)));
            fine.addView(button("▲", C_NEUTRAL, v -> nudge(0, -2)));
            fine.addView(button("▼", C_NEUTRAL, v -> nudge(0, 2)));
            fine.addView(button("▶", C_NEUTRAL, v -> nudge(2, 0)));
            editPanel.addView(fine);

            if (Profile.MACRO.equals(b.type)) addMacroSection(editPanel, b);
            if (Profile.TURBO.equals(b.type)) {
                LinearLayout o = new LinearLayout(this);
                o.setOrientation(LinearLayout.VERTICAL);
                o.setPadding(dp(8), 0, 0, 0);
                addSlider(o, L.t("Turbo: %d toques por segundo"), 2, 30, Math.round(b.rate), v -> b.rate = v);
                editPanel.addView(o);
            }
            if (Profile.SWIPE.equals(b.type)) {
                LinearLayout o = new LinearLayout(this);
                o.setOrientation(LinearLayout.VERTICAL);
                o.setPadding(dp(8), 0, 0, 0);
                o.addView(text(L.t("Mueve el círculo «") + Profile.label(b.key) + L.t("→» al punto final."), 11, C_TEXT2, false));
                addSlider(o, L.t("Duración: %d ms"), 40, 1000, Math.round(b.dur), v -> b.dur = v);
                editPanel.addView(o);
            }
            if (Profile.TOGGLE.equals(b.type)) {
                editPanel.addView(text(L.t("  Una pulsación mantiene el toque; la siguiente lo suelta."), 11, C_TEXT2, false));
            }
            if (Profile.BURST.equals(b.type)) {
                LinearLayout o = new LinearLayout(this);
                o.setOrientation(LinearLayout.VERTICAL);
                o.setPadding(dp(8), 0, 0, 0);
                o.addView(text(L.t("  Al pulsar en el mando hace varios toques seguidos en este punto."), 11, C_TEXT2, false));
                addSlider(o, L.t("Toques: %d"), Profile.BURST_MIN, Profile.BURST_MAX, b.count, v -> {
                    b.count = v;
                    Marker m = findMarker(b.key);
                    if (m != null) m.invalidate();
                });
                addSlider(o, L.t("Intervalo: %d ms"), Profile.BURST_GAP_MIN, Profile.BURST_GAP_MAX, Math.round(b.gap),
                        v -> b.gap = v);
                editPanel.addView(o);
            }
            if (Profile.QUICK.equals(b.type)) {
                editPanel.addView(text(L.t("  Un toque corto al pulsar, aunque mantengas el botón. Ideal para ataques que se lanzan al soltar."),
                        11, C_TEXT2, false));
            }
            if (Profile.TAP.equals(b.type) && holdMayBreak()) {
                TextView w = text(L.t("  Sin root, mantener este botón mientras mueves el stick puede soltarlo (límite de Android). ")
                        + L.t("Si es un ataque que se lanza al soltar, usa «Toque rápido»."), 11, 0xFFFFB74D, false);
                editPanel.addView(w);
            }

            if (stick) {
                LinearLayout opts = new LinearLayout(this);
                opts.setOrientation(LinearLayout.VERTICAL);
                opts.setPadding(dp(8), 0, 0, 0);
                String axes = "LS".equals(b.key) ? profile.lsAxes : profile.rsAxes;
                opts.addView(text(L.t("Ejes del mando: ") + (axes.isEmpty() ? L.t("automáticos") : axes), 12, C_TEXT2, false));
                if (Profile.LOOK.equals(b.type)) {
                    addSlider(opts, L.t("Velocidad de cámara: %d"), 2, 60, Math.round(b.r), v -> b.r = v);
                    addSlider(opts, L.t("Sensibilidad vertical: %d%%"), 20, 200, Math.round(profile.lookY * 100),
                            v -> profile.lookY = v / 100f);
                    opts.addView(button(profile.lookInvert ? L.t("✓ Eje Y invertido") : L.t("Invertir eje Y"),
                            profile.lookInvert ? C_OK : C_NEUTRAL, v -> {
                                profile.lookInvert = !profile.lookInvert;
                                markDirty();
                                showEditPanel();
                            }));
                } else {
                    int max = Math.round(Math.min(profile.sw, profile.sh) * 0.5f);
                    addSlider(opts, L.t("Radio del joystick: %d px"), dp(20), max, Math.round(b.r), v -> {
                        b.r = v;
                        if (selected != null) selected.layoutToBinding();
                    });
                }
                final boolean isLs = "LS".equals(b.key);
                addSlider(opts, L.t("Zona muerta de ") + b.key + L.t(": %d%%"), 0, 60,
                        Math.round(profile.deadzoneOf(b.key) * 100), v -> {
                            if (isLs) profile.lsDeadzone = v / 100f;
                            else profile.rsDeadzone = v / 100f;
                        });
                addSlider(opts, L.t("Curva: %d%% (100 = lineal, más = más fino cerca del centro)"), 100, 300,
                        Math.round(profile.curveOf(b.key) * 100), v -> {
                            if (isLs) profile.lsCurve = v / 100f;
                            else profile.rsCurve = v / 100f;
                        });
                editPanel.addView(opts);
            }
        }

        fitToScreen(editPanel, 0, 1);   // cabecera fija y el resto desplazable si no cabe

        // Colocacion: donde lo dejo el usuario, o donde menos tape (nunca el boton elegido).
        if (!panelPinned) {
            int[] sz = measure(editPanel);
            panelGravity = bestSpot(sz[0], sz[1], selected, toolbar);
            panelTx = 0;
            panelTy = 0;
        }
        editor.addView(editPanel, spotParams(panelGravity));
        editPanel.setTranslationX(panelTx);
        editPanel.setTranslationY(panelTy);
        final LinearLayout panel = editPanel;
        makeDraggable(panel, grip, () -> {
            panelPinned = true;
            panelTx = panel.getTranslationX();
            panelTy = panel.getTranslationY();
        });
        if (toolbar != null) toolbar.bringToFront();
    }

    /** Copia este boton en la primera capa libre (p. ej. "A" -> "L2+A"), un poco desplazado. */
    private void duplicateInLayer(Profile.Binding b) {
        String base = Profile.baseOf(b.key);
        String key = null;
        for (String m : Profile.MODIFIERS) {
            if (m.equals(base) || m.equals(Profile.modOf(b.key))) continue;
            if (!profile.bindings.containsKey(m + "+" + base)) {
                key = m + "+" + base;
                break;
            }
        }
        if (key == null) {
            toast(L.t("Ya hay una copia de ") + Profile.label(base) + L.t(" en todas las capas"));
            return;
        }
        float nx = Math.min(profile.sw - 1, b.x + dp(48)), ny = Math.min(profile.sh - 1, b.y + dp(48));
        Profile.Binding c = profile.add(key, nx, ny);
        profile.setButtonType(c, b.type);
        c.rate = b.rate;
        c.dur = b.dur;
        if (Profile.SWIPE.equals(b.type)) {
            c.x2 = Math.min(profile.sw - 1, b.x2 + dp(48));
            c.y2 = Math.min(profile.sh - 1, b.y2 + dp(48));
        }
        if (Profile.MACRO.equals(b.type)) {
            c.steps.clear();
            for (Profile.Step s : b.steps)
                c.steps.add(new Profile.Step(Math.min(profile.sw - 1, s.x + dp(48)), Math.min(profile.sh - 1, s.y + dp(48)),
                        s.delay, s.hold));
        }
        markDirty();
        select(addMarker(c));
        toast(L.t("Creado ") + Profile.label(key) + L.t(": cambia la capa o arrástralo a su sitio"));
    }

    /** ¿Mantener un toque puede fallar? Motor de accesibilidad leyendo un joystick (Android 14+). */
    private boolean holdMayBreak() {
        if (RootMode.active() || Build.VERSION.SDK_INT < 34) return false;
        for (Profile.Binding x : profile.bindings.values()) if (Profile.STICK.equals(x.type)) return true;
        return false;
    }

    private void setType(Profile.Binding b, String type) {
        if (type.equals(b.type)) return;
        b.type = type;
        b.r = Profile.LOOK.equals(type) ? 14 : Math.round(Math.min(profile.sw, profile.sh) * 0.14f);
        Marker m = findMarker(b.key);
        if (m != null) m.layoutToBinding();
        markDirty();
        showEditPanel();
    }

    /**
     * Circulo arrastrable: un boton del perfil, o un paso concreto de una macro
     * (step > 0 son los pasos extra, dibujados mas pequenos y numerados).
     */
    private class Marker extends View {
        final Profile.Binding b;
        final int step;
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        private int base = dp(24);   // se recalcula con el tamano elegido
        private float downX, downY, startX, startY;
        private boolean moved;
        private final int slop = ViewConfiguration.get(OverlayService.this).getScaledTouchSlop();

        Marker(Context c, Profile.Binding b, int step) {
            super(c);
            this.b = b;
            this.step = step;
            stroke.setStyle(Paint.Style.STROKE);
            stroke.setStrokeWidth(dp(2));
            text.setColor(Color.WHITE);
            text.setTextAlign(Paint.Align.CENTER);
            text.setTypeface(Typeface.DEFAULT_BOLD);
        }

        private boolean isMacro() {
            return Profile.MACRO.equals(b.type) && step < b.steps.size();
        }

        /** Punto final de un deslizamiento (segundo circulo). */
        private boolean isSwipeEnd() {
            return Profile.SWIPE.equals(b.type) && step == 1;
        }

        float px() {
            return isMacro() ? b.steps.get(step).x : isSwipeEnd() ? b.x2 : b.x;
        }

        float py() {
            return isMacro() ? b.steps.get(step).y : isSwipeEnd() ? b.y2 : b.y;
        }

        void setPos(float x, float y) {
            x = Math.max(0, Math.min(profile.sw - 1, x));
            y = Math.max(0, Math.min(profile.sh - 1, y));
            if (isMacro()) {
                b.steps.get(step).x = x;
                b.steps.get(step).y = y;
            }
            if (isSwipeEnd()) {
                b.x2 = x;
                b.y2 = y;
            } else if (step == 0) {
                b.x = x;
                b.y = y;
            }
        }

        /** Radio visible del marcador (el anillo del joystick si es un stick). */
        float radius() {
            if (Profile.STICK.equals(b.type)) return Math.max(base, b.r);
            if (Profile.LOOK.equals(b.type)) return base * 1.6f;
            if (step > 0) return base * 0.8f;
            return base;
        }

        void layoutToBinding() {
            base = Math.round(dp(24) * SCALES[scaleIdx]);
            int size = Math.round(radius() * 2) + dp(4);
            setLayoutParams(new FrameLayout.LayoutParams(size, size));
            setX(px() - offX - size / 2f);
            setY(py() - offY - size / 2f);
            invalidate();
        }

        @Override
        protected void onDraw(Canvas c) {
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            boolean sel = selected == this;
            boolean macro = Profile.MACRO.equals(b.type);
            int accent = typeColor(b.type);
            if (Profile.STICK.equals(b.type) || Profile.LOOK.equals(b.type)) {
                fill.setColor((accent & 0x00FFFFFF) | 0x30000000);
                c.drawCircle(cx, cy, radius() - dp(2), fill);
                stroke.setColor(sel ? 0xFFFFEB3B : accent);
                c.drawCircle(cx, cy, radius() - dp(2), stroke);
                if (Profile.STICK.equals(b.type) && b.dpad) drawDpadArrows(c, cx, cy, radius() - dp(2), fill);
            }
            float rr = step > 0 ? base * 0.72f : base * 0.85f;
            fill.setColor((accent & 0x00FFFFFF) | (sel ? 0xEE000000 : 0xB0000000));
            stroke.setColor(sel ? 0xFFFFEB3B : Color.WHITE);
            stroke.setStrokeWidth(dp(sel ? 3 : 2));
            c.drawCircle(cx, cy, rr, fill);
            c.drawCircle(cx, cy, rr, stroke);
            stroke.setStrokeWidth(dp(2));
            String lbl = Profile.label(b.key) + (macro ? String.valueOf(step + 1) : isSwipeEnd() ? "→" : "");
            float ts = (lbl.length() > 4 ? 8 : lbl.length() > 2 ? 10 : 13) * Math.max(0.7f, SCALES[scaleIdx]);
            text.setTextSize(dp(ts));
            // Etiqueta un poco por encima del centro y cruz en el punto exacto del toque.
            c.drawText(lbl, cx, cy - rr * 0.38f - (text.descent() + text.ascent()) / 2, text);
            stroke.setColor(sel ? 0xFFFFEB3B : 0xCCFFFFFF);
            float k = dp(4);
            c.drawLine(cx - k, cy, cx + k, cy, stroke);
            c.drawLine(cx, cy - k, cx, cy + k, stroke);
            String tag = Profile.LOOK.equals(b.type) ? L.t("cámara") : Profile.TURBO.equals(b.type) ? "turbo"
                    : Profile.TOGGLE.equals(b.type) ? "interruptor" : Profile.QUICK.equals(b.type) ? L.t("rápido")
                    : Profile.BURST.equals(b.type) ? "x" + b.count
                    : isSwipeEnd() ? "fin" : "";
            if (!tag.isEmpty()) {
                text.setTextSize(dp(8));
                c.drawText(tag, cx, cy + rr + dp(9), text);
            }
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = e.getRawX();
                    downY = e.getRawY();
                    startX = px();
                    startY = py();
                    moved = false;
                    return true;
                case MotionEvent.ACTION_MOVE:
                    float mx = e.getRawX() - downX, my = e.getRawY() - downY;
                    if (!moved && (Math.abs(mx) > slop || Math.abs(my) > slop)) {
                        moved = true;
                        undo.push(new Move(this, startX, startY));
                        while (undo.size() > 50) undo.removeLast();
                        if (undoButton != null) undoButton.setEnabled(true);
                        if (selected != this) select(this);
                        setChromeFaded(true);
                    }
                    if (moved) {
                        setPos(startX + mx, startY + my);
                        layoutToBinding();
                        updatePanelTitle();
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (moved) {
                        setChromeFaded(false);
                        markDirty();
                        // Si el panel quedo encima del boton y no lo fijo el usuario, recolocarlo.
                        if (!panelPinned) showEditPanel();
                    } else {
                        select(this);
                    }
                    return true;
            }
            return false;
        }
    }
}
