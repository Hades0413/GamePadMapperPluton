package com.gamepadmapper.app;

import android.graphics.Bitmap;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Busca los botones tactiles de un juego en varias capturas de pantalla.
 * <p>
 * Idea: mientras se juega, el fondo cambia pero los controles en pantalla no.
 * <ol>
 *   <li>Bordes estables: un borde cuenta solo si aparece en TODAS las capturas (un color
 *       que coincide por casualidad no crea el mismo borde en todas).</li>
 *   <li>Circulos: transformada de Hough siguiendo la direccion del gradiente; cada candidato
 *       se verifica midiendo cuanto de su contorno es borde estable. Asi se separan botones
 *       redondos aunque se toquen entre si.</li>
 *   <li>Manchas: para botones no redondos (rectangulos, iconos), componentes conexas de los
 *       bordes estables que no caen dentro de un circulo ya encontrado.</li>
 *   <li>Clasificacion por posicion: joystick (grande, abajo a la izquierda), accion principal
 *       (el mayor de la derecha), secundarios, otros y menu (franja superior: pausa,
 *       ajustes, marcadores...), que no se usa salvo que el usuario lo incluya.</li>
 * </ol>
 * No sabe que hace cada boton (saltar, atacar...): eso necesitaria reconocer los iconos.
 */
public final class ButtonFinder {
    public static final int JOYSTICK = 0, PRIMARY = 1, SECONDARY = 2, OTHER = 3, MENU = 4, CENTER = 5;

    public static final class Cand {
        public float x, y, r;          // centro y radio en pixeles de pantalla
        public int role;
        public boolean include;
        public boolean round;          // encontrado como circulo
        public float score;            // fraccion del contorno verificada (circulos)
        public String key;             // boton del mando asignado (null = sin asignar)

        public String roleName() {
            switch (role) {
                case JOYSTICK: return L.t("joystick");
                case PRIMARY: return L.t("acción principal");
                case SECONDARY: return L.t("botón de acción");
                case MENU: return L.t("menú / pausa");
                case CENTER: return L.t("¿personaje?");
                default: return L.t("botón");
            }
        }
    }

    private ButtonFinder() {
    }

    /** Solo pruebas (experimental/finder-test): guardar mapas intermedios. */
    static boolean debug = false;
    static boolean[] debugEdge;
    static List<float[]> debugPeaks;

    /** Solo pruebas. */
    static float debugCoverage(int W, int H, float x, float y, float r) {
        return coverage(debugEdge, W, H, x, y, r);
    }

    /** Ancho al que se reducen las capturas antes de analizarlas. */
    public static final int WORK_WIDTH = 400;

    /** Botones del mando que se proponen, en orden, para la asignacion automatica. */
    public static final String[] AUTO_KEYS = {"A", "B", "X", "Y", "R1", "R2", "L1", "L2", "R3", "L3",
            "DPAD_UP", "DPAD_RIGHT", "DPAD_DOWN", "DPAD_LEFT"};

    public static List<Cand> find(List<Bitmap> frames, int screenW, int screenH) {
        if (frames.isEmpty()) return new ArrayList<>();
        int W = frames.get(0).getWidth(), H = frames.get(0).getHeight();
        List<int[]> px = new ArrayList<>();
        for (Bitmap b : frames) {
            if (b.getWidth() != W || b.getHeight() != H) continue;
            int[] p = new int[W * H];
            b.getPixels(p, 0, W, 0, 0, W, H);
            px.add(p);
        }
        return findPixels(px, W, H, screenW, screenH);
    }

