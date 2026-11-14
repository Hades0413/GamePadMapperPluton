package com.gamepadmapper.app;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/**
 * Guia de uso (Ajustes > Guia de uso y ejemplos): como se configura un boton y, para cada tipo,
 * que hace, un ejemplo, su linea de perfil y una animacion (boton del mando -> toques).
 */
final class Guide {
    private Guide() {
    }

    /** {demo, nombre, que hace, ejemplo, linea de perfil}. Textos en espanol (L.t traduce). */
    private static final String[][] TYPES = {
            {"tap", "Toque", "Mientras mantienes el botón del mando, el dedo se queda apoyado en ese punto.", "Acelerar, correr, mantener el ataque para apuntar.", "A = tap 1932 960"},
            {"quick", "Toque rápido", "Un toque corto al pulsar, aunque mantengas el botón.", "Saltar, disparar con auto-apuntado, abrir un menú.", "B = quick 2034 686"},
            {"burst", "Ráfaga", "Al pulsar hace varios toques seguidos (tú eliges cuántos y cada cuánto).", "Combo de 3 golpes, recoger objetos rápido, abrir cofres.", "X = burst 1729 790 5 80"},
            {"turbo", "Turbo", "Repite toques sin parar mientras mantienes el botón.", "Disparo automático, machacar un botón.", "R1 = turbo 1800 500 12"},
            {"toggle", "Interruptor", "Una pulsación apoya el dedo y la siguiente lo levanta.", "Agacharse, apuntar fijo, mantener un escudo sin cansarte.", "L1 = toggle 1570 958"},
            {"swipe", "Deslizar", "Arrastra el dedo de un punto a otro en el tiempo que elijas.", "Esquivar, lanzar, cambiar de carril.", "Y = swipe 1800 500 1800 200 150"},
            {"macro", "Macro", "Una secuencia de toques en varios puntos, con sus tiempos.", "Combo de habilidades, una jugada completa con un solo botón.", "R2 = macro 1980 895 0 40; 1705 398 150 40"},
            {"stick", "Joystick + cruceta", "Un círculo sobre el joystick del juego. Lo mueven el stick izquierdo y la cruceta.", "Moverse en cualquier juego con joystick en pantalla.", "LS = stick 344 828 112 dpad"},
            {"look", "Cámara", "El stick arrastra la pantalla para girar la vista.", "Mirar alrededor en juegos de disparos o mundo abierto.", "RS = look 1500 500 14"}
    };

    /** En la app (Ajustes): pantalla completa. */
    static void show(Activity a, int insetTop, int insetBottom) {
        final Dialog d = new Dialog(a, android.R.style.Theme_DeviceDefault_NoActionBar);
        d.setContentView(content(a, insetTop, insetBottom, d::dismiss));
        d.show();
    }

    /** Contenido de la guia (desplazable). Lo usan la app y la burbuja dentro del juego. */
    static View content(Context a, int insetTop, int insetBottom, Runnable onClose) {
        ScrollView sv = new ScrollView(a);
        sv.setBackgroundColor(Ui.BG);
        LinearLayout root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(a, 20), dp(a, 20) + insetTop, dp(a, 20), dp(a, 24) + insetBottom);
        sv.addView(root);

        LinearLayout head = new LinearLayout(a);
        head.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout titles = new LinearLayout(a);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.addView(Ui.text(a, L.t("Guía de uso y ejemplos"), 24, Ui.TEXT, true));
        titles.addView(Ui.text(a, L.t("Cómo funciona cada tipo de botón y cómo configurarlo"), 13, Ui.TEXT_2, false));
        head.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        LinearLayout close = Ui.button(a, R.drawable.ic_close, "", Ui.SURFACE_2, Ui.TEXT, v -> onClose.run());
        head.addView(close);
        root.addView(head);

        // Como se configura
        root.addView(section(a, L.t("Cómo se configura un botón")));
        LinearLayout how = card(a);
        for (String s : new String[]{
                L.t("1. Abre el juego y toca la burbuja GM › Editar controles."),
                L.t("2. Arrastra cada círculo encima del botón del juego."),
                L.t("3. Toca un círculo y elige su tipo (Toque, Ráfaga, Turbo…)."),
                L.t("4. Ajusta sus opciones (cantidad, velocidad…) y pulsa Guardar.")}) {
            TextView t = Ui.text(a, s, 14, Ui.TEXT, false);
            t.setPadding(0, dp(a, 3), 0, dp(a, 3));
            how.addView(t);
        }
        TextView hint = Ui.text(a, L.t("¿Botones nuevos? «+ Botón › Detectar» y pulsa el botón del mando."), 12, Ui.TEXT_3, false);
        hint.setPadding(0, dp(a, 6), 0, 0);
        how.addView(hint);
        root.addView(how);

