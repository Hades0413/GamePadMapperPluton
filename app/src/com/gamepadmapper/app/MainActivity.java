package com.gamepadmapper.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Pantalla principal: estado, tus juegos (con su logo) y biblioteca de perfiles.
 * Los perfiles se crean y cambian desde la burbuja dentro de cada juego.
 */
public class MainActivity extends Activity {
    private static final String KEY_CATALOG = "catalog_url";
    private static final int REQ_IMPORT = 42, REQ_EXPORT_ALL = 43, REQ_EXPORT_ONE = 44, REQ_LEGACY = 45, REQ_MODULE = 46;
    private File pendingExport;
    private LinearLayout content, navBar;
    private ScrollView scroll;
    private static final int TAB_HOME = 0, TAB_GAMES = 1, TAB_PAD = 2, TAB_PROFILES = 3, TAB_SETTINGS = 4;
    public static final String AUTHOR = "Hades0413";
    private PadTestView padTest;
    private TextView padLast;
    private String padSig;
    private int tab = TAB_HOME;
    private int insetTop, insetBottom;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Library.init(this);
        L.init(this);
        Profile.init(this);
        getWindow().setStatusBarColor(Ui.BG);
        getWindow().setNavigationBarColor(Ui.SURFACE);
        // Pantalla: contenido desplazable arriba + barra de pestanas fija abajo.
        final LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        navBar = new LinearLayout(this);
        navBar.setOrientation(LinearLayout.HORIZONTAL);
        navBar.setBackgroundColor(Ui.SURFACE);
        root.addView(navBar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        // El boton central sobresale de la barra: no recortar.
        root.setClipChildren(false);
        navBar.setClipChildren(false);
        navBar.setClipToPadding(false);
        tab = getSharedPreferences(Games.PREFS, MODE_PRIVATE).getInt("tab", TAB_HOME);
        if (tab < TAB_HOME || tab > TAB_SETTINGS) tab = TAB_HOME;
        if (state != null) tab = state.getInt("tab", tab);
        // Android 15+ dibuja detras de las barras del sistema: respetar sus margenes.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left = 0, right = 0;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                insetTop = i.top;
                insetBottom = i.bottom;
                left = i.left;
                right = i.right;
            } else {
                insetTop = insets.getSystemWindowInsetTop();
                insetBottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(left, 0, right, 0);
            content.setPadding(dp(18), dp(14) + insetTop, dp(18), dp(20));
            navBar.setPadding(dp(6), dp(6), dp(6), dp(6) + insetBottom);
            return insets;
        });
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        Perms.hideGuide();   // de vuelta en la app: la guia de Ajustes sobra
        render();
        startBubbleIfReady();
        handleShared(getIntent());
        maybeShowWelcome();
        refresher.run();
        // Shizuku: redibujar cuando conecte o cambie el permiso (y relanzar el modo rapido si toca).
        ShizukuClient.setListener(() -> {
            if (tab == TAB_SETTINGS) render();
        });
        ShizukuClient.autoStart();
        Updates.checkIfDue(this, () -> {
            if (tab == TAB_HOME) render();
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        handler.removeCallbacks(refresher);
        ShizukuClient.setListener(null);
    }

    // ------------------------------------------------------------------ servicio gpmapper
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());
    private LinearLayout svcCard;
    private boolean stepsOpen = false;   // pasos de activacion desplegados
    private TextView headerStatus;
    private View headerDot;
    private String svcSig = "";

    /** Refresca la tarjeta del servicio cada 2 s mientras la app esta visible. */
    private final Runnable refresher = new Runnable() {
        @Override
        public void run() {
            handler.removeCallbacks(this);
            try {
                fillServiceCard(false);
                if (tab == TAB_PAD) {   // mando conectado / desconectado: redibujar la lista
                    StringBuilder s = new StringBuilder();
                    for (Mapper.Pad p : Mapper.pads()) s.append(p.name).append(p.gamepad).append('|');
                    if (!s.toString().equals(padSig)) {
                        boolean first = padSig == null;
                        padSig = s.toString();
                        if (!first) render();
                    }
                }
            } catch (Exception ignored) {
            }
            handler.postDelayed(this, 2000);
        }
    };

    private View serviceCard() {
        svcCard = card();
        svcSig = "";
        fillServiceCard(true);
        return svcCard;
    }

    private void fillServiceCard(boolean force) {
        if (svcCard == null) return;
        Mapper.Status st = Mapper.status();
        boolean acc = PadService.isEnabled(this);
        List<Mapper.Pad> pads = Mapper.pads();
        StringBuilder sig = new StringBuilder();
        sig.append(st.running).append(st.build).append(acc).append(PadService.lastProfile).append('|').append(st.gamepad).append('|').append(st.profile);
        for (Mapper.Pad p : pads) sig.append('|').append(p.name).append(p.gamepad).append(p.touch);
        if (!force && sig.toString().equals(svcSig)) return;
        svcSig = sig.toString();
        svcCard.removeAllViews();
        updateHeaderStatus(st);

        if (st.running) {
            svcCard.addView(Ui.menuRow(this, R.drawable.ic_check, Ui.OK, L.t("Mapeador activo"),
                    st.root ? L.t("Con root (módulo Magisk)") : L.t("Modo rápido (Shizuku)"), null));
            // Modulo root anterior a esta app: ignora las funciones nuevas sin avisar.
            if (st.root && st.build < RootMode.MODULE_BUILD) {
                svcCard.addView(Ui.menuRow(this, R.drawable.ic_warning, Ui.WARN, L.t("Actualiza el módulo root"),
                        L.t("El instalado es anterior a la app: no entiende Toque rápido, Ráfaga ni Joystick + cruceta. Toca para actualizarlo."),
                        v -> showRootInfo(true)));
            }
        } else if (acc) {
            svcCard.addView(Ui.menuRow(this, R.drawable.ic_check, Ui.OK, L.t("Mapeador activo"),
                    L.t("Abre un juego con perfil y usa el mando"), null));
            if (!PadService.sticksSupported()) {
                TextView w = Ui.text(this, L.t("Tu Android es anterior a la versión 14: funcionan los botones y macros, ")
                        + L.t("pero Android no deja a las apps leer los sticks analógicos. Usa la cruceta o asigna botones."),
                        12, Ui.WARN, false);
                w.setPadding(dp(62), 0, dp(12), dp(8));
                svcCard.addView(w);
            }
        } else {
            LinearLayout r = Ui.menuRow(this, R.drawable.ic_play, Ui.WARN, L.t("Activar el mapeador"),
                    L.t("Un solo paso, sin root y sin PC"), null);
            r.setClickable(false);
            svcCard.addView(r);
            LinearLayout btns = new LinearLayout(this);
            btns.setPadding(dp(8), dp(2), dp(8), dp(6));
            LinearLayout open = Ui.button(this, R.drawable.ic_play, L.t("Activar"), Ui.PRIMARY_DARK, Color.WHITE,
                    v -> Perms.request(this, Perms.ACCESSIBILITY));
            btns.addView(open, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            LinearLayout how = Ui.button(this, stepsOpen ? R.drawable.ic_close : R.drawable.ic_info,
                    stepsOpen ? L.t("Ocultar") : L.t("¿Cómo?"), Ui.SURFACE_2, Ui.TEXT, v -> {
                        stepsOpen = !stepsOpen;
                        fillServiceCard(true);
                    });
            LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
            hlp.leftMargin = dp(8);
            btns.addView(how, hlp);
            svcCard.addView(btns);
            if (stepsOpen) {
                TextView t = Ui.text(this, L.t("Toca «Activar» y luego:\n") + Perms.accessibilitySteps() + "\n"
                        + L.t("Al terminar vuelves aquí solo.\n\n")
                        + L.t("Si Android dice «Ajuste restringido»: toca el botón de abajo, abre el menú ⋮ ")
                        + L.t("(arriba a la derecha) › Permitir ajustes restringidos, y repite los pasos.\n\n")
                        + L.t("La app solo lee el mando y toca la pantalla donde tú configures. ")
                        + L.t("No lee lo que escribes ni el contenido de otras apps."),
                        13, Ui.TEXT_2, false);
                t.setPadding(dp(12), dp(6), dp(12), dp(8));
                svcCard.addView(t);
                svcCard.addView(Ui.menuRow(this, R.drawable.ic_warning, Ui.TEXT_3, L.t("Permitir ajustes restringidos"),
                        L.t("Información de la app › ⋮"), v -> startActivity(new Intent(
                                Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())))));
            }
        }

        // Mando: una linea resumen; el detalle y el probador estan en la pestana Mando.
        svcCard.addView(Ui.divider(this));
        Mapper.Pad gp = null, touch = null;
        for (Mapper.Pad p : pads) {
            if (p.gamepad && gp == null) gp = p;
            else if (!p.gamepad && touch == null) touch = p;
        }
        String profile = st.running ? st.profile : PadService.lastProfile;
        View.OnClickListener toPad = v -> selectTab(TAB_PAD);
        if (gp != null) {
            svcCard.addView(Ui.menuRow(this, R.drawable.ic_gamepad, Ui.OK, gp.name,
                    profile.isEmpty() ? L.t("Conectado en modo gamepad · toca para probarlo") : L.t("Usando el perfil ") + profile,
                    toPad));
        } else if (touch != null) {
            svcCard.addView(Ui.menuRow(this, R.drawable.ic_warning, Ui.WARN, touch.name,
                    L.t("En modo táctil / ratón: toca para ver cómo cambiarlo"), toPad));
        } else {
            svcCard.addView(Ui.menuRow(this, R.drawable.ic_gamepad, Ui.TEXT_3, L.t("Ningún mando conectado"),
                    L.t("Conéctalo por Bluetooth o USB en modo gamepad"), toPad));
        }
    }

    // ------------------------------------------------------------------ modo rapido con Shizuku (sin root ni PC)
    private View fastModeCard() {
        LinearLayout c = card();
        Mapper.Status st = Mapper.status();
        if (st.running && !st.root) {
            c.addView(Ui.menuRow(this, R.drawable.ic_check, Ui.OK, L.t("Modo rápido activo (Shizuku)"),
                    L.t("El mapeador nativo hace el trabajo: menos retraso"), null));
            LinearLayout stop = Ui.button(this, R.drawable.ic_close, L.t("Detener modo rápido"), Ui.SURFACE_2, Ui.TEXT, v -> {
                ShizukuClient.setAuto(this, false);
                new Thread(() -> {
                    try {
                        ShizukuClient.stopMapper();
                    } catch (Exception ignored) {
                    }
                    runOnUiThread(() -> handler.postDelayed(this::render, 2500));
                }).start();
            });
            c.addView(padded(stop));
            return c;
        }
        LinearLayout r = Ui.menuRow(this, R.drawable.ic_play, Ui.PRIMARY, L.t("Modo rápido sin root (Shizuku)"),
                L.t("Menos retraso y sticks en cualquier Android. Sin PC"), v -> showShizukuGuide());
        c.addView(r);
        LinearLayout btns = new LinearLayout(this);
        btns.setPadding(dp(8), 0, dp(8), dp(6));
        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        LinearLayout.LayoutParams half2 = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        half2.leftMargin = dp(8);
        LinearLayout guide = Ui.button(this, R.drawable.ic_info, L.t("Guía"), Ui.SURFACE_2, Ui.TEXT, v -> showShizukuGuide());
        if (!ShizukuClient.installed(this)) {
            btns.addView(Ui.button(this, R.drawable.ic_download, L.t("Instalar Shizuku"), Ui.PRIMARY_DARK, Color.WHITE, v -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + ShizukuClient.MANAGER_PACKAGE)));
                } catch (Exception e) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://shizuku.rikka.app/download/")));
                }
            }), half);
        } else if (!ShizukuClient.running()) {
            btns.addView(Ui.button(this, R.drawable.ic_play, L.t("Abrir Shizuku"), Ui.PRIMARY_DARK, Color.WHITE, v -> {
                Intent i = getPackageManager().getLaunchIntentForPackage(ShizukuClient.MANAGER_PACKAGE);
                if (i != null) startActivity(i);
            }), half);
        } else if (!ShizukuClient.hasPermission()) {
            btns.addView(Ui.button(this, R.drawable.ic_check, L.t("Dar permiso"), Ui.PRIMARY_DARK, Color.WHITE,
                    v -> ShizukuClient.requestPermission()), half);
        } else {
            btns.addView(Ui.button(this, R.drawable.ic_play, L.t("Activar modo rápido"), Ui.PRIMARY_DARK, Color.WHITE, v -> {
                ShizukuClient.setAuto(this, true);
                new Thread(() -> {
                    String err = null;
                    try {
                        ShizukuClient.startMapper(this);
                    } catch (Exception e) {
                        err = e.getMessage();
                    }
                    final String fe = err;
                    runOnUiThread(() -> {
                        Toast.makeText(this, fe == null ? L.t("Modo rápido activado") : L.t("No se pudo activar: ") + fe,
                                Toast.LENGTH_LONG).show();
                        handler.postDelayed(this::render, 3000);
                    });
                }).start();
            }), half);
        }
        btns.addView(guide, half2);
        c.addView(btns);
        String state = !ShizukuClient.installed(this) ? L.t("Shizuku no está instalado.")
                : !ShizukuClient.running() ? L.t("Shizuku está instalado pero no en marcha: ábrelo y pulsa Iniciar.")
                : !ShizukuClient.hasPermission() ? L.t("Shizuku está en marcha: dale permiso a esta app.")
                : L.t("Todo listo: actívalo. Se reactivará solo cuando Shizuku esté en marcha.");
        TextView t = Ui.text(this, state, 12, Ui.TEXT_3, false);
        t.setPadding(dp(12), 0, dp(12), dp(8));
        c.addView(t);
        return c;
    }

    private View padded(View v) {
        LinearLayout box = new LinearLayout(this);
        box.setPadding(dp(8), 0, dp(8), dp(6));
        box.addView(v, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return box;
    }

    private void showShizukuGuide() {
        String msg = L.t("Shizuku es una app gratuita y de código abierto que permite a esta app funcionar como con "
                + "root, pero sin root ni PC. Se activa una vez con la depuración inalámbrica del propio teléfono:\n\n")
                + L.t("1. Activa las Opciones de desarrollador: Ajustes › Acerca del teléfono › toca 7 veces "
                + "«Número de compilación».\n\n")
                + L.t("2. Conéctate a una red Wi-Fi y activa Ajustes › Sistema › Opciones de desarrollador › "
                + "Depuración inalámbrica.\n\n")
                + L.t("3. Instala y abre Shizuku › «Iniciar vía depuración inalámbrica» › «Emparejamiento». En Opciones "
                + "de desarrollador › Depuración inalámbrica toca «Vincular dispositivo con código» y escribe el código en "
                + "la notificación de Shizuku.\n\n")
                + L.t("4. En Shizuku pulsa «Iniciar». Vuelve aquí › Dar permiso › Activar modo rápido.\n\n")
                + L.t("Después de reiniciar el teléfono: abre Shizuku y pulsa «Iniciar» (con Wi-Fi). Esta app se "
                + "reactiva sola. El emparejamiento solo se hace una vez.");
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(L.t("Modo rápido con Shizuku"))
                .setMessage(msg)
                .setPositiveButton(L.t("Entendido"), null)
                .setNeutralButton(L.t("Opciones de desarrollador"), (d, w) -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS));
                    } catch (Exception e) {
                        startActivity(new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS));
                    }
                })
                .show();
    }

    // ------------------------------------------------------------------ modo root (mejora opcional)
    private View rootCard() {
        LinearLayout c = card();
        boolean root = RootMode.detected(this);
        LinearLayout r = Ui.menuRow(this, R.drawable.ic_upload, root ? Ui.OK : Ui.TEXT_2,
                root ? L.t("Mejora disponible: tienes root") : L.t("Mejora con root (opcional)"),
                root ? L.t("Más rápido y preciso con el módulo de Magisk") : L.t("Para teléfonos con Magisk o KernelSU"),
                v -> showRootInfo(root));
        c.addView(r);
        return c;
    }

    private void showRootInfo(boolean root) {
        String msg = L.t("Con root, Gamepad Mapper Plutón usa un módulo que hace el mapeo dentro del propio sistema:\n\n")
                + L.t("• Respuesta más rápida (unos 1 ms en vez de 10–20 ms).\n")
                + L.t("• Sticks y gatillos en cualquier versión de Android.\n")
                + L.t("• Macros con precisión de microsegundos.\n")
                + L.t("• Tocar la pantalla con el dedo no interrumpe al mando.\n")
                + L.t("• No necesita el permiso de Accesibilidad.\n\n")
                + L.t("Cómo instalarlo:\n")
                + L.t("1. Toca «Guardar módulo»: se guarda en Descargas como ") + RootMode.MODULE_FILE + ".\n"
                + L.t("2. Abre Magisk (o KernelSU) › Módulos › Instalar desde almacenamiento y elige ese archivo.\n")
                + L.t("3. Reinicia el teléfono.\n\n")
                + L.t("Tus perfiles y la burbuja siguen igual. Con el módulo activo, la app lo detecta sola ")
                + L.t("y deja de usar Accesibilidad.");
        if (!root) msg += L.t("\n\nNo se ha detectado root en este teléfono. Rootear tiene riesgos (garantía, ")
                + L.t("seguridad, apps de bancos). Si no lo tienes, el modo normal funciona bien.");
        AlertDialog.Builder b = new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(root ? L.t("Mejora con root") : L.t("Modo root (opcional)"))
                .setMessage(msg)
                .setPositiveButton(L.t("Guardar módulo"), (d, w) -> {
                    if (Build.VERSION.SDK_INT < 29) {
                        // Android 8-9: sin permiso no se puede escribir en Descargas; "Guardar como".
                        startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                                .setType("application/zip").putExtra(Intent.EXTRA_TITLE, RootMode.MODULE_FILE), REQ_MODULE);
                        return;
                    }
                    try {
                        String name = RootMode.exportModule(this);
                        Toast.makeText(this, L.t("Guardado en Descargas: ") + name, Toast.LENGTH_LONG).show();
                    } catch (Exception e) {
                        Toast.makeText(this, L.t("No se pudo guardar: ") + e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                })
                .setNegativeButton(L.t("Cerrar"), null);
        if (RootMode.hasRepo()) {
            b.setNeutralButton(L.t("Repositorio"), (d, w) -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RootMode.REPO_URL)));
                } catch (Exception ignored) {
                }
            });
        }
        b.show();
    }

    private void updateHeaderStatus(Mapper.Status st) {
        if (headerStatus == null) return;
        String[] s = status(st);
        headerStatus.setText(s[0]);
        GradientDrawable dg = new GradientDrawable();
        dg.setShape(GradientDrawable.OVAL);
        dg.setColor(Integer.parseInt(s[1]));
        headerDot.setBackground(dg);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    private int dp(float v) {
        return Ui.dp(this, v);
    }

    // ------------------------------------------------------------------ permisos y servicio
    private boolean hasFiles() {
        return true;   // los perfiles van en la carpeta propia de la app: no hace falta permiso
    }

    private boolean hasOverlay() {
        return Settings.canDrawOverlays(this);
    }

    private void startBubbleIfReady() {
        // El servicio tambien hace falta sin burbuja si el mapeador sin root necesita la rotacion.
        if (hasFiles() && ((Games.bubbleEnabled(this) && Perms.canDrawBubble(this) && Perms.canKnowGame(this))
                || Mapper.needsRotation())) {
            try {
                startForegroundService(new Intent(this, OverlayService.class));
            } catch (Exception ignored) {
            }
        }
    }

    // ------------------------------------------------------------------ pantalla
    // Cuatro pestanas: Inicio (estado), Juegos, Perfiles (biblioteca) y Ajustes.
    private void render() {
        content.removeAllViews();
        svcCard = null;
        headerStatus = null;
        headerDot = null;
        padTest = null;
        padLast = null;
        buildNav();
        if (!hasFiles() && tab != TAB_SETTINGS) {
            // Sin acceso a archivos no hay perfiles: solo se puede configurar.
            content.addView(header());
            content.addView(setupCard());
            return;
        }
        switch (tab) {
            case TAB_GAMES: renderGames(); break;
            case TAB_PAD: renderPad(); break;
            case TAB_PROFILES: renderProfiles(); break;
            case TAB_SETTINGS: renderSettings(); break;
            default: renderHome(); break;
        }
    }

    private void selectTab(int t) {
        if (t == tab) {
            scroll.smoothScrollTo(0, 0);
            return;
        }
        tab = t;
        getSharedPreferences(Games.PREFS, MODE_PRIVATE).edit().putInt("tab", t).apply();
        render();
        scroll.scrollTo(0, 0);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putInt("tab", tab);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (tab != TAB_HOME) selectTab(TAB_HOME);   // atras vuelve a Inicio antes de salir
        else super.onBackPressed();
    }

    private boolean permissionsMissing() {
        return !setupDone();
    }

    private void buildNav() {
        navBar.removeAllViews();
        String[] names = {L.t("Inicio"), L.t("Juegos"), L.t("Mando"), L.t("Perfiles"), L.t("Ajustes")};
        int[] icons = {R.drawable.ic_home, R.drawable.ic_play, R.drawable.ic_gamepad, R.drawable.ic_folder,
                R.drawable.ic_settings};
        for (int i = 0; i < names.length; i++) {
            final int t = i;
            boolean sel = i == tab;
            if (i == TAB_PAD) {
                navBar.addView(centerNavItem(sel, names[i], icons[i]),
                        new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
                continue;
            }
            LinearLayout item = new LinearLayout(this);
            item.setOrientation(LinearLayout.VERTICAL);
            item.setGravity(Gravity.CENTER_HORIZONTAL);
            item.setPadding(0, dp(4), 0, dp(4));
            item.setBackground(Ui.ripple(this, 0x00000000, 16));
            item.setClickable(true);
            item.setOnClickListener(v -> selectTab(t));
            // Indicador tipo "pastilla" detras del icono seleccionado.
            android.widget.FrameLayout pill = new android.widget.FrameLayout(this);
            pill.setBackground(sel ? Ui.round(this, (Ui.PRIMARY & 0x00FFFFFF) | 0x33000000, 16) : null);
            ImageView ic = Ui.icon(this, icons[i], sel ? Ui.PRIMARY : Ui.TEXT_2, 22);
            android.widget.FrameLayout.LayoutParams ilp = new android.widget.FrameLayout.LayoutParams(dp(22), dp(22),
                    Gravity.CENTER);
            pill.addView(ic, ilp);
            // Punto de aviso en Ajustes si falta algun permiso.
            if (i == TAB_SETTINGS && permissionsMissing()) {
                View dot = new View(this);
                GradientDrawable dg = new GradientDrawable();
                dg.setShape(GradientDrawable.OVAL);
                dg.setColor(Ui.WARN);
                dot.setBackground(dg);
                android.widget.FrameLayout.LayoutParams dlp = new android.widget.FrameLayout.LayoutParams(dp(8), dp(8),
                        Gravity.TOP | Gravity.END);
                dlp.setMargins(0, dp(4), dp(14), 0);
                pill.addView(dot, dlp);
            }
            item.addView(pill, new LinearLayout.LayoutParams(dp(60), dp(30)));
            TextView label = Ui.text(this, names[i], 12, sel ? Ui.TEXT : Ui.TEXT_2, sel);
            LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT);
            llp.topMargin = dp(3);
            item.addView(label, llp);
            navBar.addView(item, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        }
    }

    /** Boton central de la barra: redondo y elevado (pestana Mando). */
    private View centerNavItem(boolean sel, String name, int icon) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER_HORIZONTAL);
        item.setClipChildren(false);
        item.setClipToPadding(false);
        android.widget.FrameLayout circle = new android.widget.FrameLayout(this);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(sel ? Ui.PRIMARY : Ui.PRIMARY_DARK);
        g.setStroke(dp(4), Ui.BG);   // anillo del color del fondo: parece "recortado" en la barra
        circle.setBackground(new android.graphics.drawable.RippleDrawable(
                android.content.res.ColorStateList.valueOf(0x33FFFFFF), g, null));
        circle.setElevation(dp(6));
        circle.setClickable(true);
        circle.setOnClickListener(v -> selectTab(TAB_PAD));
        circle.addView(Ui.icon(this, icon, Color.WHITE, 28), new android.widget.FrameLayout.LayoutParams(dp(28), dp(28),
                Gravity.CENTER));
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(dp(62), dp(62));
        clp.topMargin = -dp(22);
        item.addView(circle, clp);
        TextView label = Ui.text(this, name, 12, sel ? Ui.TEXT : Ui.TEXT_2, sel);
        LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        llp.topMargin = dp(1);
        item.addView(label, llp);
        return item;
    }

    // ---------------------------------------------------------------- Mando (probador)
    private int padDeviceId = -1;   // mando mostrado en el probador (-1 = el primero)

    private void renderPad() {
        content.addView(pageTitle(L.t("Mando"), L.t("Comprueba que la app recibe tu mando")));
        List<Mapper.Pad> pads = Mapper.pads();
        StringBuilder sig = new StringBuilder();
        for (Mapper.Pad p : pads) sig.append(p.name).append(p.gamepad).append('|');
        padSig = sig.toString();

        // Mando elegido: el ultimo que se uso, o el primero en modo gamepad.
        Mapper.Pad sel = null;
        for (Mapper.Pad p : pads) if (p.id == padDeviceId) sel = p;
        if (sel == null) for (Mapper.Pad p : pads) if (p.gamepad) { sel = p; break; }
        if (sel == null && !pads.isEmpty()) sel = pads.get(0);
        padDeviceId = sel == null ? -1 : sel.id;

        if (pads.size() > 1) {   // selector
            android.widget.HorizontalScrollView hs = new android.widget.HorizontalScrollView(this);
            hs.setHorizontalScrollBarEnabled(false);
            LinearLayout row = new LinearLayout(this);
            row.setPadding(0, 0, 0, dp(10));
            for (final Mapper.Pad p : pads) {
                boolean on = p == sel;
                LinearLayout chip = Ui.button(this, p.gamepad ? R.drawable.ic_gamepad : R.drawable.ic_warning, p.name,
                        on ? Ui.PRIMARY_DARK : Ui.SURFACE, on ? Color.WHITE : Ui.TEXT_2, v -> {
                            padDeviceId = p.id;
                            render();
                        });
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40));
                lp.rightMargin = dp(8);
                row.addView(chip, lp);
            }
            hs.addView(row);
            content.addView(hs);
        }

        InputDevice dev = sel == null ? null : InputDevice.getDevice(sel.id);
        PadTestView.Layout layout = dev != null && sel.gamepad ? PadTestView.Layout.from(dev) : PadTestView.Layout.full();

        // Ficha del mando
        LinearLayout c = card();
        if (sel == null) {
            c.addView(Ui.menuRow(this, R.drawable.ic_gamepad, Ui.TEXT_3, L.t("Ningún mando conectado"),
                    L.t("Conéctalo por Bluetooth o USB en modo gamepad"), null));
        } else if (sel.gamepad) {
            c.addView(Ui.menuRow(this, R.drawable.ic_check, Ui.OK, sel.name, L.t("Modo gamepad · ") + layout.styleName(), null));
            c.addView(capabilityChips(dev, layout));
        } else {
            c.addView(Ui.menuRow(this, R.drawable.ic_warning, Ui.WARN, sel.name, L.t("Está en modo táctil / ratón"), null));
            TextView n = Ui.text(this, L.t("Así funciona como un dedo o un ratón, pero los perfiles necesitan el modo ")
                    + L.t("gamepad. En mandos GamepadPlus / ShanWan: apágalo y enciéndelo con Home + X (vuelve a emparejarlo ")
                    + L.t("si hace falta). Otros mandos: busca el modo \"Android\", \"PC\" o \"X-Input\" en su manual."),
                    12, Ui.TEXT_3, false);
            n.setPadding(dp(62), 0, dp(12), dp(8));
            c.addView(n);
        }
        content.addView(c);

        content.addView(sectionTitle(L.t("Probar botones"), sel != null && sel.gamepad ? null : L.t("vista de ejemplo")));
        LinearLayout t = card();
        t.setPadding(dp(14), dp(16), dp(14), dp(12));
        padTest = new PadTestView(this);
        padTest.setLayout(layout);
        t.addView(padTest, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        padLast = Ui.text(this, L.t("Pulsa cualquier botón o mueve los sticks"), 13, Ui.TEXT_2, false);
        padLast.setGravity(Gravity.CENTER);
        padLast.setPadding(0, dp(12), 0, dp(2));
        t.addView(padLast);
        content.addView(t);
        TextView tip = Ui.text(this, L.t("El dibujo se adapta a tu mando: muestra solo lo que tiene y añade abajo los ")
                + L.t("botones extra (incluso los que se descubran al pulsarlos). Los nombres son los que usa «Detectar ")
                + L.t("botón» en el editor."), 12, Ui.TEXT_3, false);
        tip.setPadding(dp(4), dp(2), dp(4), 0);
        content.addView(tip);
    }

    /** Chips con lo que tiene el mando: botones, sticks, gatillos, bateria, vibracion, sensores. */
    private View capabilityChips(InputDevice dev, PadTestView.Layout L) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(12), 0, dp(12), dp(8));
        List<String> caps = new ArrayList<>();
        caps.add(L.buttons + com.gamepadmapper.app.L.t(" botones"));
        int sticks = (L.leftStick ? 1 : 0) + (L.rightStick ? 1 : 0);
        caps.add(sticks + (sticks == 1 ? com.gamepadmapper.app.L.t(" stick") : com.gamepadmapper.app.L.t(" sticks")));
        if (L.l2Analog || L.r2Analog) caps.add(com.gamepadmapper.app.L.t("Gatillos analógicos"));
        else if (L.l2 || L.r2) caps.add(com.gamepadmapper.app.L.t("Gatillos digitales"));
        if (L.dpad) caps.add(com.gamepadmapper.app.L.t("Cruceta"));
        if (!L.extras.isEmpty()) caps.add(L.extras.size() + com.gamepadmapper.app.L.t(" extra"));
        boolean vib = false;
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                android.hardware.BatteryState bs = dev.getBatteryState();
                if (bs.isPresent() && !Float.isNaN(bs.getCapacity()))
                    caps.add(com.gamepadmapper.app.L.t("Batería ") + Math.round(bs.getCapacity() * 100) + "%"
                            + (bs.getStatus() == android.hardware.BatteryState.STATUS_CHARGING ? " ⚡" : ""));
                vib = dev.getVibratorManager().getVibratorIds().length > 0;
                if (!dev.getSensorManager().getSensorList(android.hardware.Sensor.TYPE_ALL).isEmpty())
                    caps.add(com.gamepadmapper.app.L.t("Sensores de movimiento"));
                if (!dev.getLightsManager().getLights().isEmpty()) caps.add(com.gamepadmapper.app.L.t("Luces"));
            } catch (Exception ignored) {
            }
        } else {
            try {
                //noinspection deprecation
                vib = dev.getVibrator().hasVibrator();
            } catch (Exception ignored) {
            }
        }
        if (vib) caps.add(com.gamepadmapper.app.L.t("Vibración"));
        // Chips en filas (envuelven segun el ancho)
        // Ancho util: pantalla - margenes de la pagina (18+18) - tarjeta (8+8) - caja (12+12)
        int avail = getResources().getDisplayMetrics().widthPixels - dp(36 + 16 + 24 + 4);
        LinearLayout row = null;
        int used = 0;
        for (String s : caps) {
            TextView chip = Ui.chip(this, s, Ui.PRIMARY);
            int w = (int) chip.getPaint().measureText(s) + dp(16 + 8);
            if (row == null || used + w > avail) {
                row = new LinearLayout(this);
                row.setPadding(0, dp(4), 0, 0);
                box.addView(row);
                used = 0;
            }
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.rightMargin = dp(8);
            row.addView(chip, lp);
            used += w;
        }
        if (vib) {
            LinearLayout b = Ui.button(this, R.drawable.ic_play, com.gamepadmapper.app.L.t("Probar vibración"), Ui.SURFACE_2, Ui.TEXT, v -> vibrate(dev));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40));
            lp.topMargin = dp(10);
            box.addView(b, lp);
        }
        return box;
    }

    private void vibrate(InputDevice dev) {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                dev.getVibratorManager().vibrate(android.os.CombinedVibration.createParallel(
                        android.os.VibrationEffect.createOneShot(350, android.os.VibrationEffect.DEFAULT_AMPLITUDE)));
            } else {
                //noinspection deprecation
                dev.getVibrator().vibrate(350);
            }
        } catch (Exception e) {
            Toast.makeText(this, L.t("No se pudo hacer vibrar el mando"), Toast.LENGTH_SHORT).show();
        }
    }
    private static boolean fromPad(int source) {
        return (source & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
                || (source & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        // En la pestana Mando, los botones del mando van al probador (no mueven la pantalla).
        if (padTest != null && fromPad(e.getSource())
                && (e.getAction() == KeyEvent.ACTION_DOWN || e.getAction() == KeyEvent.ACTION_UP)) {
            switchPad(e.getDeviceId());   // cambia el probador y sigue con este evento
            String tk = PadService.keyToken(e.getKeyCode());
            boolean down = e.getAction() == KeyEvent.ACTION_DOWN;
            padTest.key(tk, down);
            if (down && e.getRepeatCount() == 0 && padLast != null) {
                padLast.setText(L.t("Último: ") + Profile.label(tk) + "   ·   " + KeyEvent.keyCodeToString(e.getKeyCode())
                        .replace("KEYCODE_", ""));
                padLast.setTextColor(Ui.TEXT);
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if (padTest != null && fromPad(e.getSource())) {
            switchPad(e.getDeviceId());   // cambia el probador y sigue con este evento
            padTest.motion(e);
            return true;
        }
        return super.dispatchGenericMotionEvent(e);
    }

    /** Si el evento viene de otro mando, el probador pasa a mostrar ese. */
    private boolean switchPad(int deviceId) {
        if (deviceId == padDeviceId || deviceId <= 0) return false;
        for (Mapper.Pad p : Mapper.pads()) {
            if (p.id == deviceId && p.gamepad) {
                padDeviceId = deviceId;
                render();
                return true;
            }
        }
        return false;
    }

    /** Titulo grande de una pestana. */
    private View pageTitle(String title, String sub) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.VERTICAL);
        r.setPadding(dp(4), dp(6), dp(4), dp(14));
        r.addView(Ui.text(this, title, 26, Ui.TEXT, true));
        if (sub != null) r.addView(Ui.text(this, sub, 13, Ui.TEXT_2, false));
        return r;
    }

    // ---------------------------------------------------------------- Inicio
    private void renderHome() {
        content.addView(header());
        View upd = updateCard();
        if (upd != null) content.addView(upd);
        if (Migrate.offer(this)) content.addView(legacyCard());
        if (!setupDone()) content.addView(setupCard());
        content.addView(serviceCard());

        Map<String, List<Profile>> byPkg = profilesByPackage();
        if (byPkg.isEmpty()) {
            content.addView(sectionTitle(L.t("Primeros pasos"), null));
            content.addView(firstStepsCard());
        } else {
            content.addView(sectionTitle(L.t("Jugar"), null));
            content.addView(quickPlayCard(byPkg));
        }
        TextView tip = Ui.text(this, L.t("En partida: SELECT + R1 / L1 cambia de perfil · SELECT + START (1 s) pausa el mando."),
                12, Ui.TEXT_3, false);
        tip.setPadding(dp(4), dp(2), dp(4), 0);
        content.addView(tip);
        content.addView(credit());
    }

    // ---------------------------------------------------------------- tutorial de bienvenida
    private Dialog welcome;

    private void maybeShowWelcome() {
        if (welcome == null && !getSharedPreferences(Games.PREFS, MODE_PRIVATE).getBoolean("welcome_done", false))
            showWelcome(0);
    }

    private void showWelcome(final int page) {
        if (welcome != null) welcome.dismiss();
        final Dialog d = new Dialog(this, android.R.style.Theme_DeviceDefault_NoActionBar);
        welcome = d;
        d.setCancelable(false);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        root.setPadding(dp(28), dp(48) + insetTop, dp(28), dp(24) + insetBottom);
        root.setGravity(Gravity.CENTER_HORIZONTAL);

        ImageView art = new ImageView(this);
        if (page == 0) {
            art.setImageDrawable(new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[]{
                    getDrawable(R.drawable.ic_launcher_bg), getDrawable(R.drawable.ic_launcher_fg)}));
            Ui.clipRound(art, dp(70));
        } else {
            art.setImageResource(page == 1 ? R.drawable.ic_check : R.drawable.ic_gamepad);
            art.setColorFilter(Ui.PRIMARY);
            art.setBackground(Ui.round(this, Ui.SURFACE, 70));
            art.setPadding(dp(36), dp(36), dp(36), dp(36));
        }
        root.addView(art, new LinearLayout.LayoutParams(dp(140), dp(140)));

        String[] titles = {L.t("Bienvenido a\nGamepad Mapper Plutón"), L.t("Dale permisos"), L.t("¡A jugar!")};
        TextView title = Ui.text(this, titles[page], 26, Ui.TEXT, true);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(28), 0, dp(12));
        root.addView(title);

        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        if (page == 0) {
            TextView t = Ui.text(this, L.t("Usa tu mando en juegos que solo se controlan tocando la pantalla.\n\n")
                    + L.t("Cada botón del mando toca un punto de la pantalla: tú decides dónde. Funciona sin root y sin ")
                    + L.t("PC, con cualquier mando Bluetooth o USB."), 15, Ui.TEXT_2, false);
            t.setGravity(Gravity.CENTER);
            body.addView(t);
        } else if (page == 1) {
            boolean acc = PadService.isEnabled(this) || RootMode.active();
            body.addView(welcomeRow(L.t("Accesibilidad"), L.t("Leer el mando, tocar la pantalla y mostrar la burbuja"), acc));
            TextView n = Ui.text(this, L.t("Los activas en la pestaña Ajustes (o en la tarjeta de Inicio). La app solo lee ")
                    + L.t("el mando: no ve lo que escribes ni el contenido de otras apps."), 13, Ui.TEXT_3, false);
            n.setGravity(Gravity.CENTER);
            n.setPadding(0, dp(12), 0, 0);
            body.addView(n);
        } else {
            body.addView(welcomeRow(L.t("1. Conecta el mando"), L.t("En modo gamepad. Pruébalo en la pestaña Mando"), true));
            body.addView(welcomeRow(L.t("2. Abre un juego"), L.t("Aparece una burbuja flotante"), true));
            body.addView(welcomeRow(L.t("3. Toca la burbuja"), L.t("Nuevo perfil › «Detectar botones» los coloca solos"), true));
            TextView n = Ui.text(this, L.t("En partida: SELECT + R1 / L1 cambia de perfil y SELECT + START (1 s) pausa el ")
                    + L.t("mando. «Mostrar controles» en la burbuja enseña qué botón toca cada punto."), 13, Ui.TEXT_3, false);
            n.setGravity(Gravity.CENTER);
            n.setPadding(0, dp(12), 0, 0);
            body.addView(n);
        }
        ScrollView sv = new ScrollView(this);
        sv.addView(body);
        root.addView(sv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        // Puntos de pagina
        LinearLayout dots = new LinearLayout(this);
        dots.setGravity(Gravity.CENTER);
        dots.setPadding(0, dp(12), 0, dp(16));
        for (int i = 0; i < 3; i++) {
            View dot = new View(this);
            dot.setBackground(Ui.round(this, i == page ? Ui.PRIMARY : Ui.SURFACE_2, 4));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(i == page ? 22 : 8), dp(8));
            lp.setMargins(dp(4), 0, dp(4), 0);
            dots.addView(dot, lp);
        }
        root.addView(dots);

        LinearLayout btns = new LinearLayout(this);
        LinearLayout skip = Ui.button(this, 0, page < 2 ? L.t("Saltar") : L.t("Atrás"), Ui.SURFACE, Ui.TEXT_2, v -> {
            if (page < 2) finishWelcome();
            else showWelcome(page - 1);
        });
        btns.addView(skip, new LinearLayout.LayoutParams(0, dp(52), 1));
        LinearLayout next = Ui.button(this, 0, page < 2 ? L.t("Siguiente") : L.t("Empezar"), Ui.PRIMARY_DARK, Color.WHITE, v -> {
            if (page < 2) showWelcome(page + 1);
            else finishWelcome();
        });
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(0, dp(52), 1);
        nlp.leftMargin = dp(12);
        btns.addView(next, nlp);
        root.addView(btns);

        // Android 15+ dibuja el dialogo bajo las barras del sistema: respetar sus margenes.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = i.top;
                bottom = i.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(dp(28), dp(48) + top, dp(28), dp(24) + bottom);
            return insets;
        });
        d.setContentView(root);
        if (d.getWindow() != null) {
            d.getWindow().setStatusBarColor(Ui.BG);
            d.getWindow().setNavigationBarColor(Ui.BG);
        }
        d.show();
    }

    private View welcomeRow(String title, String sub, boolean ok) {
        LinearLayout r = Ui.menuRow(this, ok ? R.drawable.ic_check : R.drawable.ic_warning, ok ? Ui.OK : Ui.WARN, title,
                sub, null);
        r.setClickable(false);
        r.setBackground(Ui.round(this, Ui.SURFACE, 16));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(8);
        r.setLayoutParams(lp);
        return r;
    }

    private void finishWelcome() {
        getSharedPreferences(Games.PREFS, MODE_PRIVATE).edit().putBoolean("welcome_done", true).apply();
        if (welcome != null) welcome.dismiss();
        welcome = null;
        render();
    }

    /** Pie con el autor. */
    private View credit() {
        TextView t = Ui.text(this, L.t("Gamepad Mapper Plutón · creado por ") + AUTHOR, 12, Ui.TEXT_3, false);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(28), 0, dp(4));
        return t;
    }

    private View firstStepsCard() {
        LinearLayout c = card();
        c.addView(Ui.menuRow(this, R.drawable.ic_gamepad, Ui.PRIMARY, L.t("1. Conecta el mando"),
                L.t("Por Bluetooth o USB, en modo gamepad"), null));
        c.addView(Ui.menuRow(this, R.drawable.ic_play, Ui.PRIMARY, L.t("2. Elige un juego"),
                L.t("En la pestaña Juegos, o ábrelo directamente"), v -> selectTab(TAB_GAMES)));
        c.addView(Ui.menuRow(this, R.drawable.ic_edit, Ui.PRIMARY, L.t("3. Toca la burbuja en el juego"),
                L.t("Nuevo perfil › «Detectar botones» los coloca solos"), null));
        return c;
    }

    /** Juegos con perfil: tocar abre el juego (el mapeo se activa solo). */
    private View quickPlayCard(Map<String, List<Profile>> byPkg) {
        LinearLayout c = card();
        List<String> pkgs = new ArrayList<>(byPkg.keySet());
        Collections.sort(pkgs, (a, b) -> Games.label(this, a).compareToIgnoreCase(Games.label(this, b)));
        int shown = 0;
        for (final String pkg : pkgs) {
            if (!Games.installed(this, pkg)) continue;
            if (shown++ >= 4) break;
            Profile act = activeOf(pkg, byPkg.get(pkg));
            LinearLayout r = new LinearLayout(this);
            r.setGravity(Gravity.CENTER_VERTICAL);
            r.setPadding(dp(12), dp(8), dp(8), dp(8));
            r.setBackground(Ui.ripple(this, 0x00000000, 12));
            r.setClickable(true);
            r.setOnClickListener(v -> gameSheet(pkg));
            ImageView icon = new ImageView(this);
            icon.setImageDrawable(Games.icon(this, pkg));
            Ui.clipRound(icon, dp(12));
            r.addView(icon, new LinearLayout.LayoutParams(dp(42), dp(42)));
            LinearLayout texts = new LinearLayout(this);
            texts.setOrientation(LinearLayout.VERTICAL);
            texts.setPadding(dp(12), 0, dp(8), 0);
            texts.addView(Ui.oneLine(Ui.text(this, Games.label(this, pkg), 15, Ui.TEXT, true)));
            texts.addView(Ui.oneLine(Ui.text(this, L.t("Perfil: ") + (act == null ? "-" : act.displayName()), 12,
                    Ui.TEXT_2, false)));
            r.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            LinearLayout play = Ui.button(this, R.drawable.ic_play, L.t("Jugar"), Ui.PRIMARY_DARK, Color.WHITE,
                    v -> launch(pkg));
            r.addView(play, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)));
            c.addView(r);
        }
        if (pkgs.size() > 4 || shown == 0) {
            c.addView(Ui.menuRow(this, R.drawable.ic_gamepad, Ui.TEXT_2, L.t("Ver todos los juegos"), null,
                    v -> selectTab(TAB_GAMES)));
        }
        return c;
    }

    // ---------------------------------------------------------------- Juegos
    private void renderGames() {
        // Juegos: los que tienen perfil + los que Android marca como juego + anadidos a mano.
        Map<String, List<Profile>> byPkg = profilesByPackage();
        List<String> games = new ArrayList<>(byPkg.keySet());
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (ResolveInfo ri : getPackageManager().queryIntentActivities(main, 0)) {
            String pkg = ri.activityInfo.packageName;
            if (!games.contains(pkg) && Games.isGame(this, pkg)) games.add(pkg);
        }
        Collections.sort(games, (a, b) -> {
            int pa = byPkg.containsKey(a) ? 0 : 1, pb = byPkg.containsKey(b) ? 0 : 1;
            return pa != pb ? pa - pb : Games.label(this, a).compareToIgnoreCase(Games.label(this, b));
        });
        int withProfile = 0;
        for (String g : games) if (byPkg.containsKey(g)) withProfile++;
        content.addView(pageTitle(L.t("Juegos"), games.size() + (games.size() == 1 ? L.t(" juego") : L.t(" juegos"))
                + " · " + withProfile + L.t(" con perfil")));
        content.addView(gameGrid(games, byPkg));
        TextView tip = Ui.text(this, L.t("Toca un juego para jugar, editar sus controles o gestionar sus perfiles. ")
                + L.t("¿No sale alguno? Usa «Añadir juego»."), 12, Ui.TEXT_3, false);
        tip.setPadding(dp(4), dp(12), dp(4), 0);
        content.addView(tip);
    }

    // ---------------------------------------------------------------- Perfiles
    private void renderProfiles() {
        Map<String, List<Profile>> byPkg = profilesByPackage();
        int total = 0;
        for (List<Profile> l : byPkg.values()) total += l.size();
        content.addView(pageTitle(L.t("Perfiles"), total + (total == 1 ? L.t(" perfil") : L.t(" perfiles"))));
        content.addView(libraryCard());

        if (total > 0) {
            content.addView(sectionTitle(L.t("Tus perfiles"), null));
            LinearLayout c = card();
            List<String> pkgs = new ArrayList<>(byPkg.keySet());
            Collections.sort(pkgs, (a, b) -> Games.label(this, a).compareToIgnoreCase(Games.label(this, b)));
            for (final String pkg : pkgs) {
                String act = Library.activeFile(pkg);
                List<Profile> list = byPkg.get(pkg);
                Profile active = activeOf(pkg, list);
                for (final Profile p : list) {
                    LinearLayout r = new LinearLayout(this);
                    r.setGravity(Gravity.CENTER_VERTICAL);
                    r.setPadding(dp(12), dp(8), dp(12), dp(8));
                    r.setBackground(Ui.ripple(this, 0x00000000, 12));
                    r.setClickable(true);
                    r.setOnClickListener(v -> gameSheet(pkg));
                    ImageView icon = new ImageView(this);
                    icon.setImageDrawable(Games.icon(this, pkg));
                    Ui.clipRound(icon, dp(10));
                    r.addView(icon, new LinearLayout.LayoutParams(dp(36), dp(36)));
                    LinearLayout texts = new LinearLayout(this);
                    texts.setOrientation(LinearLayout.VERTICAL);
                    texts.setPadding(dp(12), 0, dp(8), 0);
                    texts.addView(Ui.oneLine(Ui.text(this, p.displayName(), 15, Ui.TEXT, true)));
                    texts.addView(Ui.oneLine(Ui.text(this, Games.label(this, pkg) + " · " + p.bindings.size()
                            + L.t(" controles"), 12, Ui.TEXT_2, false)));
                    r.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
                    if (p == active && (list.size() > 1 || !act.isEmpty())) r.addView(Ui.chip(this, L.t("En uso"), Ui.OK));
                    c.addView(r);
                }
            }
            content.addView(c);
        }
    }

    // ---------------------------------------------------------------- Ajustes
    private void renderSettings() {
        content.addView(pageTitle(L.t("Ajustes"), null));

        content.addView(sectionTitle(L.t("Burbuja"), null));
        content.addView(bubbleCard());

        content.addView(sectionTitle(L.t("Permisos"), null));
        content.addView(permissionsCard());

        content.addView(sectionTitle(L.t("Rendimiento"), null));
        if (RootMode.active()) {
            LinearLayout c = card();
            c.addView(Ui.menuRow(this, R.drawable.ic_check, Ui.OK, L.t("Modo root activo"),
                    L.t("El módulo de Magisk está haciendo el mapeo"), null));
            content.addView(c);
        } else {
            content.addView(fastModeCard());
            content.addView(rootCard());
        }

        // Idioma: automatico (el del telefono), espanol o ingles.
        content.addView(sectionTitle(L.t("Idioma"), null));
        LinearLayout lang = card();
        String curLang = L.pref(this);
        String[][] langs = {{"auto", L.t("Automático (idioma del teléfono)")}, {"es", "Español"}, {"en", "English"}};
        for (final String[] lg : langs) {
            boolean on = lg[0].equals(curLang);
            lang.addView(Ui.menuRow(this, on ? R.drawable.ic_check : R.drawable.ic_list, on ? Ui.OK : Ui.TEXT_3, lg[1],
                    null, v -> {
                        L.setPref(this, lg[0]);
                        Toast.makeText(this, L.t("Reinicia la app para aplicar el idioma en la burbuja"),
                                Toast.LENGTH_SHORT).show();
                        render();
                    }));
        }
        content.addView(lang);

        content.addView(sectionTitle(L.t("Diagnóstico"), null));
        LinearLayout d = card();
        d.addView(Ui.menuRow(this, R.drawable.ic_list, Ui.TEXT_2, L.t("Registro del mapeador"),
                L.t("Últimas líneas de mapper.log (modo root)"), v -> showLog()));
        content.addView(d);

        content.addView(sectionTitle(L.t("Acerca de"), null));
        LinearLayout a = card();
        String ver = "1.0";
        try {
            ver = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {
        }
        a.addView(Ui.menuRow(this, R.drawable.ic_info, Ui.PRIMARY, L.t("Gamepad Mapper Plutón"),
                L.t("Versión ") + ver + L.t(" · Mando a toques de pantalla"), null));
        a.addView(Ui.menuRow(this, R.drawable.ic_edit, Ui.PRIMARY, L.t("Creado por ") + AUTHOR,
                L.t("Diseño y desarrollo de la app"), null));
        a.addView(Ui.menuRow(this, R.drawable.ic_info, Ui.PRIMARY, L.t("Guía de uso y ejemplos"),
                L.t("Cómo funciona cada tipo de botón y cómo configurarlo"), v -> Guide.show(this, insetTop, insetBottom)));
        a.addView(Ui.menuRow(this, R.drawable.ic_play, Ui.TEXT_2, L.t("Ver tutorial de bienvenida"), null,
                v -> showWelcome(0)));
        a.addView(Ui.menuRow(this, R.drawable.ic_info, Ui.TEXT_2, L.t("Licencia: PolyForm Noncommercial 1.0.0"),
                L.t("Uso gratuito y código abierto a la vista; prohibido venderla o usarla con fines comerciales"), v -> {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RootMode.REPO_URL + "/blob/main/LICENSE")));
                    } catch (Exception ignored) {
                    }
                }));
        if (RootMode.hasRepo()) {
            a.addView(Ui.menuRow(this, R.drawable.ic_share, Ui.TEXT_2, L.t("Repositorio"), RootMode.REPO_URL, v -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RootMode.REPO_URL)));
                } catch (Exception ignored) {
                }
            }));
        }
        content.addView(a);
        content.addView(credit());
    }

    /** Lista de permisos con su estado; tocar abre el ajuste correspondiente. */
    private View permissionsCard() {
        LinearLayout c = card();
        boolean acc = PadService.isEnabled(this) || RootMode.active();
        boolean a11y = PadService.isEnabled(this);
        c.addView(permRow(L.t("Accesibilidad"), L.t("Leer el mando y tocar la pantalla"), acc,
                v -> Perms.request(this, Perms.ACCESSIBILITY)));
        // Opcionales con la Accesibilidad activa (solo hacen falta en modo root/Shizuku sin ella).
        c.addView(permRow(L.t("Mostrar sobre otras apps"), a11y && !hasOverlay()
                        ? L.t("No hace falta: la burbuja la muestra la Accesibilidad") : L.t("La burbuja y el editor en el juego"),
                hasOverlay() || a11y, v -> Perms.request(this, Perms.OVERLAY)));
        c.addView(permRow(L.t("Acceso de uso"), a11y && !Games.hasUsageAccess(this)
                        ? L.t("No hace falta: la Accesibilidad sabe qué juego está abierto") : L.t("Saber qué juego está abierto"),
                Games.hasUsageAccess(this) || a11y, v -> Perms.request(this, Perms.USAGE)));
        c.addView(permRow(L.t("Batería sin restricciones"), L.t("Que Android no detenga el mapeador para ahorrar batería"),
                batteryUnrestricted(), v -> requestBatteryUnrestricted()));
        c.addView(Ui.divider(this));
        c.addView(Ui.menuRow(this, R.drawable.ic_warning, Ui.TEXT_3, L.t("¿Ajuste restringido?"),
                L.t("Información de la app › ⋮ › Permitir ajustes restringidos"),
                v -> startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getPackageName())))));
        return c;
    }

    /** ¿Exenta del ahorro de bateria? (Xiaomi, Oppo, Samsung... matan servicios en segundo plano) */
    private boolean batteryUnrestricted() {
        android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
        return pm == null || pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    @android.annotation.SuppressLint("BatteryLife")
    private void requestBatteryUnrestricted() {
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception ignored) {
            }
        }
        // Algunas marcas tienen ademas su propio gestor (inicio automatico, ahorro por app).
        String brand = Build.MANUFACTURER.toLowerCase(java.util.Locale.ROOT);
        if (brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco") || brand.contains("oppo")
                || brand.contains("realme") || brand.contains("vivo") || brand.contains("huawei")
                || brand.contains("honor") || brand.contains("samsung")) {
            Toast.makeText(this, L.t("En ") + Build.MANUFACTURER + L.t(" revisa también: Ajustes › Apps › Gamepad Mapper Plutón › ")
                    + L.t("Batería (sin restricciones) e Inicio automático."), Toast.LENGTH_LONG).show();
        }
    }

    private View permRow(String title, String sub, boolean ok, View.OnClickListener l) {
        LinearLayout r = Ui.menuRow(this, ok ? R.drawable.ic_check : R.drawable.ic_warning, ok ? Ui.OK : Ui.WARN,
                title, sub, l);
        if (!ok) r.addView(Ui.chip(this, L.t("Pendiente"), Ui.WARN));
        return r;
    }

    private Map<String, List<Profile>> profilesByPackage() {
        Map<String, List<Profile>> map = new HashMap<>();
        File[] confs = Profile.profilesDir().listFiles((d, n) -> n.endsWith(".conf"));
        if (confs == null) return map;
        Arrays.sort(confs);
        for (File f : confs) {
            try {
                Profile p = Profile.load(f);
                if (p.pkg.isEmpty()) continue;
                List<Profile> l = map.get(p.pkg);
                if (l == null) map.put(p.pkg, l = new ArrayList<>());
                l.add(p);
            } catch (Exception ignored) {
            }
        }
        return map;
    }

    private static Profile activeOf(String pkg, List<Profile> list) {
        if (list == null || list.isEmpty()) return null;
        String act = Library.activeFile(pkg);
        for (Profile p : list) if (p.file.getName().equals(act)) return p;
        return list.get(0);
    }

    private View header() {
        LinearLayout h = new LinearLayout(this);
        h.setGravity(Gravity.CENTER_VERTICAL);
        h.setPadding(0, dp(4), 0, dp(14));
        // Logo: el icono de Pluton (fondo + planeta), recortado en circulo.
        ImageView logo = new ImageView(this);
        logo.setImageDrawable(new android.graphics.drawable.LayerDrawable(new android.graphics.drawable.Drawable[]{
                getDrawable(R.drawable.ic_launcher_bg), getDrawable(R.drawable.ic_launcher_fg)}));
        logo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        Ui.clipRound(logo, dp(26));
        h.addView(logo, new LinearLayout.LayoutParams(dp(52), dp(52)));

        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setPadding(dp(14), 0, 0, 0);
        TextView title = Ui.oneLine(Ui.text(this, "", 22, Ui.TEXT, true));
        android.text.SpannableString name = new android.text.SpannableString(L.t("Gamepad Mapper Plutón"));
        name.setSpan(new android.text.style.ForegroundColorSpan(Ui.PRIMARY), 15, name.length(), 0);
        title.setText(name);
        t.addView(title);
        String[] st = status(Mapper.status());
        LinearLayout sl = new LinearLayout(this);
        sl.setGravity(Gravity.CENTER_VERTICAL);
        View dot = new View(this);
        GradientDrawable dg = new GradientDrawable();
        dg.setShape(GradientDrawable.OVAL);
        dg.setColor(Integer.parseInt(st[1]));
        dot.setBackground(dg);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(dp(8), dp(8));
        dlp.rightMargin = dp(6);
        sl.addView(dot, dlp);
        headerDot = dot;
        headerStatus = Ui.oneLine(Ui.text(this, st[0], 13, Ui.TEXT_2, false));
        sl.addView(headerStatus);
        t.addView(sl);
        h.addView(t, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        return h;
    }

    /** {texto, color} del estado del mapeador (status.txt que escribe gpmapper). */
    private String[] status(Mapper.Status st) {
        if (!hasFiles()) return new String[]{L.t("Falta el acceso a archivos"), String.valueOf(Ui.WARN)};
        if (!st.running && !PadService.isEnabled(this))
            return new String[]{L.t("Mapeador sin activar"), String.valueOf(Ui.DANGER)};
        boolean pad = false;
        for (Mapper.Pad p : Mapper.pads()) pad |= p.gamepad;
        return new String[]{L.t("Mapeador activo · ") + (pad ? L.t("mando conectado") : L.t("sin mando")),
                String.valueOf(pad ? Ui.OK : Ui.WARN)};
    }

    private LinearLayout card() {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setBackground(Ui.round(this, Ui.SURFACE, 20));
        c.setPadding(dp(8), dp(8), dp(8), dp(8));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(12);
        c.setLayoutParams(lp);
        return c;
    }

    private View sectionTitle(String title, String sub) {
        LinearLayout r = new LinearLayout(this);
        r.setGravity(Gravity.BOTTOM);
        r.setPadding(dp(4), dp(12), dp(4), dp(10));
        r.addView(Ui.text(this, title, 19, Ui.TEXT, true));
        if (sub != null) {
            TextView s = Ui.text(this, "  " + sub, 13, Ui.TEXT_3, false);
            r.addView(s);
        }
        return r;
    }

    /** ¿Estan los permisos imprescindibles? (la bateria es recomendable, no obligatoria) */
    private boolean setupDone() {
        return hasFiles() && Perms.granted(this, Perms.ACCESSIBILITY)
                && Perms.canDrawBubble(this) && Perms.canKnowGame(this);
    }

    /** Todos los permisos pendientes, en el orden en que conviene darlos. */
    private View setupCard() {
        LinearLayout c = card();
        TextView t = Ui.text(this, L.t("Termina de configurar"), 16, Ui.TEXT, true);
        t.setPadding(dp(12), dp(6), dp(12), dp(0));
        c.addView(t);
        TextView sub = Ui.text(this, L.t("Toca cada paso. Al activarlo vuelves aquí solo."), 12, Ui.TEXT_3, false);
        sub.setPadding(dp(12), dp(2), dp(12), dp(4));
        c.addView(sub);
        int n = 0;
        // Con la Accesibilidad activa, "Mostrar sobre otras apps" y "Acceso de uso" no hacen falta
        // (la burbuja la dibuja el servicio y el sabe que juego esta abierto).
        if (!Perms.granted(this, Perms.ACCESSIBILITY)) c.addView(Ui.menuRow(this, R.drawable.ic_play, Ui.WARN,
                (++n) + ". " + L.t("Accesibilidad"), L.t("Leer el mando y tocar la pantalla"),
                v -> Perms.request(this, Perms.ACCESSIBILITY)));
        // Solo en modo root/Shizuku sin Accesibilidad: con ella activa (paso 1) no hacen falta.
        boolean ownWindows = !PadService.isEnabled(this) && RootMode.active();
        if (ownWindows && !Perms.canDrawBubble(this)) c.addView(Ui.menuRow(this, R.drawable.ic_gamepad, Ui.WARN, (++n) + ". " + L.t("Mostrar sobre otras apps"),
                L.t("Para la burbuja y el editor sobre el juego"), v -> Perms.request(this, Perms.OVERLAY)));
        if (ownWindows && !Perms.canKnowGame(this)) c.addView(Ui.menuRow(this, R.drawable.ic_info, Ui.WARN, (++n) + ". " + L.t("Acceso de uso"),
                L.t("Para saber qué juego está abierto"), v -> Perms.request(this, Perms.USAGE)));
        if (!batteryUnrestricted()) c.addView(Ui.menuRow(this, R.drawable.ic_settings, Ui.TEXT_3,
                (++n) + ". " + L.t("Batería sin restricciones") + L.t(" (recomendado)"),
                L.t("Que Android no detenga el mapeador para ahorrar batería"), v -> requestBatteryUnrestricted()));
        TextView note = Ui.text(this, L.t("Si Android dice «Ajuste restringido»: Ajustes › Apps › Gamepad Mapper Plutón › ")
                + L.t("menú (⋮) › Permitir ajustes restringidos."), 12, Ui.TEXT_3, false);
        note.setPadding(dp(12), dp(4), dp(12), dp(8));
        c.addView(note);
        return c;
    }

    private View bubbleCard() {
        LinearLayout c = card();
        LinearLayout r = Ui.menuRow(this, R.drawable.ic_gamepad, Ui.PRIMARY, L.t("Burbuja en juegos"),
                L.t("Toca la burbuja dentro del juego para editar y cambiar de perfil"), null);
        r.setClickable(false);
        final Switch sw = new Switch(this);
        sw.setChecked(Games.bubbleEnabled(this));
        sw.setOnCheckedChangeListener((b, on) -> {
            Games.setBubbleEnabled(this, on);
            if (on) startBubbleIfReady();
            else if (!Mapper.needsRotation()) stopService(new Intent(this, OverlayService.class));
        });
        r.addView(sw);
        c.addView(r);
        // Aviso de version nueva (consulta GitHub como mucho una vez al dia).
        c.addView(Ui.divider(this));
        LinearLayout u = Ui.menuRow(this, R.drawable.ic_download, Ui.PRIMARY, L.t("Avisar de versiones nuevas"),
                L.t("Consulta GitHub una vez al día (sin enviar datos tuyos)"), null);
        u.setClickable(false);
        final Switch us = new Switch(this);
        us.setChecked(Updates.enabled(this));
        us.setOnCheckedChangeListener((b, on) -> Updates.setEnabled(this, on));
        u.addView(us);
        c.addView(u);
        return c;
    }

    /** Perfiles de la version anterior (/sdcard/gamepad-mapper): importarlos eligiendo la carpeta. */
    private View legacyCard() {
        LinearLayout c = card();
        c.addView(Ui.menuRow(this, R.drawable.ic_folder, Ui.PRIMARY, L.t("¿Usabas una versión anterior?"),
                L.t("Importa tus perfiles: elige la carpeta «gamepad-mapper» y toca «Usar esta carpeta»."), v -> {
                    try {
                        startActivityForResult(Migrate.pickIntent(), REQ_LEGACY);
                    } catch (Exception e) {
                        Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show();
                    }
                }));
        c.addView(Ui.menuRow(this, R.drawable.ic_close, Ui.TEXT_3, L.t("No tengo perfiles anteriores"), null, v -> {
            Migrate.dismiss(this);
            render();
        }));
        return c;
    }

    /** Tarjeta "Version nueva disponible" (solo si GitHub tiene una mayor que la instalada). */
    private View updateCard() {
        String v = Updates.available(this);
        if (v == null) return null;
        LinearLayout c = card();
        c.addView(Ui.menuRow(this, R.drawable.ic_download, Ui.OK, L.t("Versión nueva disponible: ") + v,
                L.t("Tienes la ") + Updates.current(this) + L.t(". Toca para descargarla."), x -> {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(Updates.releaseUrl(this))));
                    } catch (Exception ignored) {
                    }
                }));
        return c;
    }

    private View gameGrid(List<String> games, Map<String, List<Profile>> byPkg) {
        GridLayout grid = new GridLayout(this);
        float widthDp = getResources().getDisplayMetrics().widthPixels / getResources().getDisplayMetrics().density;
        int cols = Math.max(3, (int) ((widthDp - 36) / 112));
        grid.setColumnCount(cols);
        int tileW = (getResources().getDisplayMetrics().widthPixels - dp(36)) / cols;
        for (String pkg : games) grid.addView(gameTile(pkg, byPkg.get(pkg), tileW));
        grid.addView(addTile(tileW));
        return grid;
    }

    private View gameTile(final String pkg, final List<Profile> list, int w) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        t.setPadding(dp(6), dp(12), dp(6), dp(10));
        t.setBackground(Ui.ripple(this, Ui.SURFACE, 20));
        t.setClickable(true);
        t.setOnClickListener(v -> gameSheet(pkg));
        ImageView icon = new ImageView(this);
        icon.setImageDrawable(Games.icon(this, pkg));
        Ui.clipRound(icon, dp(18));
        t.addView(icon, new LinearLayout.LayoutParams(dp(60), dp(60)));
        TextView name = Ui.oneLine(Ui.text(this, Games.label(this, pkg), 13, Ui.TEXT, true));
        name.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        nlp.topMargin = dp(8);
        t.addView(name, nlp);
        Profile act = activeOf(pkg, list);
        TextView chip = act == null ? Ui.chip(this, L.t("Sin perfil"), Ui.TEXT_3)
                : Ui.chip(this, list.size() > 1 ? act.displayName() + " +" + (list.size() - 1) : act.displayName(), Ui.OK);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.topMargin = dp(6);
        t.addView(chip, clp);
        return tileWrap(t, w);
    }

    private View addTile(int w) {
        LinearLayout t = new LinearLayout(this);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(6), dp(12), dp(6), dp(10));
        t.setBackground(Ui.ripple(this, 0x00000000, 20));
        t.setForeground(Ui.roundStroke(this, 0x00000000, 20, 0x33FFFFFF));
        t.setClickable(true);
        t.setOnClickListener(v -> pickApp());
        LinearLayout circle = new LinearLayout(this);
        circle.setGravity(Gravity.CENTER);
        circle.setBackground(Ui.round(this, Ui.SURFACE_2, 18));
        circle.addView(Ui.icon(this, R.drawable.ic_add, Ui.TEXT_2, 28));
        t.addView(circle, new LinearLayout.LayoutParams(dp(60), dp(60)));
        TextView l = Ui.text(this, L.t("Añadir juego"), 13, Ui.TEXT_2, true);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        nlp.topMargin = dp(8);
        t.addView(l, nlp);
        return tileWrap(t, w);
    }

    private View tileWrap(View tile, int w) {
        GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
        lp.width = w - dp(8);
        lp.height = dp(138);
        lp.setMargins(dp(4), dp(4), dp(4), dp(4));
        tile.setLayoutParams(lp);
        return tile;
    }

    // ------------------------------------------------------------------ panel inferior de un juego
    private void gameSheet(final String pkg) {
        final Dialog d = new Dialog(this);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Ui.SURFACE);
        float r = dp(26);
        bg.setCornerRadii(new float[]{r, r, r, r, 0, 0, 0, 0});
        sheet.setBackground(bg);
        sheet.setPadding(dp(16), dp(10), dp(16), dp(16) + insetBottom);

        View grip = new View(this);
        grip.setBackground(Ui.round(this, 0x44FFFFFF, 3));
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(dp(40), dp(5));
        glp.gravity = Gravity.CENTER_HORIZONTAL;
        glp.bottomMargin = dp(14);
        sheet.addView(grip, glp);

        final List<Profile> list = Library.profilesOf(pkg);
        final Profile act = activeOf(pkg, list);

        LinearLayout head = new LinearLayout(this);
        head.setGravity(Gravity.CENTER_VERTICAL);
        ImageView icon = new ImageView(this);
        icon.setImageDrawable(Games.icon(this, pkg));
        Ui.clipRound(icon, dp(16));
        head.addView(icon, new LinearLayout.LayoutParams(dp(56), dp(56)));
        LinearLayout ht = new LinearLayout(this);
        ht.setOrientation(LinearLayout.VERTICAL);
        ht.setPadding(dp(14), 0, 0, 0);
        ht.addView(Ui.oneLine(Ui.text(this, Games.label(this, pkg), 19, Ui.TEXT, true)));
        ht.addView(Ui.oneLine(Ui.text(this, act == null ? L.t("Sin perfil todavía")
                : L.t("Perfil en uso: ") + act.displayName(), 13, act == null ? Ui.TEXT_3 : Ui.OK, false)));
        head.addView(ht, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        sheet.addView(head);

        LinearLayout actions = new LinearLayout(this);
        actions.setPadding(0, dp(16), 0, dp(6));
        LinearLayout.LayoutParams half = new LinearLayout.LayoutParams(0, dp(48), 1);
        boolean canLaunch = getPackageManager().getLaunchIntentForPackage(pkg) != null;
        if (canLaunch) actions.addView(Ui.button(this, R.drawable.ic_play, L.t("Jugar"), Ui.PRIMARY_DARK, Color.WHITE, v -> {
            d.dismiss();
            launch(pkg);
        }), half);
        if (act != null) {
            View gap = new View(this);
            actions.addView(gap, new LinearLayout.LayoutParams(dp(10), 1));
            actions.addView(Ui.button(this, R.drawable.ic_edit, L.t("Editar controles"), Ui.SURFACE_2, Ui.TEXT, v -> {
                d.dismiss();
                edit(act);
            }), half);
        }
        sheet.addView(actions);

        if (list.isEmpty()) {
            TextView n = Ui.text(this, L.t("Abre el juego y toca la burbuja ▸ Crear perfil para colocar los botones ")
                    + L.t("del mando."), 13, Ui.TEXT_2, false);
            n.setPadding(dp(4), dp(10), dp(4), dp(6));
            sheet.addView(n);
        } else {
            TextView pt = Ui.text(this, L.t("Perfiles"), 15, Ui.TEXT, true);
            pt.setPadding(dp(4), dp(14), 0, dp(4));
            sheet.addView(pt);
            for (final Profile p : list) {
                boolean on = p == act;
                LinearLayout row = Ui.menuRow(this, on ? R.drawable.ic_check : R.drawable.ic_gamepad,
                        on ? Ui.OK : Ui.TEXT_3, p.displayName(),
                        (on ? L.t("En uso · ") : L.t("Toca para usarlo · ")) + p.bindings.size() + L.t(" botones"), v -> {
                            try {
                                Library.setActive(pkg, p.file.getName());
                            } catch (Exception e) {
                                Toast.makeText(this, e.getMessage(), Toast.LENGTH_SHORT).show();
                            }
                            d.dismiss();
                            render();
                            gameSheet(pkg);
                        });
                LinearLayout share = Ui.button(this, R.drawable.ic_share, "", 0x00000000, Ui.TEXT_2, v -> share(p.file, p));
                share.setPadding(0, 0, 0, 0);
                row.addView(share, new LinearLayout.LayoutParams(dp(40), dp(40)));
                LinearLayout qr = Ui.button(this, R.drawable.ic_qr, "", 0x00000000, Ui.TEXT_2, v -> showQr(p));
                qr.setPadding(0, 0, 0, 0);
                row.addView(qr, new LinearLayout.LayoutParams(dp(40), dp(40)));
                LinearLayout exp = Ui.button(this, R.drawable.ic_upload, "", 0x00000000, Ui.TEXT_2, v -> exportOne(p));
                exp.setPadding(0, 0, 0, 0);
                row.addView(exp, new LinearLayout.LayoutParams(dp(40), dp(40)));
                LinearLayout del = Ui.button(this, R.drawable.ic_delete, "", 0x00000000, Ui.DANGER, v ->
                        new AlertDialog.Builder(this).setTitle(L.t("Borrar perfil"))
                                .setMessage(L.t("Borrar \"") + p.displayName() + "\"?")
                                .setPositiveButton(L.t("Borrar"), (x, w) -> {
                                    if (!p.file.delete()) Toast.makeText(this, L.t("No se pudo borrar"), Toast.LENGTH_SHORT).show();
                                    d.dismiss();
                                    render();
                                })
                                .setNegativeButton(L.t("Cancelar"), null).show());
                del.setPadding(0, 0, 0, 0);
                row.addView(del, new LinearLayout.LayoutParams(dp(40), dp(40)));
                sheet.addView(row);
            }
            TextView hint = Ui.text(this, L.t("Para crear otro perfil (otro modo de juego) usa la burbuja dentro del juego."),
                    12, Ui.TEXT_3, false);
            hint.setPadding(dp(4), dp(8), dp(4), 0);
            sheet.addView(hint);
        }

        if (Games.isHidden(this, pkg)) {
            sheet.addView(Ui.menuRow(this, R.drawable.ic_hide, Ui.WARN, L.t("La burbuja está oculta en este juego"),
                    L.t("Toca para volver a mostrarla"), v -> {
                        Games.setHidden(this, pkg, false);
                        d.dismiss();
                        Toast.makeText(this, L.t("Burbuja visible de nuevo"), Toast.LENGTH_SHORT).show();
                    }));
        }

        ScrollView sv = new ScrollView(this);
        sv.addView(sheet);
        d.setContentView(sv);
        Window w = d.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            w.setGravity(Gravity.BOTTOM);
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            w.setWindowAnimations(android.R.style.Animation_InputMethod);
        }
        d.show();
    }

    // ------------------------------------------------------------------ compartir por QR
    /** Texto del perfil sin comentarios ni lineas vacias (QR mas pequeno y facil de leer). */
    private static String compactConf(File f) throws java.io.IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                int h = line.indexOf('#');
                if (h >= 0) line = line.substring(0, h);
                line = line.trim().replaceAll("\\s*=\\s*", "=").replaceAll("\\s+", " ");
                if (!line.isEmpty()) sb.append(line).append('\n');
            }
        }
        return sb.toString();
    }

    private void showQr(Profile p) {
        String text;
        try {
            text = compactConf(p.file);
        } catch (Exception e) {
            Toast.makeText(this, L.t("No se pudo leer el perfil"), Toast.LENGTH_SHORT).show();
            return;
        }
        QrCode q = QrCode.encode(text, QrCode.ECC_M);
        if (q == null || q.version > 30) q = QrCode.encode(text, QrCode.ECC_L);   // perfiles grandes: menos redundancia
        if (q == null) {
            Toast.makeText(this, L.t("El perfil es demasiado grande para un QR: usa Compartir"), Toast.LENGTH_LONG).show();
            return;
        }
        int px = getResources().getDisplayMetrics().widthPixels - dp(80);
        ImageView iv = new ImageView(this);
        iv.setImageBitmap(q.toBitmap(Math.max(2, px / (q.size + 8))));
        iv.setAdjustViewBounds(true);
        iv.setBackgroundColor(Color.WHITE);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        box.addView(iv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView t = Ui.text(this, L.t("En el otro móvil: escanéalo con la cámara o Google Lens, copia o comparte el ")
                + L.t("texto y elige Gamepad Mapper Plutón para instalarlo."), 13, 0xFFDDDDDD, false);
        t.setPadding(0, dp(12), 0, 0);
        box.addView(t);
        // Pantalla al maximo brillo mientras se muestra (se lee mejor)
        final android.view.WindowManager.LayoutParams wl = getWindow().getAttributes();
        final float oldB = wl.screenBrightness;
        wl.screenBrightness = 1f;
        getWindow().setAttributes(wl);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(L.t("QR de ") + p.displayName())
                .setView(box)
                .setPositiveButton(L.t("Cerrar"), null)
                .setOnDismissListener(x -> {
                    wl.screenBrightness = oldB;
                    getWindow().setAttributes(wl);
                })
                .show();
    }

    private void launch(String pkg) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch != null) startActivity(launch);
    }

    /** Abre el juego y el editor de su perfil encima. */
    private void edit(Profile p) {
        if (!hasOverlay()) {
            Toast.makeText(this, L.t("Primero concede 'Mostrar sobre otras apps'"), Toast.LENGTH_LONG).show();
            return;
        }
        startForegroundService(new Intent(this, OverlayService.class)
                .putExtra(OverlayService.EXTRA_PROFILE, p.file.getAbsolutePath()));
        launch(p.pkg);
    }

    /** Anadir a la lista una app que Android no marca como juego. */
    private void pickApp() {
        final PackageManager pm = getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        final List<String[]> items = new ArrayList<>();  // {etiqueta, paquete}
        for (ResolveInfo ri : pm.queryIntentActivities(main, 0)) {
            String pkg = ri.activityInfo.packageName;
            if (pkg.equals(getPackageName()) || Games.isGame(this, pkg)) continue;
            items.add(new String[]{ri.loadLabel(pm).toString(), pkg});
        }
        Collections.sort(items, (a, b) -> a[0].compareToIgnoreCase(b[0]));
        String[] labels = new String[items.size()];
        for (int i = 0; i < labels.length; i++) labels[i] = items.get(i)[0];
        new AlertDialog.Builder(this)
                .setTitle(L.t("Añadir juego"))
                .setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, labels), (d, which) -> {
                    Games.addExtra(this, items.get(which)[1]);
                    Toast.makeText(this, L.t("Añadido. Abre el juego y toca la burbuja para crear su perfil."),
                            Toast.LENGTH_LONG).show();
                    render();
                })
                .setNegativeButton(L.t("Cancelar"), null)
                .show();
    }

    // ------------------------------------------------------------------ biblioteca
    /** Fuente elegida, o por defecto: el catalogo del repositorio (si hay) o el incluido en la app. */
    private String catalogUrl() {
        String u = getSharedPreferences(Games.PREFS, MODE_PRIVATE).getString(KEY_CATALOG, "");
        return u.isEmpty() ? Library.defaultCatalog() : u;
    }

    private View libraryCard() {
        LinearLayout c = card();
        c.addView(Ui.menuRow(this, R.drawable.ic_download, Ui.PRIMARY, L.t("Descargar perfiles"),
                L.t("Perfiles listos para tus juegos"), v -> openCatalog()));
        c.addView(Ui.menuRow(this, R.drawable.ic_add, Ui.PRIMARY, L.t("Importar"),
                L.t("Un perfil .conf o una copia .zip"), v -> importFile()));
        c.addView(Ui.menuRow(this, R.drawable.ic_upload, Ui.PRIMARY, L.t("Exportar todos"),
                L.t("Copia de seguridad .zip de todos tus perfiles"), v -> exportAll()));
        String url = catalogUrl();
        c.addView(Ui.menuRow(this, R.drawable.ic_list, Ui.TEXT_3, L.t("Fuente del catálogo"),
                Library.sourceName(url), v -> editCatalogUrl(null)));
        return c;
    }

    private void editCatalogUrl(Runnable then) {
        final EditText in = new EditText(this);
        in.setSingleLine(true);
        String cur = getSharedPreferences(Games.PREFS, MODE_PRIVATE).getString(KEY_CATALOG, "");
        in.setText(cur);
        in.setHint("https://raw.githubusercontent.com/Hades0413/GamePadMapperPluton/main/presets/index.json");
        in.setTextSize(13);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(8), dp(20), 0);
        box.addView(Ui.text(this, L.t("Dirección del archivo index.json del catálogo (http, https o file). Déjalo ")
                + L.t("vacío para usar el catálogo por defecto (") + Library.sourceName(Library.defaultCatalog()) + ").", 13,
                0xFFDDDDDD, false));
        box.addView(in);
        new AlertDialog.Builder(this)
                .setTitle(L.t("Fuente del catálogo"))
                .setView(box)
                .setPositiveButton(L.t("Guardar"), (d, w) -> {
                    getSharedPreferences(Games.PREFS, MODE_PRIVATE).edit()
                            .putString(KEY_CATALOG, in.getText().toString().trim()).apply();
                    render();
                    if (then != null && !catalogUrl().isEmpty()) then.run();
                })
                .setNeutralButton(L.t("Por defecto"), (d, w) -> {
                    getSharedPreferences(Games.PREFS, MODE_PRIVATE).edit().remove(KEY_CATALOG).apply();
                    render();
                })
                .setNegativeButton(L.t("Cancelar"), null)
                .show();
    }

    private void openCatalog() {
        final String url = catalogUrl();
        if (url.isEmpty()) {
            Toast.makeText(this, L.t("Primero indica la direccion del catálogo"), Toast.LENGTH_SHORT).show();
            editCatalogUrl(this::openCatalog);
            return;
        }
        final AlertDialog wait = new AlertDialog.Builder(this).setMessage(L.t("Cargando catálogo...")).show();
        new Thread(() -> {
            try {
                List<Library.Entry> list = Library.parseIndex(Library.fetch(url));
                runOnUiThread(() -> {
                    wait.dismiss();
                    showCatalog(url, list);
                });
            } catch (Exception e) {
                runOnUiThread(() -> {
                    wait.dismiss();
                    new AlertDialog.Builder(this).setTitle(L.t("No se pudo cargar el catálogo"))
                            .setMessage(e.getMessage()).setPositiveButton("OK", null).show();
                });
            }
        }).start();
    }

    private void showCatalog(final String url, List<Library.Entry> all) {
        if (all.isEmpty()) {
            Toast.makeText(this, L.t("El catálogo esta vacío"), Toast.LENGTH_SHORT).show();
            return;
        }
        final List<Library.Entry> list = new ArrayList<>(all);
        Collections.sort(list, (a, b) -> {
            int ia = Games.installed(this, a.pkg) ? 0 : 1, ib = Games.installed(this, b.pkg) ? 0 : 1;
            return ia != ib ? ia - ib : a.name.compareToIgnoreCase(b.name);
        });
        String[] labels = new String[list.size()];
        for (int i = 0; i < labels.length; i++) {
            Library.Entry e = list.get(i);
            StringBuilder s = new StringBuilder(e.name);
            if (Games.installed(this, e.pkg)) s.append(L.t("   ✓ instalado"));
            if (Library.targetFile(e.pkg).exists()) s.append(L.t("   (ya tienes perfil)"));
            if (!e.description.isEmpty()) s.append("\n").append(e.description);
            if (!e.author.isEmpty()) s.append(L.t("\npor ")).append(e.author);
            labels[i] = s.toString();
        }
        new AlertDialog.Builder(this)
                .setTitle(L.t("Catálogo de perfiles"))
                .setItems(labels, (d, which) -> downloadPreset(url, list.get(which)))
                .setNegativeButton(L.t("Cerrar"), null)
                .show();
    }

    private void downloadPreset(String indexUrl, Library.Entry e) {
        new Thread(() -> {
            try {
                String conf = Library.fetch(Library.resolve(indexUrl, e.file));
                // El perfil descargado tiene que ser del juego que dice el catalogo.
                if (!Library.validate(conf).equals(e.pkg)) throw new java.io.IOException(L.t("El perfil no es del juego indicado"));
                runOnUiThread(() -> installWithConfirm(conf, e.name));
            } catch (Exception ex) {
                runOnUiThread(() -> Toast.makeText(this, L.t("Error al descargar: ") + ex.getMessage(),
                        Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    /** Instala un perfil (texto); si el juego ya tiene, pregunta si reemplazar o anadir como otro. */
    private void installWithConfirm(final String conf, String name) {
        final String pkg;
        try {
            pkg = Library.validate(conf);
        } catch (Exception e) {
            Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show();
            return;
        }
        // Siempre se pregunta, mostrando que app va a controlar el perfil: un perfil compartido por
        // otra app o por un enlace no se instala nunca sin que el usuario lo vea.
        String label = appLabel(pkg);
        String who = (label != null ? label + "\n" : "") + pkg
                + (label == null ? "\n" + L.t("(esa app no está instalada en este teléfono)") : "");
        Runnable doInstall = () -> {
            try {
                Library.install(conf);
                Toast.makeText(this, L.t("Perfil instalado: ") + name, Toast.LENGTH_SHORT).show();
                render();
            } catch (Exception e) {
                Toast.makeText(this, L.t("No se pudo guardar: ") + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        };
        if (Library.targetFile(pkg).exists()) {
            new AlertDialog.Builder(this).setTitle(L.t("Ya tienes perfil para este juego"))
                    .setMessage(L.t("Origen: ") + name + "\n" + L.t("Controlará: ") + who + "\n\n"
                            + L.t("Reemplazar tu perfil activo, o guardarlo como otro perfil del mismo juego?"))
                    .setPositiveButton(L.t("Reemplazar"), (d, w) -> doInstall.run())
                    .setNeutralButton(L.t("Añadir como otro"), (d, w) -> {
                        try {
                            Library.install(conf, Library.newFile(pkg));
                            Toast.makeText(this, L.t("Añadido como otro perfil: ") + name, Toast.LENGTH_SHORT).show();
                        } catch (Exception e) {
                            Toast.makeText(this, L.t("No se pudo guardar: ") + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                        render();
                    })
                    .setNegativeButton(L.t("Cancelar"), null).show();
        } else {
            new AlertDialog.Builder(this).setTitle(L.t("¿Instalar este perfil?"))
                    .setMessage(L.t("Origen: ") + name + "\n" + L.t("Controlará: ") + who + "\n\n"
                            + L.t("Instálalo solo si confías en quien te lo envió: el mando tocará la pantalla de esa app."))
                    .setPositiveButton(L.t("Instalar"), (d, w) -> doInstall.run())
                    .setNegativeButton(L.t("Cancelar"), null).show();
        }
    }

    /** Nombre visible de una app instalada, o null si no esta instalada (o no es visible). */
    private String appLabel(String pkg) {
        try {
            return getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return null;
        }
    }

    private void importFile() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        try {
            startActivityForResult(i, REQ_IMPORT);
        } catch (Exception e) {
            Toast.makeText(this, L.t("No hay selector de archivos disponible"), Toast.LENGTH_SHORT).show();
        }
    }

    // ------------------------------------------------------------------ exportar
    private void exportAll() {
        File[] confs = Profile.profilesDir().listFiles((d, n) -> n.endsWith(".conf"));
        if (confs == null || confs.length == 0) {
            Toast.makeText(this, L.t("Todavía no tienes perfiles"), Toast.LENGTH_SHORT).show();
            return;
        }
        String date = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT).format(new java.util.Date());
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/zip").putExtra(Intent.EXTRA_TITLE, "gamepad-mapper-perfiles-" + date + ".zip");
        try {
            startActivityForResult(i, REQ_EXPORT_ALL);
        } catch (Exception e) {
            Toast.makeText(this, L.t("No hay selector de archivos disponible"), Toast.LENGTH_SHORT).show();
        }
    }

    private void exportOne(Profile p) {
        pendingExport = p.file;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType("application/octet-stream").putExtra(Intent.EXTRA_TITLE, p.file.getName());
        try {
            startActivityForResult(i, REQ_EXPORT_ONE);
        } catch (Exception e) {
            Toast.makeText(this, L.t("No hay selector de archivos disponible"), Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        if (requestCode == REQ_MODULE) {
            try (java.io.OutputStream os = getContentResolver().openOutputStream(uri)) {
                RootMode.writeModule(this, os);
                Toast.makeText(this, L.t("Módulo guardado"), Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, L.t("No se pudo guardar: ") + e.getMessage(), Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (requestCode == REQ_LEGACY) {
            try {
                int n = Migrate.importTree(this, uri);
                Toast.makeText(this, n > 0 ? L.t("Importados ") + n + L.t(" perfiles") : L.t("No hay perfiles (.conf) en esa carpeta"),
                        Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, L.t("No se pudo importar: ") + e.getMessage(), Toast.LENGTH_LONG).show();
            }
            render();
            return;
        }
        if (requestCode == REQ_EXPORT_ALL) {
            try (java.io.OutputStream os = getContentResolver().openOutputStream(uri)) {
                int n = Library.exportZip(os);
                Toast.makeText(this, L.t("Exportados ") + n + L.t(" perfiles"), Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, L.t("No se pudo exportar: ") + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        } else if (requestCode == REQ_EXPORT_ONE && pendingExport != null) {
            try (java.io.OutputStream os = getContentResolver().openOutputStream(uri);
                 FileInputStream in = new FileInputStream(pendingExport)) {
                if (os == null) throw new java.io.IOException(L.t("No se pudo crear el archivo"));
                os.write(Library.readBytes(in, 1 << 20));
                Toast.makeText(this, L.t("Perfil exportado"), Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, L.t("No se pudo exportar: ") + e.getMessage(), Toast.LENGTH_LONG).show();
            }
            pendingExport = null;
        } else if (requestCode == REQ_IMPORT) {
            try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
                if (in == null) throw new java.io.IOException(L.t("No se pudo abrir el archivo"));
                byte[] bytes = Library.readBytes(in, 8 << 20);
                if (bytes.length > 1 && bytes[0] == 'P' && bytes[1] == 'K') importZip(bytes);
                else installWithConfirm(new String(bytes, StandardCharsets.UTF_8), L.t("archivo importado"));
            } catch (Exception e) {
                Toast.makeText(this, L.t("No se pudo importar: ") + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }
    }

    /** Importa una copia .zip: los iguales se saltan; con los distintos pregunta. */
    private void importZip(byte[] zip) throws java.io.IOException {
        final List<Library.ZipProfile> items = Library.readZip(zip);
        if (items.isEmpty()) {
            Toast.makeText(this, L.t("La copia no contiene perfiles válidos"), Toast.LENGTH_LONG).show();
            return;
        }
        int conflicts = 0;
        for (Library.ZipProfile z : items) {
            File dst = new File(Profile.profilesDir(), z.fileName);
            if (dst.exists() && !Library.sameContent(dst, z.conf)) conflicts++;
        }
        if (conflicts == 0) {
            applyZip(items, true);
            return;
        }
        new AlertDialog.Builder(this).setTitle(L.t("Importar copia"))
                .setMessage(items.size() + L.t(" perfiles en la copia. ") + conflicts
                        + L.t(" ya existen con otro contenido. ¿Qué hago con esos?"))
                .setPositiveButton(L.t("Reemplazar"), (d, w) -> applyZip(items, true))
                .setNeutralButton(L.t("Conservar ambos"), (d, w) -> applyZip(items, false))
                .setNegativeButton(L.t("Cancelar"), null).show();
    }

    private void applyZip(List<Library.ZipProfile> items, boolean replace) {
        int added = 0, replaced = 0, same = 0, failed = 0;
        for (Library.ZipProfile z : items) {
            File dst = new File(Profile.profilesDir(), z.fileName);
            try {
                if (!dst.exists()) {
                    Library.install(z.conf, dst);
                    added++;
                } else if (Library.sameContent(dst, z.conf)) {
                    same++;
                } else if (replace) {
                    Library.install(z.conf, dst);
                    replaced++;
                } else {
                    Library.install(z.conf, Library.newFile(z.pkg));
                    added++;
                }
            } catch (Exception e) {
                failed++;
            }
        }
        StringBuilder s = new StringBuilder(L.t("Importados: ")).append(added).append(L.t(" nuevos"));
        if (replaced > 0) s.append(", ").append(replaced).append(L.t(" reemplazados"));
        if (same > 0) s.append(", ").append(same).append(L.t(" ya estaban"));
        if (failed > 0) s.append(", ").append(failed).append(L.t(" con error"));
        Toast.makeText(this, s.toString(), Toast.LENGTH_LONG).show();
        render();
    }

    /** Perfil recibido con L.t("Compartir") desde otra app. */
    private void handleShared(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        setIntent(new Intent(this, MainActivity.class));  // procesarlo solo una vez
        if (text == null) return;
        if (!hasFiles()) {
            Toast.makeText(this, L.t("Concede primero el acceso a archivos y vuelve a compartir"), Toast.LENGTH_LONG).show();
            return;
        }
        installWithConfirm(text, L.t("perfil compartido"));
    }

    private void share(File f, Profile p) {
        try (FileInputStream in = new FileInputStream(f)) {
            String conf = Library.readLimited(in);
            Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_SUBJECT, L.t("Perfil Gamepad Mapper Plutón: ") + p.pkg)
                    .putExtra(Intent.EXTRA_TEXT, conf);
            startActivity(Intent.createChooser(send, L.t("Compartir perfil")));
        } catch (Exception e) {
            Toast.makeText(this, L.t("No se pudo compartir: ") + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    // ------------------------------------------------------------------ registro
    private void showLog() {
        File log = new File(Profile.baseDir(), "mapper.log");
        List<String> lines = tail(log, 60);
        TextView t = Ui.text(this, lines.isEmpty() ? L.t("(vacío)") : String.join("\n", lines), 11, Ui.TEXT, false);
        t.setTypeface(android.graphics.Typeface.MONOSPACE);
        t.setTextIsSelectable(true);
        t.setPadding(dp(16), dp(8), dp(16), dp(8));
        ScrollView sv = new ScrollView(this);
        sv.addView(t);
        sv.post(() -> sv.fullScroll(View.FOCUS_DOWN));
        new AlertDialog.Builder(this).setTitle(L.t("Registro del mapeador")).setView(sv)
                .setPositiveButton(L.t("Cerrar"), null).show();
    }

    private static List<String> tail(File f, int n) {
        Deque<String> q = new ArrayDeque<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                q.addLast(line);
                if (q.size() > n) q.removeFirst();
            }
        } catch (Exception ignored) {
        }
        return new ArrayList<>(q);
    }
}
