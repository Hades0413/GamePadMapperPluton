package com.gamepadmapper.app;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Locale;

/**
 * Permisos: abrir el ajuste exacto de la app (sin que el usuario tenga que buscarla),
 * guia flotante para la Accesibilidad y vuelta automatica a la app al concederlo.
 *
 * Probado en Xiaomi HyperOS 2 (Android 15): "Acceso de uso" y "Archivos" abren la pagina de
 * la app; "Mostrar sobre otras apps" abre la lista (Android 11+ ignora el paquete); la
 * Accesibilidad no se puede abrir en la app (ACCESSIBILITY_DETAILS_SETTINGS exige un permiso
 * de sistema), por eso la guia flotante.
 */
final class Perms {
    static final int ACCESSIBILITY = 1, FILES = 2, OVERLAY = 3, USAGE = 4;

    private static final Handler H = new Handler(Looper.getMainLooper());
    private static int waiting = 0;          // permiso que se espera (0 = ninguno)
    private static long waitUntil = 0;
    private static Context app;
    private static View guide;

    private Perms() {
    }

    /**
     * La burbuja y el editor se pueden dibujar con "Mostrar sobre otras apps" o, sin ese permiso,
     * desde el servicio de accesibilidad. El juego abierto se sabe por "Acceso de uso" o por la
     * accesibilidad. Esos dos permisos solo hacen falta sin Accesibilidad (modo root/Shizuku).
     */
    static boolean canDrawBubble(Context c) {
        return Settings.canDrawOverlays(c) || PadService.isEnabled(c);
    }

    static boolean canKnowGame(Context c) {
        return Games.hasUsageAccess(c) || PadService.isEnabled(c);
    }

    static boolean granted(Context c, int which) {
        switch (which) {
            case ACCESSIBILITY: return PadService.isEnabled(c) || RootMode.active();
            case FILES: return true;   // los perfiles van en la carpeta propia de la app: sin permiso
            case OVERLAY: return Settings.canDrawOverlays(c);
            case USAGE: return Games.hasUsageAccess(c);
            default: return true;
        }
    }

