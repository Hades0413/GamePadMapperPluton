package com.gamepadmapper.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Probador de mando: dibuja el mando conectado y resalta en vivo lo que se pulsa.
 * <p>
 * El dibujo se adapta al mando (Layout.from): estilo segun la marca (Xbox, PlayStation,
 * Nintendo o generico), solo los elementos que el mando tiene (stick derecho, gatillos
 * analogicos, L3/R3, cruceta...) y una fila con los botones extra (C, Z, BUTTON_1..16,
 * palancas...). Un boton desconocido que se pulse se anade a esa fila.
 */
public class PadTestView extends View {
    public static final int GENERIC = 0, XBOX = 1, PLAYSTATION = 2, NINTENDO = 3;

    /** Que tiene el mando y como se llaman sus botones. */
    public static final class Layout {
        public int style = GENERIC;
        public boolean dpad = true, leftStick = true, rightStick = true, rxry = false;
        public boolean l1 = true, r1 = true, l2 = true, r2 = true, l2Analog, r2Analog;
        public boolean l3 = true, r3 = true, select = true, start = true, home = true;
        public final LinkedHashMap<String, String> extras = new LinkedHashMap<>();   // token -> etiqueta
        public int buttons;    // numero de botones detectados

        public String styleName() {
            switch (style) {
                case XBOX: return com.gamepadmapper.app.L.t("Estilo Xbox");
                case PLAYSTATION: return com.gamepadmapper.app.L.t("Estilo PlayStation");
                case NINTENDO: return com.gamepadmapper.app.L.t("Estilo Nintendo");
                default: return com.gamepadmapper.app.L.t("Mando genérico");
            }
        }

        /** Sin informacion: un mando completo generico. */
        public static Layout full() {
            return new Layout();
        }

        public static Layout from(InputDevice d) {
            Layout L = new Layout();
            if (d == null) return L;
            String n = d.getName() == null ? "" : d.getName().toLowerCase(java.util.Locale.ROOT);
            int v = d.getVendorId();
            if (v == 0x045e || n.contains("xbox")) L.style = XBOX;
            else if (v == 0x054c || n.contains("dualsense") || n.contains("dualshock") || n.contains("playstation")
                    || n.equals("wireless controller")) L.style = PLAYSTATION;
            else if (v == 0x057e || n.contains("pro controller") || n.contains("joy-con") || n.contains("nintendo"))
                L.style = NINTENDO;

            int[] core = {KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BUTTON_X,
                    KeyEvent.KEYCODE_BUTTON_Y, KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_R1,
                    KeyEvent.KEYCODE_BUTTON_L2, KeyEvent.KEYCODE_BUTTON_R2, KeyEvent.KEYCODE_BUTTON_THUMBL,
                    KeyEvent.KEYCODE_BUTTON_THUMBR, KeyEvent.KEYCODE_BUTTON_SELECT, KeyEvent.KEYCODE_BUTTON_START,
                    KeyEvent.KEYCODE_BUTTON_MODE, KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_BACK};
            boolean[] h = d.hasKeys(core);
            boolean hat = d.getMotionRange(MotionEvent.AXIS_HAT_X) != null;
            L.leftStick = d.getMotionRange(MotionEvent.AXIS_X) != null;
            L.rxry = d.getMotionRange(MotionEvent.AXIS_RX) != null && d.getMotionRange(MotionEvent.AXIS_RY) != null;
            L.rightStick = L.rxry || (d.getMotionRange(MotionEvent.AXIS_Z) != null
                    && d.getMotionRange(MotionEvent.AXIS_RZ) != null);
            L.l2Analog = d.getMotionRange(MotionEvent.AXIS_LTRIGGER) != null
                    || d.getMotionRange(MotionEvent.AXIS_BRAKE) != null || (L.rxry && d.getMotionRange(MotionEvent.AXIS_Z) != null);
            L.r2Analog = d.getMotionRange(MotionEvent.AXIS_RTRIGGER) != null
                    || d.getMotionRange(MotionEvent.AXIS_GAS) != null || (L.rxry && d.getMotionRange(MotionEvent.AXIS_RZ) != null);
            L.l1 = h[4];
            L.r1 = h[5];
            L.l2 = h[6] || L.l2Analog;
            L.r2 = h[7] || L.r2Analog;
            L.l3 = h[8];
            L.r3 = h[9];
            L.select = h[10] || h[14];
            L.start = h[11];
            L.home = h[12];
            L.dpad = h[13] || hat;
            for (boolean b : h) if (b) L.buttons++;
            // Botones extra
            int[] extra = {KeyEvent.KEYCODE_BUTTON_C, KeyEvent.KEYCODE_BUTTON_Z};
            boolean[] he = d.hasKeys(extra);
            if (he[0]) L.extras.put("C", "C");
            if (he[1]) L.extras.put("Z", "Z");
            int[] numbered = new int[16];
            for (int i = 0; i < 16; i++) numbered[i] = KeyEvent.KEYCODE_BUTTON_1 + i;
            boolean[] hn = d.hasKeys(numbered);
            for (int i = 0; i < 16; i++) if (hn[i]) L.extras.put("KEY_" + numbered[i], "B" + (i + 1));
            L.buttons += L.extras.size();
            return L;
        }
    }