    /** Igual que find, con los pixeles ARGB de cada captura (W x H). Sin dependencias de Android. */
    public static List<Cand> findPixels(List<int[]> frames, int W, int H, int screenW, int screenH) {
        List<Cand> out = new ArrayList<>();
        int nf = frames.size();
        if (nf == 0) return out;
        int N = W * H;

        // --- Gris de cada captura, rango (estabilidad del color) y media.
        int[][] gray = new int[nf][N];
        int[] mn = new int[N], mx = new int[N], sum = new int[N];
        java.util.Arrays.fill(mn, 255);
        for (int f = 0; f < nf; f++) {
            int[] px = frames.get(f), g = gray[f];
            for (int i = 0; i < N; i++) {
                int c = px[i];
                int v = (((c >> 16) & 255) * 77 + ((c >> 8) & 255) * 150 + (c & 255) * 29) >> 8;
                g[i] = v;
                if (v < mn[i]) mn[i] = v;
                if (v > mx[i]) mx[i] = v;
                sum[i] += v;
            }
        }
        int[] mean = new int[N];
        int nStable = 0;
        for (int i = 0; i < N; i++) {
            mean[i] = sum[i] / nf;
            if (mx[i] - mn[i] < 22) nStable++;
        }
        // Si casi todo esta quieto (juego en pausa, una sola captura...), no hay informacion
        // temporal: se usa solo la imagen media.
        boolean temporal = nf >= 2 && nStable < N * 0.92;

        // --- Bordes estables: minimo, entre capturas, de la magnitud del gradiente.
        int[] minMag = new int[N];
        if (temporal) {
            java.util.Arrays.fill(minMag, Integer.MAX_VALUE);
            for (int f = 0; f < nf; f++) {
                int[] g = gray[f];
                for (int y = 1; y < H - 1; y++) {
                    for (int x = 1; x < W - 1; x++) {
                        int i = y * W + x;
                        int m = sobelMag(g, i, W);
                        if (m < minMag[i]) minMag[i] = m;
                    }
                }
            }
            for (int x = 0; x < W; x++) { minMag[x] = 0; minMag[N - 1 - x] = 0; }
            for (int y = 0; y < H; y++) { minMag[y * W] = 0; minMag[y * W + W - 1] = 0; }
        } else {
            for (int y = 1; y < H - 1; y++)
                for (int x = 1; x < W - 1; x++) minMag[y * W + x] = sobelMag(mean, y * W + x, W);
        }
        int[] hist = new int[2048];
        for (int i = 0; i < N; i++) hist[Math.min(2047, minMag[i])]++;
        int target = (int) (N * (temporal ? 0.10 : 0.08)), acc = 0, thr = 2047;
        for (int m = 2047; m >= 0; m--) {
            acc += hist[m];
            if (acc >= target) {
                thr = m;
                break;
            }
        }
        thr = Math.max(temporal ? 45 : 70, thr);
        boolean[] edge = new boolean[N];
        int nEdge = 0;
        for (int i = 0; i < N; i++) {
            edge[i] = minMag[i] >= thr && (!temporal || mx[i] - mn[i] < 40);
            if (edge[i]) nEdge++;
        }
        if (debug) debugEdge = edge;
        float sx = (float) screenW / W, sy = (float) screenH / H;
        float shortSmall = Math.min(W, H), shortScreen = Math.min(screenW, screenH);
        if (nEdge == 0) return out;

        // --- Circulos (Hough con direccion del gradiente de la imagen media).
        // Radio minimo ~4 % del lado corto: por debajo aparecen letras ("O", curvas) como circulos.
        int rMin = Math.max(4, Math.round(shortSmall * 0.04f)), rMax = Math.round(shortSmall * 0.2f);
        int nr = rMax - rMin + 1;
        short[][] accu = new short[nr][N];
        for (int y = 1; y < H - 1; y++) {
            for (int x = 1; x < W - 1; x++) {
                int i = y * W + x;
                if (!edge[i]) continue;
                int gx = sobelX(mean, i, W), gy = sobelY(mean, i, W);
                double len = Math.hypot(gx, gy);
                if (len < 1) continue;
                double ux = gx / len, uy = gy / len;
                for (int k = 0; k < nr; k++) {
                    int r = rMin + k;
                    for (int sgn = -1; sgn <= 1; sgn += 2) {
                        int cx = (int) Math.round(x + sgn * ux * r), cy = (int) Math.round(y + sgn * uy * r);
                        if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
                        short[] a = accu[k];
                        int j = cy * W + cx;
                        if (a[j] < Short.MAX_VALUE) a[j]++;
                    }
                }
            }
        }
        // Los votos de un aro se reparten entre pixeles vecinos (redondeo de la direccion):
        // primero se suma cada vecindario 3x3 de cada radio...
        short[] tmp = new short[N];
        for (int k = 0; k < nr; k++) {
            short[] a = accu[k];
            System.arraycopy(a, 0, tmp, 0, N);
            java.util.Arrays.fill(a, (short) 0);
            for (int y = 1; y < H - 1; y++) {
                for (int x = 1; x < W - 1; x++) {
                    int i = y * W + x, s3 = 0;
                    for (int dy = -1; dy <= 1; dy++)
                        for (int dx = -1; dx <= 1; dx++) s3 += tmp[i + dy * W + dx];
                    a[i] = (short) Math.min(Short.MAX_VALUE, s3);
                }
            }
        }
        // ...y luego se buscan los picos (con los radios vecinos) relativos al perimetro.
        List<float[]> peaks = new ArrayList<>();   // {score, x, y, r}
        for (int k = 0; k < nr; k++) {
            int r = rMin + k;
            float per = (float) (2 * Math.PI * r);
            short[] a = accu[k];
            for (int y = 1; y < H - 1; y++) {
                for (int x = 1; x < W - 1; x++) {
                    int i = y * W + x;
                    int v = a[i];
                    if (v < per * 0.25f) continue;
                    boolean max = true;   // maximo local en su radio
                    for (int dy = -1; dy <= 1 && max; dy++)
                        for (int dx = -1; dx <= 1; dx++)
                            if ((dx != 0 || dy != 0) && a[i + dy * W + dx] > v) { max = false; break; }
                    if (!max) continue;
                    int s = v + (k > 0 ? accu[k - 1][i] : 0) + (k < nr - 1 ? accu[k + 1][i] : 0);
                    float score = s / per;
                    if (score >= 0.6f) peaks.add(new float[]{score, x, y, r});
                }
            }
        }
        accu = null;
        Collections.sort(peaks, (a, b) -> Float.compare(b[0], a[0]));
        if (debug) debugPeaks = peaks;
        List<Cand> circles = new ArrayList<>();
        for (float[] p : peaks) {
            if (circles.size() >= 40) break;
            float x = p[1], y = p[2], r = p[3];
            float cov = coverage(edge, W, H, x, y, r);
            if (cov < 0.5f) continue;
            boolean clash = false;
            for (Cand c : circles) {
                float cxs = c.x / sx, cys = c.y / sy, cr = c.r / sx;
                double d = Math.hypot(x - cxs, y - cys);
                // mismo circulo (o casi): se queda el ya aceptado (mejor puntuacion)
                if (d < Math.max(cr, r) * 0.5f && Math.abs(cr - r) < Math.max(cr, r) * 0.35f) { clash = true; break; }
                // de tamano parecido y muy solapados: tambien es el mismo
                if (d < (cr + r) * 0.5f && Math.max(cr, r) < Math.min(cr, r) * 1.5f) { clash = true; break; }
            }
            if (clash) continue;
            Cand c = new Cand();
            c.x = x * sx;
            c.y = y * sy;
            c.r = r * (sx + sy) / 2f;
            c.round = true;
            c.score = cov;
            circles.add(c);
        }
        // Un circulo dentro de otro (icono dentro del aro, palanca dentro del joystick):
        // el boton es el exterior.
        for (int a = 0; a < circles.size(); a++) {
            Cand A = circles.get(a);
            for (int b = circles.size() - 1; b >= 0; b--) {
                Cand B = circles.get(b);
                if (A == B || B.r >= A.r) continue;
                if (Math.hypot(A.x - B.x, A.y - B.y) + B.r <= A.r * 1.15f && B.r < A.r * 0.8f) {
                    circles.remove(b);
                    if (b < a) a--;
                }
            }
        }
        out.addAll(circles);

        // --- Manchas (botones no redondos).
        boolean[] mask = dilate(edge, W, H, 1);
        int[] label = new int[N];
        int[] queue = new int[N];
        List<Cand> blobs = new ArrayList<>();
        List<float[]> bars = new ArrayList<>();   // {x0, y0, x1, y1} en pantalla
        int next = 1;
        for (int s = 0; s < N; s++) {
            if (!mask[s] || label[s] != 0) continue;
            int qh = 0, qt = 0, count = 0;
            int x0 = W, x1 = -1, y0 = H, y1 = -1;
            queue[qt++] = s;
            label[s] = next;
            while (qh < qt) {
                int i = queue[qh++];
                int x = i % W, y = i / W;
                count++;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
                if (x > 0 && mask[i - 1] && label[i - 1] == 0) { label[i - 1] = next; queue[qt++] = i - 1; }
                if (x < W - 1 && mask[i + 1] && label[i + 1] == 0) { label[i + 1] = next; queue[qt++] = i + 1; }
                if (y > 0 && mask[i - W] && label[i - W] == 0) { label[i - W] = next; queue[qt++] = i - W; }
                if (y < H - 1 && mask[i + W] && label[i + W] == 0) { label[i + W] = next; queue[qt++] = i + W; }
            }
            next++;
            int bw = x1 - x0 + 1, bh = y1 - y0 + 1;
            float w = bw * sx, h = bh * sy, size = Math.max(w, h), aspect = w / h;
            float fill = (float) count / (bw * bh);
            int borders = (x0 <= 1 ? 1 : 0) + (x1 >= W - 2 ? 1 : 0) + (y0 <= 1 ? 1 : 0) + (y1 >= H - 2 ? 1 : 0);
            // Barra horizontal de botones (p. ej. "L2 | L1+L2 | L1"): una celda por segmento.
            if (aspect > 2.2f && aspect <= 8f && h >= shortScreen * 0.06f && h <= shortScreen * 0.25f && borders == 0) {
                List<Cand> cells = splitBar(edge, W, x0, x1, y0, y1, sx, sy);
                if (!cells.isEmpty()) {
                    blobs.addAll(cells);
                    bars.add(new float[]{x0 * sx, y0 * sy, (x1 + 1) * sx, (y1 + 1) * sy});
                }
                continue;
            }
            if (size < shortScreen * 0.06f || size > shortScreen * 0.4f) continue;   // diminuto o enorme
            if (aspect < 0.45f || aspect > 2.2f) continue;                          // textos y barras
            if (fill < 0.15f || borders >= 1) continue;
            Cand c = new Cand();
            c.x = (x0 + x1 + 1) / 2f * sx;
            c.y = (y0 + y1 + 1) / 2f * sy;
            c.r = size / 2f;
            boolean inCircle = false;
            for (Cand k : circles) {
                if (Math.hypot(c.x - k.x, c.y - k.y) < k.r * 1.15f) { inCircle = true; break; }
            }
            if (!inCircle) blobs.add(c);
        }
        // Circulos dentro de una barra de botones: son letras de sus celdas, no botones.
        for (int i = out.size() - 1; i >= 0; i--) {
            Cand c = out.get(i);
            for (float[] b : bars) {
                if (c.x >= b[0] && c.x <= b[2] && c.y >= b[1] && c.y <= b[3]) {
                    out.remove(i);
                    break;
                }
            }
        }
        // Manchas que se solapan: la mayor.
        Collections.sort(blobs, (a, b) -> Float.compare(b.r, a.r));
        for (Cand c : blobs) {
            boolean inside = false;
            for (Cand k : out) {
                if (Math.hypot(c.x - k.x, c.y - k.y) < Math.max(k.r, c.r) * 0.9f) { inside = true; break; }
            }
            if (!inside) out.add(c);
        }

        classify(out, screenW, screenH);

        // Limites: como mucho 16 botones de juego y 6 de menu (los redondos primero).
        Collections.sort(out, (a, b) -> a.round != b.round ? (a.round ? -1 : 1) : Float.compare(b.score, a.score));
        List<Cand> res = new ArrayList<>();
        int game = 0, menu = 0;
        for (Cand c : out) {
            if (c.role == MENU || c.role == CENTER ? menu++ < 8 : game++ < 20) res.add(c);
        }
        return order(res);
    }