        // Tipos de boton con su demostracion
        root.addView(section(a, L.t("Tipos de botón")));
        TextView legend = Ui.text(a, L.t("La animación muestra el botón del mando (izquierda) y los toques en la pantalla (derecha)."),
                12, Ui.TEXT_3, false);
        legend.setPadding(dp(a, 4), 0, dp(a, 4), dp(a, 8));
        root.addView(legend);
        for (String[] t : TYPES) {
            LinearLayout c = card(a);
            LinearLayout row = new LinearLayout(a);
            row.setGravity(Gravity.CENTER_VERTICAL);
            int color = OverlayService.typeColor(t[0].equals("burst") ? Profile.BURST : t[0].equals("quick") ? Profile.QUICK
                    : t[0].equals("stick") ? Profile.STICK : t[0].equals("look") ? Profile.LOOK : t[0]);
            row.addView(new Demo(a, t[0], color), new LinearLayout.LayoutParams(dp(a, 120), dp(a, 64)));
            LinearLayout txt = new LinearLayout(a);
            txt.setOrientation(LinearLayout.VERTICAL);
            txt.setPadding(dp(a, 12), 0, 0, 0);
            TextView name = Ui.text(a, L.t(t[1]), 16, color, true);
            txt.addView(name);
            txt.addView(Ui.text(a, L.t(t[2]), 13, Ui.TEXT, false));
            row.addView(txt, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            c.addView(row);
            TextView ex = Ui.text(a, L.t("Ejemplo: ") + L.t(t[3]), 12, Ui.TEXT_2, false);
            ex.setPadding(0, dp(a, 6), 0, 0);
            c.addView(ex);
            TextView line = Ui.text(a, L.t("En el perfil: ") + t[4], 11, Ui.TEXT_3, false);
            line.setTypeface(Typeface.MONOSPACE);
            c.addView(line);
            root.addView(c);
        }

        root.addView(section(a, L.t("Capas (dos acciones en un botón)")));
        root.addView(paragraph(a, L.t("Mientras mantienes un modificador (L1, R1, L2, R2, SELECT, L3 o R3), los botones hacen otra cosa. En el editor: toca el círculo › Capa › elige el modificador. Ejemplo: L2 + A usa una habilidad y A solo, salta.")));
        root.addView(section(a, L.t("Atajos del mando en partida")));
        root.addView(paragraph(a, L.t("SELECT + R1 / L1: perfil siguiente / anterior del juego.\nSELECT + START (1 s): pausar o reanudar el mando (por ejemplo, para escribir en el chat).")));
        root.addView(section(a, L.t("Consejos")));
        root.addView(paragraph(a, L.t("«Mostrar controles» (burbuja) dibuja sobre el juego qué toca cada botón.\n«Detectar botones» busca los controles del juego automáticamente en un perfil nuevo.\nSi el personaje se mueve solo, sube la zona muerta del joystick.\nVarios perfiles por juego: burbuja › Nuevo perfil, y cambia con SELECT + R1 / L1.")));

        return sv;
    }

    private static int dp(Context c, float v) {
        return Ui.dp(c, v);
    }

    private static TextView section(Context c, String s) {
        TextView t = Ui.text(c, s, 18, Ui.TEXT, true);
        t.setPadding(dp(c, 4), dp(c, 22), dp(c, 4), dp(c, 8));
        return t;
    }