    private Layout L = Layout.full();
    private final Set<String> pressed = new HashSet<>();
    private float lx, ly, rx, ry, lt, rt, hx, hy;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float d;
    private static final int BODY_TOP = 0xFF2A2F3D, BODY_BOT = 0xFF1C2029, IDLE = 0xFF353B4C, ON = Ui.PRIMARY,
            OUTLINE = 0x40FFFFFF, WELL = 0xFF151820;
    private final List<RectF> chipRects = new ArrayList<>();

    public PadTestView(Context c) {
        super(c);
        d = c.getResources().getDisplayMetrics().density;
        stroke.setStyle(Paint.Style.STROKE);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    }

    public void setLayout(Layout l) {
        L = l == null ? Layout.full() : l;
        reset();
        requestLayout();
    }

    public Layout layout() {
        return L;
    }

    /** Devuelve true si el boton no estaba en el dibujo y se ha anadido a la fila de extras. */
    public boolean key(String token, boolean down) {
        boolean added = false;
        if (down && !isDrawn(token) && !L.extras.containsKey(token)) {
            L.extras.put(token, Profile.label(token).replace("KEY_", "K"));
            added = true;
            requestLayout();
        }
        if (down) pressed.add(token);
        else pressed.remove(token);
        invalidate();
        return added;
    }

    private boolean isDrawn(String t) {
        switch (t) {
            case "A": case "B": case "X": case "Y": return true;
            case "L1": return L.l1;
            case "R1": return L.r1;
            case "L2": return L.l2;
            case "R2": return L.r2;
            case "L3": return L.leftStick;
            case "R3": return L.rightStick;
            case "SELECT": return L.select;
            case "START": return L.start;
            case "HOME": return L.home;
            case "DPAD_UP": case "DPAD_DOWN": case "DPAD_LEFT": case "DPAD_RIGHT": return L.dpad;
            default: return false;
        }
    }

