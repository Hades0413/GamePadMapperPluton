package com.gamepadmapper.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.DisplayMetrics;
import android.view.View;

/**
 * Dibujo de un perfil sobre la pantalla de ESTE telefono (en horizontal): las posiciones se
 * escalan a su resolucion, igual que hace la app al usar el perfil.
 * Morado: botones · Amarillo: capas (mantener otro boton) · Turquesa: joystick, camara y deslizar.
 */
public class ProfilePreviewView extends View {
    private static final int LAYER = 0xFFFBBF24, STICK = 0xFF4DD4C0;

    private final Profile profile;
    private final float screenW, screenH;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), stroke = new Paint(Paint.ANTI_ALIAS_FLAG),
            text = new Paint(Paint.ANTI_ALIAS_FLAG), bg = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rect = new RectF();
    private final android.graphics.Path clip = new android.graphics.Path();
    private final android.graphics.Rect src = new android.graphics.Rect();
    private final Paint dim = new Paint();
    /** Captura del juego (opcional) y si se dibuja. */
    private android.graphics.Bitmap gameBackground;
    private boolean showBackground = true;
    /** Se esta dibujando sobre la captura: botones mas opacos y con borde blanco. */
    private boolean onImage;

    public ProfilePreviewView(Context c, Profile p) {
        super(c);
        DisplayMetrics m = new DisplayMetrics();
        android.view.WindowManager wm = (android.view.WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        //noinspection deprecation
        wm.getDefaultDisplay().getRealMetrics(m);
        screenW = Math.max(m.widthPixels, m.heightPixels);
        screenH = Math.min(m.widthPixels, m.heightPixels);
        p.rescaleTo(screenW, screenH);
        profile = p;
        stroke.setStyle(Paint.Style.STROKE);
        text.setColor(Ui.TEXT);
        text.setTextAlign(Paint.Align.CENTER);
        text.setFakeBoldText(true);
        bg.setColor(0xFF0B0710);
        dim.setColor(0x47000000);
        setContentDescription(L.t("Vista previa del perfil"));
    }

    /** Dibuja los botones sobre una captura del juego (recortada para cubrir la pantalla). */
    public void setGameBackground(android.graphics.Bitmap bitmap) {
        gameBackground = bitmap;
        invalidate();
    }

    public void setShowBackground(boolean show) {
        showBackground = show;
        invalidate();
    }

    @Override
    protected void onMeasure(int wSpec, int hSpec) {
        int w = MeasureSpec.getSize(wSpec);
        setMeasuredDimension(w, Math.round(w * screenH / screenW));
    }

    @Override
    protected void onDraw(Canvas c) {
        float k = getWidth() / screenW, unit = Math.min(getWidth(), getHeight());
        float r = unit * 0.05f;
        rect.set(0, 0, getWidth(), getHeight());
        float corner = Ui.dp(getContext(), 12);
        onImage = gameBackground != null && showBackground;
        if (onImage) {
            // Recorte "cover": la captura llena la pantalla aunque su proporcion sea otra.
            int bw = gameBackground.getWidth(), bh = gameBackground.getHeight();
            float scale = Math.max(getWidth() / (float) bw, getHeight() / (float) bh);
            int sw = Math.round(getWidth() / scale), sh = Math.round(getHeight() / scale);
            src.set((bw - sw) / 2, (bh - sh) / 2, (bw + sw) / 2, (bh + sh) / 2);
            clip.reset();
            clip.addRoundRect(rect, corner, corner, android.graphics.Path.Direction.CW);
            c.save();
            c.clipPath(clip);
            c.drawBitmap(gameBackground, src, rect, null);
            c.drawRect(rect, dim);
            c.restore();
        } else {
            c.drawRoundRect(rect, corner, corner, bg);
        }
        text.setTextSize(unit * 0.036f);
        stroke.setStrokeWidth(Math.max(1.5f, r * 0.09f));

        for (Profile.Binding b : profile.bindings.values()) {
            boolean layer = !Profile.modOf(b.key).isEmpty();
            int color = layer ? LAYER : Ui.PRIMARY;
            float x = b.x * k, y = b.y * k;
            switch (b.type) {
                case Profile.STICK:
                    circle(c, x, y, Math.max(r * 1.2f, b.r * k), STICK, 0x1A);
                    circle(c, x, y, r * 0.9f, STICK, 0x4D);
                    break;
                case Profile.LOOK:
                    stroke.setPathEffect(new DashPathEffect(new float[]{r * 0.3f, r * 0.2f}, 0));
                    circle(c, x, y, r * 1.6f, STICK, 0x1A);
                    stroke.setPathEffect(null);
                    break;
                case Profile.SWIPE:
                    stroke.setColor(STICK);
                    c.drawLine(x, y, b.x2 * k, b.y2 * k, stroke);
                    circle(c, b.x2 * k, b.y2 * k, r * 0.3f, STICK, 0xFF);
                    circle(c, x, y, r, color, 0x40);
                    break;
                case Profile.MACRO:
                    for (int i = 1; i < b.steps.size(); i++) {
                        Profile.Step s = b.steps.get(i);
                        circle(c, s.x * k, s.y * k, r * 0.55f, color, 0x26);
                    }
                    circle(c, x, y, r, color, 0x40);
                    break;
                default:
                    circle(c, x, y, r, color, 0x40);
                    break;
            }
            String label = Profile.label(b.key);
            if (label.length() > 7) label = label.substring(0, 7);
            c.drawText(label, x, y + text.getTextSize() * 0.35f, text);
        }
    }

    private void circle(Canvas c, float x, float y, float r, int color, int alpha) {
        int a = onImage ? Math.min(0xC0, alpha * 3) : alpha;
        fill.setColor((color & 0x00FFFFFF) | (a << 24));
        c.drawCircle(x, y, r, fill);
        stroke.setColor(onImage ? Color.WHITE : color);
        c.drawCircle(x, y, r, stroke);
    }
}