    /**
     * Divide una barra horizontal en celdas por sus lineas divisorias verticales (columnas
     * con borde en casi toda la altura). Devuelve una candidata por celda.
     */
    private static List<Cand> splitBar(boolean[] edge, int W, int x0, int x1, int y0, int y1, float sx, float sy) {
        List<Cand> res = new ArrayList<>();
        int h = y1 - y0 + 1, top = y0 + Math.max(1, h / 6), bot = y1 - Math.max(1, h / 6);
        int span = bot - top + 1;
        boolean[] div = new boolean[x1 - x0 + 1];
        for (int x = x0; x <= x1; x++) {
            int n = 0;
            for (int y = top; y <= bot; y++) if (edge[y * W + x]) n++;
            div[x - x0] = n >= span * 0.75f;
        }
        // Celdas entre divisorias (los extremos de la barra cuentan como divisorias).
        List<int[]> cells = new ArrayList<>();
        int start = -1;
        for (int i = 0; i <= div.length; i++) {
            boolean d = i == div.length || div[i];
            if (!d && start < 0) start = i;
            if (d && start >= 0) {
                cells.add(new int[]{start, i - 1});
                start = -1;
            }
        }
        for (int[] c : cells) {
            int cw = c[1] - c[0] + 1;
            if (cw < h * 0.45f) continue;            // trozos finos (bordes redondeados)
            if (cells.size() == 1 && cw > h * 2.5f) return res;   // sin divisorias: es un texto o una barra
            Cand k = new Cand();
            k.x = (x0 + c[0] + cw / 2f) * sx;
            k.y = (y0 + y1 + 1) / 2f * sy;
            k.r = Math.min(cw * sx, h * sy) / 2f;
            res.add(k);
        }
        return res;
    }