    public void motion(MotionEvent e) {
        lx = e.getAxisValue(MotionEvent.AXIS_X);
        ly = e.getAxisValue(MotionEvent.AXIS_Y);
        rx = e.getAxisValue(L.rxry ? MotionEvent.AXIS_RX : MotionEvent.AXIS_Z);
        ry = e.getAxisValue(L.rxry ? MotionEvent.AXIS_RY : MotionEvent.AXIS_RZ);
        lt = Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE));
        rt = Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS));
        if (L.rxry) {   // con RX/RY, Z/RZ suelen ser los gatillos
            lt = Math.max(lt, e.getAxisValue(MotionEvent.AXIS_Z));
            rt = Math.max(rt, e.getAxisValue(MotionEvent.AXIS_RZ));
        }
        hx = e.getAxisValue(MotionEvent.AXIS_HAT_X);
        hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
        invalidate();
    }

    public void reset() {
        pressed.clear();
        lx = ly = rx = ry = lt = rt = hx = hy = 0;
        invalidate();
    }

    // ------------------------------------------------------------------ medidas
    private float bodyH(float W) {
        return W * 0.56f;
    }

    private float chipH() {
        return 30 * d;
    }

    /** Coloca los chips de extras en filas; devuelve el alto que ocupan. */
    private float layoutChips(float W, float top) {
        chipRects.clear();
        if (L.extras.isEmpty()) return 0;
        text.setTextSize(13 * d);
        float x = 0, y = top + 12 * d, gap = 8 * d;
        for (String lbl : L.extras.values()) {
            float w = Math.max(40 * d, text.measureText(lbl) + 24 * d);
            if (x + w > W && x > 0) {
                x = 0;
                y += chipH() + gap;
            }
            chipRects.add(new RectF(x, y, x + w, y + chipH()));
            x += w + gap;
        }
        return y + chipH() - top;
    }

    @Override
    protected void onMeasure(int wSpec, int hSpec) {
        int w = MeasureSpec.getSize(wSpec);
        float h = bodyH(w) + layoutChips(w, bodyH(w)) + 4 * d;
        setMeasuredDimension(w, Math.round(h));
    }

    private boolean on(String t) {
        return pressed.contains(t);
    }

    // ------------------------------------------------------------------ dibujo
    @Override
    protected void onDraw(Canvas c) {
        float W = getWidth(), u = W / 100f, H = bodyH(W);
        // Gatillos (arriba) y bumpers
        if (L.l2) shoulder(c, 7 * u, 0, 26 * u, 7 * u, lbl("L2"), on("L2") || lt > 0.5f, L.l2Analog ? lt : -1);
        if (L.r2) shoulder(c, 67 * u, 0, 26 * u, 7 * u, lbl("R2"), on("R2") || rt > 0.5f, L.r2Analog ? rt : -1);
        if (L.l1) shoulder(c, 9 * u, 8.5f * u, 24 * u, 5.5f * u, lbl("L1"), on("L1"), -1);
        if (L.r1) shoulder(c, 67 * u, 8.5f * u, 24 * u, 5.5f * u, lbl("R1"), on("R1"), -1);

        // Cuerpo con empunaduras
        float top = 15 * u;
        Path body = new Path();
        body.moveTo(20 * u, top);
        body.lineTo(80 * u, top);
        body.cubicTo(93 * u, top, 99 * u, top + 8 * u, 99 * u, top + 18 * u);
        body.cubicTo(99 * u, H - 6 * u, 92 * u, H, 85 * u, H);
        body.cubicTo(78 * u, H, 74 * u, H - 7 * u, 68 * u, H - 13 * u);
        body.lineTo(32 * u, H - 13 * u);
        body.cubicTo(26 * u, H - 7 * u, 22 * u, H, 15 * u, H);
        body.cubicTo(8 * u, H, 1 * u, H - 6 * u, 1 * u, top + 18 * u);
        body.cubicTo(1 * u, top + 8 * u, 7 * u, top, 20 * u, top);
        body.close();
        fill.setShader(new LinearGradient(0, top, 0, H, BODY_TOP, BODY_BOT, Shader.TileMode.CLAMP));
        c.drawPath(body, fill);
        fill.setShader(null);
        stroke.setColor(OUTLINE);
        stroke.setStrokeWidth(1.5f * d);
        c.drawPath(body, stroke);

        float row1 = top + 13 * u, row2 = top + 27 * u;
        // Distribucion: Xbox/Nintendo -> stick izq arriba y cruceta abajo; PlayStation/generico al reves.
        boolean stickHigh = L.style == XBOX || L.style == NINTENDO;
        float leftTopX = 20 * u, leftBotX = 34 * u, rightBotX = 66 * u;
        if (L.dpad) dpad(c, stickHigh ? leftBotX : leftTopX, stickHigh ? row2 : row1, 4.6f * u);
        if (L.leftStick) stick(c, stickHigh ? leftTopX : leftBotX, stickHigh ? row1 : row2, 7.5f * u, lx, ly, on("L3"),
                L.l3 ? "L3" : "L");
        if (L.rightStick) stick(c, rightBotX, row2, 7.5f * u, rx, ry, on("R3"), L.r3 ? "R3" : "R");
        face(c, 80 * u, row1, 5.8f * u, 3.4f * u);
        // Centro
        if (L.select) pill(c, 41 * u, top + 8 * u, lbl("SELECT"), on("SELECT"));
        if (L.start) pill(c, 59 * u, top + 8 * u, lbl("START"), on("START"));
        if (L.home) {
            fill.setColor(on("HOME") ? ON : IDLE);
            c.drawCircle(50 * u, top + 15 * u, 3 * u, fill);
            label(c, lbl("HOME"), 50 * u, top + 15 * u, 2.4f * u, 0xFFF2F4F8);
        }
        // Botones extra
        int i = 0;
        for (Map.Entry<String, String> e : L.extras.entrySet()) {
            if (i >= chipRects.size()) break;
            RectF r = chipRects.get(i++);
            boolean a = on(e.getKey());
            fill.setColor(a ? ON : IDLE);
            c.drawRoundRect(r, r.height() / 2, r.height() / 2, fill);
            label(c, e.getValue(), r.centerX(), r.centerY(), 13 * d, 0xFFF2F4F8);
        }
    }

    /** Etiqueta de un boton segun el estilo del mando. */
    private String lbl(String t) {
        switch (L.style) {
            case XBOX:
                switch (t) {
                    case "L1": return "LB";
                    case "R1": return "RB";
                    case "L2": return "LT";
                    case "R2": return "RT";
                    case "SELECT": return "View";
                    case "START": return "Menu";
                    case "HOME": return "";
                }
                break;
            case PLAYSTATION:
                switch (t) {
                    case "SELECT": return "Share";
                    case "START": return "Options";
                    case "HOME": return "PS";
                }
                break;
            case NINTENDO:
                switch (t) {
                    case "L1": return "L";
                    case "R1": return "R";
                    case "L2": return "ZL";
                    case "R2": return "ZR";
                    case "SELECT": return "−";
                    case "START": return "+";
                    case "HOME": return "⌂";
                }
                break;
        }
        if ("HOME".equals(t)) return "";
        return t;
    }

    private void shoulder(Canvas c, float x, float y, float w, float h, String lbl, boolean active, float analog) {
        RectF r = new RectF(x, y, x + w, y + h);
        fill.setColor(IDLE);
        c.drawRoundRect(r, h / 2, h / 2, fill);
        float a = active ? 1f : analog > 0.02f ? Math.min(1f, analog) : 0;
        if (a > 0) {
            fill.setColor(ON);
            c.save();
            c.clipRect(x, y, x + w * a, y + h);
            c.drawRoundRect(r, h / 2, h / 2, fill);
            c.restore();
        }
        String s = analog >= 0 && analog > 0.02f && !active ? lbl + "  " + Math.round(analog * 100) + "%" : lbl;
        label(c, s, x + w / 2, y + h / 2, h * 0.5f, 0xFFF2F4F8);
    }

    private void dpad(Canvas c, float cx, float cy, float s) {
        boolean up = on("DPAD_UP") || hy < -0.5f, dn = on("DPAD_DOWN") || hy > 0.5f;
        boolean lf = on("DPAD_LEFT") || hx < -0.5f, rt2 = on("DPAD_RIGHT") || hx > 0.5f;
        fill.setColor(WELL);
        c.drawCircle(cx, cy, s * 2.2f, fill);
        float r = s * 0.25f;
        arm(c, cx - s / 2, cy - s * 1.5f, s, s * 1.05f, r, up);
        arm(c, cx - s / 2, cy + s * 0.45f, s, s * 1.05f, r, dn);
        arm(c, cx - s * 1.5f, cy - s / 2, s * 1.05f, s, r, lf);
        arm(c, cx + s * 0.45f, cy - s / 2, s * 1.05f, s, r, rt2);
        fill.setColor(IDLE);
        c.drawRect(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2, fill);
    }

    private void arm(Canvas c, float x, float y, float w, float h, float r, boolean active) {
        fill.setColor(active ? ON : IDLE);
        c.drawRoundRect(new RectF(x, y, x + w, y + h), r, r, fill);
    }

    /** Botones de accion: abajo (A), derecha (B), izquierda (X), arriba (Y) por posicion. */
    private void face(Canvas c, float cx, float cy, float g, float r) {
        fill.setColor(WELL);
        c.drawCircle(cx, cy, g + r * 1.45f, fill);
        String[] tok = {"A", "B", "X", "Y"};
        float[][] pos = {{0, g}, {g, 0}, {-g, 0}, {0, -g}};
        for (int i = 0; i < 4; i++) {
            float x = cx + pos[i][0], y = cy + pos[i][1];
            boolean a = on(tok[i]);
            int col = faceColor(i);
            fill.setColor(a ? col : IDLE);
            c.drawCircle(x, y, r, fill);
            if (!a) {   // aro del color del boton
                stroke.setColor((col & 0x00FFFFFF) | 0xAA000000);
                stroke.setStrokeWidth(1.6f * d);
                c.drawCircle(x, y, r - 0.8f * d, stroke);
            }
            faceSymbol(c, i, x, y, r, a ? 0xFFFFFFFF : col);
        }
    }

    private int faceColor(int i) {
        switch (L.style) {
            case XBOX: return new int[]{0xFF3DBE5B, 0xFFE5484D, 0xFF3D8BF2, 0xFFF2C12E}[i];
            case PLAYSTATION: return new int[]{0xFF7BA7E8, 0xFFE8707A, 0xFFD98AC8, 0xFF5ED1B5}[i];
            default: return 0xFFB8BFD6;
        }
    }

    private void faceSymbol(Canvas c, int i, float x, float y, float r, int col) {
        if (L.style == PLAYSTATION) {
            stroke.setColor(col);
            stroke.setStrokeWidth(1.8f * d);
            float k = r * 0.42f;
            switch (i) {
                case 0: c.drawLine(x - k, y - k, x + k, y + k, stroke); c.drawLine(x - k, y + k, x + k, y - k, stroke); break;
                case 1: c.drawCircle(x, y, k, stroke); break;
                case 2: c.drawRect(x - k, y - k, x + k, y + k, stroke); break;
                default: {
                    Path p = new Path();
                    p.moveTo(x, y - k * 1.1f);
                    p.lineTo(x + k, y + k * 0.7f);
                    p.lineTo(x - k, y + k * 0.7f);
                    p.close();
                    c.drawPath(p, stroke);
                }
            }
            return;
        }
        // Nintendo: la posicion de abajo se llama B, la derecha A, la izquierda Y, la de arriba X.
        String[] names = L.style == NINTENDO ? new String[]{"B", "A", "Y", "X"} : new String[]{"A", "B", "X", "Y"};
        label(c, names[i], x, y, r * 0.95f, col);
    }

    private void pill(Canvas c, float x, float y, String lbl, boolean active) {
        float W = getWidth(), w = 8 * W / 100f, h = 3 * W / 100f;
        fill.setColor(active ? ON : IDLE);
        c.drawRoundRect(new RectF(x - w / 2, y - h / 2, x + w / 2, y + h / 2), h / 2, h / 2, fill);
        label(c, lbl, x, y + h * 1.45f, h * 0.62f, 0xFFA7AEC0);
    }

    private void stick(Canvas c, float x, float y, float r, float vx, float vy, boolean click, String lbl) {
        fill.setColor(WELL);
        c.drawCircle(x, y, r * 1.15f, fill);
        stroke.setColor(OUTLINE);
        stroke.setStrokeWidth(1.5f * d);
        c.drawCircle(x, y, r * 1.15f, stroke);
        boolean moved = Math.hypot(vx, vy) > 0.15f;
        float kx = x + vx * r * 0.6f, ky = y + vy * r * 0.6f;
        if (moved) {   // rastro de la direccion
            stroke.setColor((ON & 0x00FFFFFF) | 0x88000000);
            stroke.setStrokeWidth(3 * d);
            c.drawLine(x, y, kx, ky, stroke);
        }
        fill.setColor(click ? ON : moved ? (ON & 0x00FFFFFF) | 0xCC000000 : IDLE);
        c.drawCircle(kx, ky, r * 0.62f, fill);
        stroke.setColor(0x30FFFFFF);
        stroke.setStrokeWidth(1.2f * d);
        c.drawCircle(kx, ky, r * 0.45f, stroke);
        label(c, lbl, kx, ky, r * 0.32f, 0xFFF2F4F8);
    }

    private void label(Canvas c, String s, float x, float y, float size, int color) {
        if (s == null || s.isEmpty()) return;
        text.setTextSize(size);
        text.setColor(color);
        c.drawText(s, x, y - (text.descent() + text.ascent()) / 2, text);
    }
}