    private static LinearLayout card(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setBackground(Ui.round(c, Ui.SURFACE, 16));
        l.setPadding(dp(c, 14), dp(c, 12), dp(c, 14), dp(c, 12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.bottomMargin = dp(c, 8);
        l.setLayoutParams(lp);
        return l;
    }

    private static View paragraph(Context c, String s) {
        LinearLayout k = card(c);
        k.addView(Ui.text(c, s, 14, Ui.TEXT, false));
        return k;
    }

    /**
     * Animacion en bucle: a la izquierda el boton del mando (se ilumina al pulsarlo) y a la derecha
     * la "pantalla" con los toques que produce ese tipo. Solo anima mientras esta visible.
     */
    static final class Demo extends View {
        private final String kind;
        private final int color;
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final long t0 = SystemClock.uptimeMillis();

        Demo(Context c, String kind, int color) {
            super(c);
            this.kind = kind;
            this.color = color;
        }

        private long period() {
            return "toggle".equals(kind) ? 4000 : 2400;
        }

        /** ¿Boton del mando pulsado en el instante t (ms dentro del ciclo)? */
        private boolean pressed(long t) {
            if ("toggle".equals(kind)) return (t >= 300 && t < 600) || (t >= 2300 && t < 2600);
            return t >= 300 && t < 1500;
        }

        @Override
        protected void onDraw(Canvas c) {
            float w = getWidth(), h = getHeight(), d = getResources().getDisplayMetrics().density;
            long t = (SystemClock.uptimeMillis() - t0) % period();
            boolean on = pressed(t);
            // Boton del mando
            float bx = h * 0.42f, by = h / 2, br = h * 0.26f;
            p.setStyle(Paint.Style.FILL);
            p.setColor(on ? color : 0xFF2A2F3A);
            c.drawCircle(bx, by, br, p);
            p.setColor(on ? Color.WHITE : Ui.TEXT_3);
            p.setTextAlign(Paint.Align.CENTER);
            p.setTextSize(br * 0.9f);
            p.setTypeface(Typeface.DEFAULT_BOLD);
            c.drawText("stick".equals(kind) || "look".equals(kind) ? "LS" : "A", bx, by + br * 0.32f, p);
            // Flecha
            p.setColor(Ui.TEXT_3);
            p.setStrokeWidth(2 * d);
            float ax = bx + br + 6 * d, ax2 = h * 1.05f;
            c.drawLine(ax, by, ax2, by, p);
            c.drawLine(ax2, by, ax2 - 4 * d, by - 4 * d, p);
            c.drawLine(ax2, by, ax2 - 4 * d, by + 4 * d, p);
            // Pantalla
            float sx = h * 1.15f, sw = w - sx - 2 * d;
            p.setColor(0xFF12151C);
            c.drawRoundRect(sx, 2 * d, sx + sw, h - 2 * d, 8 * d, 8 * d, p);
            float cx = sx + sw / 2, cy = h / 2, tr = h * 0.13f;
            drawTaps(c, t, on, cx, cy, sx, sw, tr, d);
            postInvalidateOnAnimation();
        }

        private void dot(Canvas c, float x, float y, float r, float alpha) {
            p.setStyle(Paint.Style.FILL);
            p.setColor((Math.round(alpha * 255) << 24) | (color & 0xFFFFFF));
            c.drawCircle(x, y, r, p);
            p.setColor((Math.round(alpha * 160) << 24) | 0xFFFFFF);
            c.drawCircle(x, y, r * 0.35f, p);
        }

        private void drawTaps(Canvas c, long t, boolean on, float cx, float cy, float sx, float sw, float r, float d) {
            switch (kind) {
                case "tap":
                    if (on) dot(c, cx, cy, r, 1f);
                    break;
                case "quick":
                    if (t >= 300 && t < 420) dot(c, cx, cy, r, 1f);
                    break;
                case "burst":
                    for (int i = 0; i < 5; i++) {
                        long s = 300 + i * 160;
                        if (t >= s && t < s + 80) dot(c, cx, cy, r, 1f);
                    }
                    if (t >= 300) {   // contador de toques hechos
                        int n = (int) Math.min(5, (t - 300) / 160 + 1);
                        p.setColor(Ui.TEXT_2);
                        p.setTextSize(10 * d);
                        p.setTextAlign(Paint.Align.RIGHT);
                        c.drawText("x" + n, sx + sw - 5 * d, 14 * d, p);
                    }
                    break;
                case "turbo":
                    if (on && ((t - 300) / 90) % 2 == 0) dot(c, cx, cy, r, 1f);
                    break;
                case "toggle":
                    if (t >= 300 && t < 2300) dot(c, cx, cy, r, 1f);
                    break;
                case "swipe": {
                    if (t >= 300 && t < 700) {
                        float k = (t - 300) / 400f;
                        dot(c, sx + sw * 0.2f + sw * 0.6f * k, cy, r, 1f);
                    }
                    break;
                }
                case "macro": {
                    float[][] pts = {{0.25f, 0.65f}, {0.5f, 0.35f}, {0.75f, 0.65f}};
                    for (int i = 0; i < 3; i++) {
                        long s = 300 + i * 250;
                        if (t >= s && t < s + 150) dot(c, sx + sw * pts[i][0], getHeight() * pts[i][1], r * 0.85f, 1f);
                    }
                    break;
                }
                case "stick": {
                    p.setStyle(Paint.Style.STROKE);
                    p.setStrokeWidth(1.5f * d);
                    p.setColor((color & 0xFFFFFF) | 0x99000000);
                    float rr = getHeight() * 0.3f;
                    c.drawCircle(cx, cy, rr, p);
                    if (on) {
                        double ang = (t - 300) / 1200.0 * Math.PI * 2;
                        dot(c, cx + (float) Math.cos(ang) * rr, cy + (float) Math.sin(ang) * rr, r * 0.8f, 1f);
                    }
                    break;
                }
                case "look":
                    if (on) {
                        float k = (t - 300) / 1200f;
                        dot(c, sx + sw * (0.25f + 0.5f * k), cy, r * 0.8f, 1f);
                    }
                    break;
                default:
                    break;
            }
        }
    }
}
