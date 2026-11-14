package com.gamepadmapper.app;

import android.content.Context;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Idioma de la interfaz. Los textos se escriben en espanol en el codigo y se envuelven con
 * L.t("..."); en ingles se buscan en el diccionario EN (L_en.java). Si falta una entrada se
 * muestra el texto original.
 * <p>
 * Preferencia "lang": "auto" (idioma del telefono: espanol si es es-*, si no ingles), "es" o "en".
 */
public final class L {
    private static Boolean english;   // null = aun sin decidir

    private L() {
    }

    /** Lee la preferencia (llamar al arrancar actividad/servicios). */
    public static void init(Context c) {
        String p = c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE).getString("lang", "auto");
        english = "en".equals(p) || ("auto".equals(p) && !isSpanishLocale());
    }

    private static boolean isSpanishLocale() {
        return "es".equals(Locale.getDefault().getLanguage());
    }

    public static boolean english() {
        if (english == null) english = !isSpanishLocale();
        return english;
    }

    public static String pref(Context c) {
        return c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE).getString("lang", "auto");
    }

    public static void setPref(Context c, String lang) {
        c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE).edit().putString("lang", lang).apply();
        init(c);
    }

    private static Map<String, String> dict;

    public static String t(String es) {
        if (es == null || !english()) return es;
        if (dict == null) {
            dict = new HashMap<>();
            L_en.fill(dict);
        }
        String r = dict.get(es);
        return r != null ? r : es;
    }
}