    private static int sobelX(int[] g, int i, int W) {
        return -g[i - W - 1] - 2 * g[i - 1] - g[i + W - 1] + g[i - W + 1] + 2 * g[i + 1] + g[i + W + 1];
    }

    private static int sobelY(int[] g, int i, int W) {
        return -g[i - W - 1] - 2 * g[i - W] - g[i - W + 1] + g[i + W - 1] + 2 * g[i + W] + g[i + W + 1];
    }

    private static int sobelMag(int[] g, int i, int W) {
        return Math.abs(sobelX(g, i, W)) + Math.abs(sobelY(g, i, W));
    }

    /** Fraccion de puntos del contorno (radio r +-1) que son borde estable. */
    private static float coverage(boolean[] edge, int W, int H, float cx, float cy, float r) {
        int n = Math.max(24, Math.round((float) (2 * Math.PI * r)));
        int hit = 0, tot = 0;
        for (int k = 0; k < n; k++) {
            double a = 2 * Math.PI * k / n, ca = Math.cos(a), sa = Math.sin(a);
            boolean any = false, inside = false;
            for (int dr = -1; dr <= 1 && !any; dr++) {
                int x = (int) Math.round(cx + (r + dr) * ca), y = (int) Math.round(cy + (r + dr) * sa);
                if (x < 0 || y < 0 || x >= W || y >= H) continue;
                inside = true;
                if (edge[y * W + x]) any = true;
            }
            if (!inside) continue;
            tot++;
            if (any) hit++;
        }
        return tot < n * 0.7f ? 0 : (float) hit / tot;   // casi todo fuera de la imagen: no vale
    }

