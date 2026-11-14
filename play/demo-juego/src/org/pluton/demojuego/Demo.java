package org.pluton.demojuego;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;

/**
 * Juego de demostracion para las capturas de la ficha de Google Play: una escena de carreras con
 * controles tactiles en las mismas posiciones que el perfil org.pluton.demojuego.conf (pantalla de
 * referencia 2160x1080). No hace nada mas.
 */
public class Demo extends Activity {
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(new Scene(this));
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        }
    }

    static final class Scene extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        Scene(Context c) {
            super(c);
        }

        @Override
        protected void onDraw(Canvas cv) {
            float w = getWidth(), h = getHeight(), s = w / 2160f;
            // Cielo y sol
            p.setShader(new LinearGradient(0, 0, 0, h * 0.55f, 0xFF1B1446, 0xFFE0705A, Shader.TileMode.CLAMP));
            cv.drawRect(0, 0, w, h, p);
            p.setShader(null);
            p.setColor(0xFFFFC86B);
            cv.drawCircle(w * 0.62f, h * 0.42f, 120 * s, p);
            // Montanas
            Path m = new Path();
            m.moveTo(0, h * 0.55f);
            float[] peaks = {0.08f, 0.38f, 0.2f, 0.5f, 0.33f, 0.33f, 0.47f, 0.48f, 0.6f, 0.36f, 0.75f, 0.5f, 0.88f, 0.34f, 1f, 0.46f};
            for (int i = 0; i < peaks.length; i += 2) m.lineTo(w * peaks[i], h * peaks[i + 1]);
            m.lineTo(w, h * 0.55f);
            m.close();
            p.setColor(0xFF3A2559);
            cv.drawPath(m, p);
            // Suelo y carretera en perspectiva
            p.setColor(0xFF1F3B2E);
            cv.drawRect(0, h * 0.55f, w, h, p);
            Path road = new Path();
            road.moveTo(w * 0.46f, h * 0.55f);
            road.lineTo(w * 0.54f, h * 0.55f);
            road.lineTo(w * 0.86f, h);
            road.lineTo(w * 0.14f, h);
            road.close();
            p.setColor(0xFF2B2B33);
            cv.drawPath(road, p);
            p.setColor(0xFFF2F2F2);
            for (int i = 0; i < 6; i++) {
                float t0 = (float) Math.pow(i / 6f, 1.6), t1 = (float) Math.pow((i + 0.5f) / 6f, 1.6);
                float y0 = h * 0.55f + t0 * h * 0.45f, y1 = h * 0.55f + t1 * h * 0.45f;
                float hw0 = 3 * s + t0 * 14 * s, hw1 = 3 * s + t1 * 14 * s;
                Path d = new Path();
                d.moveTo(w / 2 - hw0, y0);
                d.lineTo(w / 2 + hw0, y0);
                d.lineTo(w / 2 + hw1, y1);
                d.lineTo(w / 2 - hw1, y1);
                d.close();
                cv.drawPath(d, p);
            }
            // Coche
            p.setColor(0xFFE53950);
            cv.drawRoundRect(new RectF(w / 2 - 150 * s, h - 300 * s, w / 2 + 150 * s, h - 150 * s), 40 * s, 40 * s, p);
            p.setColor(0xFF7FD3FF);
            cv.drawRoundRect(new RectF(w / 2 - 95 * s, h - 340 * s, w / 2 + 95 * s, h - 250 * s), 30 * s, 30 * s, p);
            p.setColor(0xFF111111);
            cv.drawRoundRect(new RectF(w / 2 - 170 * s, h - 190 * s, w / 2 - 110 * s, h - 120 * s), 12 * s, 12 * s, p);
            cv.drawRoundRect(new RectF(w / 2 + 110 * s, h - 190 * s, w / 2 + 170 * s, h - 120 * s), 12 * s, 12 * s, p);

            // HUD: velocidad, vuelta, pausa
            p.setColor(0xCC000000);
            cv.drawRoundRect(new RectF(w - 420 * s, 40 * s, w - 60 * s, 170 * s), 30 * s, 30 * s, p);
            p.setColor(0xFFFFFFFF);
            p.setTextSize(64 * s);
            p.setFakeBoldText(true);
            cv.drawText("186 km/h", w - 390 * s, 130 * s, p);
            p.setTextSize(44 * s);
            cv.drawText("VUELTA 2/3", 200 * s, 110 * s, p);
            control(cv, 120, 90, 60, "II", s);

            // Controles tactiles (mismas posiciones que el perfil de demostracion)
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(6 * s);
            p.setColor(0x88FFFFFF);
            cv.drawCircle(440 * s, 800 * s, 160 * s, p);
            p.setStyle(Paint.Style.FILL);
            p.setColor(0x66FFFFFF);
            cv.drawCircle(440 * s, 800 * s, 70 * s, p);
            control(cv, 1890, 860, 110, "GAS", s);
            control(cv, 1660, 940, 80, "FRENO", s);
            control(cv, 2010, 600, 80, "NITRO", s);
            control(cv, 1740, 640, 70, "DERRAPE", s);
            control(cv, 2010, 330, 60, "CAM", s);
        }

        private void control(Canvas cv, float x, float y, float r, String label, float s) {
            p.setStyle(Paint.Style.FILL);
            p.setColor(0x55000000);
            cv.drawCircle(x * s, y * s, r * s, p);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(5 * s);
            p.setColor(0xCCFFFFFF);
            cv.drawCircle(x * s, y * s, r * s, p);
            p.setStyle(Paint.Style.FILL);
            p.setColor(0xFFFFFFFF);
            p.setFakeBoldText(true);
            p.setTextSize(Math.min(40, r * 0.5f) * s);
            float tw = p.measureText(label);
            cv.drawText(label, x * s - tw / 2, y * s + p.getTextSize() * 0.35f, p);
        }
    }
}