    /**
     * Pide un permiso. Si Android no deja abrir la pagina exacta de la app (lista de apps,
     * Accesibilidad), antes explica en una tarjeta que hay que tocar.
     */
    static void request(Activity a, int which) {
        String intro = intro(a, which);
        if (intro == null) {
            open(a, which);
            return;
        }
        new android.app.AlertDialog.Builder(a, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(which == OVERLAY ? L.t("Mostrar sobre otras apps") : L.t("Activar el mapeador"))
                .setMessage(intro)
                .setPositiveButton(L.t("Abrir ajustes"), (d, w) -> open(a, which))
                .setNegativeButton(L.t("Cancelar"), null)
                .show();
    }

    private static String intro(Context c, int which) {
        if (which == OVERLAY && Build.VERSION.SDK_INT >= 30) {
            return L.t("Android abrirá la lista de apps (no deja abrir directamente la de esta app).") + "\n\n"
                    + L.t("1. Busca «Gamepad Mapper Plutón» (en la letra G) y tócala.") + "\n"
                    + L.t("2. Activa «Permitir mostrar sobre otras apps».") + "\n\n"
                    + L.t("Volverás aquí automáticamente.");
        }
        if (which == ACCESSIBILITY) {
            return L.t("Android abrirá Accesibilidad. Ahí:") + "\n\n" + accessibilitySteps() + "\n\n"
                    + (Settings.canDrawOverlays(c) ? L.t("Te dejaré estos pasos en pantalla y volverás aquí automáticamente.")
                    : L.t("Al activarlo volverás aquí automáticamente.")) + "\n\n"
                    + L.t("La app solo lee el mando y toca la pantalla donde tú configures. No lee lo que escribes ni el contenido de otras apps.");
        }
        return null;
    }

    /** Abre el ajuste del permiso y vuelve a la app en cuanto se concede. */
    private static void open(Activity a, int which) {
        app = a.getApplicationContext();
        Uri pkg = Uri.parse("package:" + a.getPackageName());
        boolean ok;
        switch (which) {
            case ACCESSIBILITY:
                ok = openAccessibility(a);
                if (ok) showGuide(a);
                break;
            case FILES:
                ok = start(a, new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, pkg))
                        || start(a, new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
                break;
            case OVERLAY:
                ok = start(a, new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg));
                // Android 11+ muestra la lista de apps: decir cual tocar.
                if (ok && Build.VERSION.SDK_INT >= 30) hint(a, L.t("Busca «Gamepad Mapper Plutón» y actívalo"));
                break;
            case USAGE:
                ok = start(a, new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, pkg));
                if (!ok) {
                    ok = start(a, new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
                    if (ok) hint(a, L.t("Busca «Gamepad Mapper Plutón» y actívalo"));
                }
                break;
            default:
                return;
        }
        if (!ok) {
            start(a, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg));
            return;
        }
        waiting = which;
        waitUntil = SystemClock.uptimeMillis() + 5 * 60_000;
        H.removeCallbacks(watch);
        H.postDelayed(watch, 600);
    }

    /** Lista de Accesibilidad con el servicio resaltado (en Pixel/AOSP salta a el). */
    private static boolean openAccessibility(Activity a) {
        String flat = new ComponentName(a, PadService.class).flattenToString();
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        Bundle args = new Bundle();
        args.putString(":settings:fragment_args_key", flat);
        i.putExtra(":settings:fragment_args_key", flat);
        i.putExtra(":settings:show_fragment_args", args);
        return start(a, i);
    }

    private static boolean start(Activity a, Intent i) {
        try {
            a.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static void hint(Context c, String s) {
        H.postDelayed(() -> Toast.makeText(c.getApplicationContext(), s, Toast.LENGTH_LONG).show(), 400);
    }

    /** Comprueba cada medio segundo; al concederse, quita la guia y trae la app al frente. */
    private static final Runnable watch = new Runnable() {
        @Override
        public void run() {
            if (waiting == 0 || app == null) return;
            if (granted(app, waiting)) {
                waiting = 0;
                hideGuide();
                backToApp(app);
                return;
            }
            if (SystemClock.uptimeMillis() > waitUntil) {
                waiting = 0;
                hideGuide();
                return;
            }
            H.postDelayed(this, 500);
        }
    };

    /** Lo llama PadService al conectarse (por si el sondeo no corre). */
    static void onAccessibilityEnabled(Context c) {
        if (waiting != ACCESSIBILITY) return;
        waiting = 0;
        hideGuide();
        backToApp(c);
    }

    private static void backToApp(Context c) {
        try {
            c.startActivity(new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            Toast.makeText(c, L.t("✓ Permiso activado"), Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------------ guia flotante
    /** Nombre del apartado de apps descargadas en Accesibilidad segun la marca. */
    private static String downloadedSection() {
        String b = Build.MANUFACTURER.toLowerCase(Locale.ROOT);
        if (b.contains("xiaomi") || b.contains("redmi") || b.contains("poco")) return L.t("«Apps descargadas»");
        if (b.contains("samsung")) return L.t("«Aplicaciones instaladas»");
        if (b.contains("oppo") || b.contains("realme") || b.contains("oneplus")) return L.t("«Apps descargadas»");
        if (b.contains("motorola") || b.contains("google")) return L.t("«Apps descargadas»");
        return L.t("«Apps descargadas» o «Servicios instalados»");
    }

    static String accessibilitySteps() {
        return L.t("1. Toca ") + downloadedSection() + "\n"
                + L.t("2. Toca «Gamepad Mapper Plutón»") + "\n"
                + L.t("3. Activa el interruptor y toca «Permitir»");
    }

    private static void showGuide(Activity a) {
        hideGuide();
        if (!Settings.canDrawOverlays(a)) {
            // Sin permiso de superposicion: los pasos como aviso largo.
            hint(a, accessibilitySteps());
            return;
        }
        Context c = a.getApplicationContext();
        WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.roundStroke(c, 0xF2181B22, 18, Ui.PRIMARY));
        int p = Ui.dp(c, 14);
        card.setPadding(p, Ui.dp(c, 10), p, Ui.dp(c, 12));
        card.setElevation(Ui.dp(c, 8));

        LinearLayout head = new LinearLayout(c);
        head.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = Ui.text(c, L.t("Activa el mapeador"), 15, Ui.TEXT, true);
        head.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        TextView close = Ui.text(c, "✕", 18, Ui.TEXT_2, true);
        close.setPadding(Ui.dp(c, 12), 0, 0, 0);
        close.setOnClickListener(v -> {
            waiting = 0;
            hideGuide();
        });
        head.addView(close);
        card.addView(head);

        TextView steps = Ui.text(c, accessibilitySteps(), 14, Ui.TEXT, false);
        steps.setLineSpacing(Ui.dp(c, 3), 1f);
        steps.setPadding(0, Ui.dp(c, 6), 0, Ui.dp(c, 4));
        card.addView(steps);
        card.addView(Ui.text(c, L.t("Volverás a la app automáticamente."), 12, Ui.TEXT_3, false));

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.BOTTOM;
        lp.y = Ui.dp(c, 72);   // encima de la barra de navegacion
        LinearLayout wrap = new LinearLayout(c);
        wrap.setPadding(Ui.dp(c, 12), 0, Ui.dp(c, 12), 0);
        wrap.addView(card, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        try {
            wm.addView(wrap, lp);
            guide = wrap;
        } catch (Exception e) {
            hint(a, accessibilitySteps());
        }
    }

    static void hideGuide() {
        if (guide == null) return;
        try {
            ((WindowManager) guide.getContext().getSystemService(Context.WINDOW_SERVICE)).removeView(guide);
        } catch (Exception ignored) {
        }
        guide = null;
    }
}