    private static boolean[] dilate(boolean[] m, int W, int H, int r) {
        boolean[] out = new boolean[m.length];
        for (int y = 0; y < H; y++) {
            for (int x = 0; x < W; x++) {
                if (!m[y * W + x]) continue;
                for (int dy = -r; dy <= r; dy++) {
                    int yy = y + dy;
                    if (yy < 0 || yy >= H) continue;
                    for (int dx = -r; dx <= r; dx++) {
                        int xx = x + dx;
                        if (xx >= 0 && xx < W) out[yy * W + xx] = true;
                    }
                }
            }
        }
        return out;
    }

    private static void classify(List<Cand> list, int W, int H) {
        float shortSide = Math.min(W, H);
        Cand joy = null;
        for (Cand c : list) {
            float u = c.x / W, v = c.y / H;
            c.include = true;
            if (v < 0.18f || (v < 0.3f && c.r * 2 < shortSide * 0.08f)) {
                c.role = MENU;
                c.include = false;
            } else if (u > 0.35f && u < 0.65f && v > 0.25f && v < 0.92f) {
                // Centro: casi siempre es el personaje (en juegos con camara que lo sigue
                // tambien esta quieto). Se ofrece desmarcado.
                c.role = CENTER;
                c.include = false;
            } else if ((u < 0.06f || u > 0.94f) && c.r * 2 < shortSide * 0.14f) {
                // Pegado al borde lateral y pequeno: marcadores, iconos flotantes de otras apps.
                c.role = OTHER;
                c.include = false;
            } else {
                c.role = OTHER;
                if (u < 0.45f && v > 0.4f && c.r * 2 >= shortSide * 0.16f && (joy == null || c.r > joy.r)) joy = c;
            }
        }
        if (joy != null) joy.role = JOYSTICK;
        Cand primary = null;
        for (Cand c : list) {
            if (c.role != OTHER || c.x / W < 0.5f) continue;
            // principal: el mayor de la derecha; a igualdad, el mas bajo (zona del pulgar)
            if (primary == null || c.r > primary.r * 1.1f || (c.r > primary.r * 0.9f && c.y > primary.y)) primary = c;
        }
        if (primary != null) primary.role = PRIMARY;
        for (Cand c : list) if (c.role == OTHER && c.x / W >= 0.5f) c.role = SECONDARY;
    }

    /** Orden para asignar: joystick, principal, secundarios (de cerca a lejos), otros, menu. */
    private static List<Cand> order(List<Cand> list) {
        Cand primary = null;
        for (Cand c : list) if (c.role == PRIMARY) primary = c;
        final Cand p = primary;
        List<Cand> res = new ArrayList<>(list);
        Collections.sort(res, (a, b) -> {
            if (a.role != b.role) return a.role - b.role;
            if (p != null && a.role == SECONDARY)
                return Double.compare(Math.hypot(a.x - p.x, a.y - p.y), Math.hypot(b.x - p.x, b.y - p.y));
            return Float.compare(b.r, a.r);
        });
        return res;
    }
}
