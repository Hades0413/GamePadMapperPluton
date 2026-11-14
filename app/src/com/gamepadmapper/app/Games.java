package com.gamepadmapper.app;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.drawable.Drawable;
import android.os.Process;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Que apps son juegos, cual esta en primer plano y preferencias por juego. */
public final class Games {
    public static final String PREFS = "gamepad_mapper";
    private static final String KEY_EXTRA = "extra_games", KEY_HIDDEN = "bubble_hidden";
    private static String lastForeground = "";

    private Games() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static boolean bubbleEnabled(Context c) {
        return prefs(c).getBoolean("bubble_enabled", true);
    }

    public static void setBubbleEnabled(Context c, boolean on) {
        prefs(c).edit().putBoolean("bubble_enabled", on).apply();
    }

    private static Set<String> set(Context c, String key) {
        return new HashSet<>(prefs(c).getStringSet(key, new HashSet<>()));
    }

    private static void put(Context c, String key, String pkg, boolean add) {
        Set<String> s = set(c, key);
        if (add) s.add(pkg);
        else s.remove(pkg);
        prefs(c).edit().putStringSet(key, s).apply();
    }

    public static boolean isHidden(Context c, String pkg) {
        return set(c, KEY_HIDDEN).contains(pkg);
    }

    public static void setHidden(Context c, String pkg, boolean hidden) {
        put(c, KEY_HIDDEN, pkg, hidden);
    }

    /** Anade una app que Android no marca como juego. */
    public static void addExtra(Context c, String pkg) {
        put(c, KEY_EXTRA, pkg, true);
    }

    public static void removeExtra(Context c, String pkg) {
        put(c, KEY_EXTRA, pkg, false);
    }

    /** Juego = marcado como juego por Android, anadido a mano o con algun perfil. */
    public static boolean isGame(Context c, String pkg) {
        if (pkg == null || pkg.isEmpty() || pkg.equals(c.getPackageName())) return false;
        if (set(c, KEY_EXTRA).contains(pkg)) return true;
        try {
            ApplicationInfo ai = c.getPackageManager().getApplicationInfo(pkg, 0);
            //noinspection deprecation
            if (ai.category == ApplicationInfo.CATEGORY_GAME || (ai.flags & ApplicationInfo.FLAG_IS_GAME) != 0) {
                return true;
            }
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
        return !Library.profilesOf(pkg).isEmpty();
    }

    /** Juegos instalados (apps con icono en el lanzador que son juegos). */
    public static List<String> installedGames(Context c) {
        List<String> out = new ArrayList<>();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (ResolveInfo ri : c.getPackageManager().queryIntentActivities(main, 0)) {
            String pkg = ri.activityInfo.packageName;
            if (!out.contains(pkg) && isGame(c, pkg)) out.add(pkg);
        }
        return out;
    }

    public static String label(Context c, String pkg) {
        try {
            PackageManager pm = c.getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }

    public static Drawable icon(Context c, String pkg) {
        try {
            return c.getPackageManager().getApplicationIcon(pkg);
        } catch (PackageManager.NameNotFoundException e) {
            return c.getDrawable(android.R.drawable.sym_def_app_icon);
        }
    }

    public static boolean installed(Context c, String pkg) {
        try {
            c.getPackageManager().getApplicationInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    // ---------------------------------------------------------------- primer plano
    public static boolean hasUsageAccess(Context c) {
        AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        // unsafeCheckOpNoThrow existe desde Android 10; antes, checkOpNoThrow (la app se cerraba en Android 8-9).
        int mode = android.os.Build.VERSION.SDK_INT >= 29
                ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
                : legacyCheckOp(ops, c);
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    @SuppressWarnings("deprecation")
    private static int legacyCheckOp(AppOpsManager ops, Context c) {
        return ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
    }

    /** App en primer plano segun las estadisticas de uso (necesita acceso de uso). */
    public static String foreground(Context c) {
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return lastForeground;
        long now = System.currentTimeMillis();
        UsageEvents events = usm.queryEvents(now - 15000, now);
        UsageEvents.Event e = new UsageEvents.Event();
        String last = null;
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED) last = e.getPackageName();
        }
        if (last != null) lastForeground = last;
        return lastForeground;
    }
}
