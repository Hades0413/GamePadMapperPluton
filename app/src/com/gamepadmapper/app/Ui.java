package com.gamepadmapper.app;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Paleta y componentes visuales compartidos por la app y la burbuja. */
public final class Ui {
    // Paleta (tema oscuro)
    public static final int BG = 0xFF0F1115;
    public static final int SURFACE = 0xFF181B22;
    public static final int SURFACE_2 = 0xFF222632;
    public static final int OUTLINE = 0x22FFFFFF;
    public static final int PRIMARY = 0xFF6C7CFF;
    public static final int PRIMARY_DARK = 0xFF3F51B5;
    public static final int OK = 0xFF34C77B;
    public static final int WARN = 0xFFFF9F43;
    public static final int DANGER = 0xFFFF5C6C;
    public static final int TEXT = 0xFFF2F4F8;
    public static final int TEXT_2 = 0xFFA7AEC0;
    public static final int TEXT_3 = 0xFF6F7689;

    private Ui() {
    }

    public static int dp(Context c, float v) {
        return Math.round(v * c.getResources().getDisplayMetrics().density);
    }

    public static GradientDrawable round(Context c, int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(c, radiusDp));
        return g;
    }

    public static GradientDrawable roundStroke(Context c, int color, float radiusDp, int stroke) {
        GradientDrawable g = round(c, color, radiusDp);
        g.setStroke(dp(c, 1), stroke);
        return g;
    }

    /** Fondo con efecto de pulsacion. */
    public static Drawable ripple(Context c, int color, float radiusDp) {
        return new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), round(c, color, radiusDp),
                round(c, Color.WHITE, radiusDp));
    }

    public static TextView text(Context c, String s, float sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return t;
    }

    public static TextView oneLine(TextView t) {
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    public static ImageView icon(Context c, int res, int tint, float sizeDp) {
        ImageView iv = new ImageView(c);
        iv.setImageResource(res);
        iv.setColorFilter(tint);
        iv.setLayoutParams(new LinearLayout.LayoutParams(dp(c, sizeDp), dp(c, sizeDp)));
        return iv;
    }

    /** Recorta una vista con esquinas redondeadas (iconos de juegos). */
    public static void clipRound(View v, final float radiusPx) {
        v.setOutlineProvider(new ViewOutlineProvider() {
            @Override
            public void getOutline(View view, Outline outline) {
                outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), radiusPx);
            }
        });
        v.setClipToOutline(true);
    }

    /** Boton relleno con icono opcional. */
    public static LinearLayout button(Context c, int iconRes, String label, int bg, int fg, View.OnClickListener l) {
        LinearLayout b = new LinearLayout(c);
        b.setOrientation(LinearLayout.HORIZONTAL);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(c, 14), 0, dp(c, 16), 0);
        b.setMinimumHeight(dp(c, 44));
        b.setBackground(ripple(c, bg, 14));
        if (iconRes != 0) {
            ImageView iv = icon(c, iconRes, fg, 20);
            ((LinearLayout.LayoutParams) iv.getLayoutParams()).rightMargin = dp(c, label.isEmpty() ? 0 : 8);
            b.addView(iv);
        }
        if (!label.isEmpty()) b.addView(text(c, label, 14, fg, true));
        b.setClickable(true);
        b.setOnClickListener(l);
        return b;
    }

    /** Fila de menu: icono + titulo + subtitulo opcional. */
    public static LinearLayout menuRow(Context c, int iconRes, int iconTint, String title, String subtitle,
                                       View.OnClickListener l) {
        LinearLayout r = new LinearLayout(c);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(c, 12), dp(c, 10), dp(c, 12), dp(c, 10));
        r.setBackground(ripple(c, 0x00000000, 12));
        r.setClickable(true);
        r.setOnClickListener(l);
        LinearLayout circle = new LinearLayout(c);
        circle.setGravity(Gravity.CENTER);
        circle.setBackground(round(c, (iconTint & 0x00FFFFFF) | 0x26000000, 12));
        circle.addView(icon(c, iconRes, iconTint, 20));
        r.addView(circle, new LinearLayout.LayoutParams(dp(c, 38), dp(c, 38)));
        LinearLayout texts = new LinearLayout(c);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.setPadding(dp(c, 12), 0, 0, 0);
        texts.addView(oneLine(text(c, title, 15, TEXT, true)));
        if (subtitle != null && !subtitle.isEmpty()) texts.addView(oneLine(text(c, subtitle, 12, TEXT_2, false)));
        r.addView(texts, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        return r;
    }

    /** Etiqueta pequena redondeada. */
    public static TextView chip(Context c, String s, int color) {
        TextView t = text(c, s, 11, color, true);
        t.setPadding(dp(c, 8), dp(c, 2), dp(c, 8), dp(c, 3));
        t.setBackground(round(c, (color & 0x00FFFFFF) | 0x26000000, 10));
        oneLine(t);
        return t;
    }

    public static View divider(Context c) {
        View v = new View(c);
        v.setBackgroundColor(OUTLINE);
        v.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1));
        return v;
    }
}
