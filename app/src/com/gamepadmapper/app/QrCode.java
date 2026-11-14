package com.gamepadmapper.app;

import android.graphics.Bitmap;
import android.graphics.Color;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Generador de codigos QR (modo byte, versiones 1-40) sin librerias.
 * Basado en el algoritmo publico del estandar ISO/IEC 18004 (como el generador de Nayuki).
 * Se usa para compartir perfiles: el QR contiene el texto del perfil.
 */
public final class QrCode {
    public static final int ECC_L = 0, ECC_M = 1, ECC_Q = 2, ECC_H = 3;
    private static final int[] FORMAT_BITS = {1, 0, 3, 2};

    private static final byte[][] ECC_CODEWORDS_PER_BLOCK = {
            {-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30},
            {-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28},
            {-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30},
            {-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30},
    };
    private static final byte[][] NUM_ERROR_CORRECTION_BLOCKS = {
            {-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25},
            {-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49},
            {-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68},
            {-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81},
    };

    public final int version, size;
    private final boolean[][] modules, isFunction;
    private final int ecl;

    private QrCode(int ver, int ecl, byte[] dataCodewords) {
        version = ver;
        size = ver * 4 + 17;
        this.ecl = ecl;
        modules = new boolean[size][size];
        isFunction = new boolean[size][size];
        drawFunctionPatterns();
        drawCodewords(addEccAndInterleave(dataCodewords));
        // Mascara con menor penalizacion
        int best = 0, bestPen = Integer.MAX_VALUE;
        for (int m = 0; m < 8; m++) {
            applyMask(m);
            drawFormatBits(m);
            int p = penalty();
            if (p < bestPen) {
                bestPen = p;
                best = m;
            }
            applyMask(m);   // deshacer (XOR)
        }
        applyMask(best);
        drawFormatBits(best);
    }

    /** Codifica texto (UTF-8) con el nivel de correccion dado; null si no cabe. */
    public static QrCode encode(String text, int ecl) {
        byte[] data = text.getBytes(StandardCharsets.UTF_8);
        for (int ver = 1; ver <= 40; ver++) {
            int ccBits = ver <= 9 ? 8 : 16;
            int capBits = numDataCodewords(ver, ecl) * 8;
            int used = 4 + ccBits + data.length * 8;
            if (data.length >= (1 << ccBits) || used > capBits) continue;
            // Flujo de bits: modo byte (0100), longitud, datos, terminador y relleno.
            BitBuf bb = new BitBuf();
            bb.append(4, 4);
            bb.append(data.length, ccBits);
            for (byte b : data) bb.append(b & 0xFF, 8);
            bb.append(0, Math.min(4, capBits - bb.len));
            bb.append(0, (8 - bb.len % 8) % 8);
            for (int pad = 0xEC; bb.len < capBits; pad ^= 0xEC ^ 0x11) bb.append(pad, 8);
            byte[] cw = new byte[bb.len / 8];
            for (int i = 0; i < bb.len; i++) cw[i >>> 3] |= (byte) (bb.get(i) << (7 - (i & 7)));
            return new QrCode(ver, ecl, cw);
        }
        return null;
    }

    public boolean get(int x, int y) {
        return x >= 0 && x < size && y >= 0 && y < size && modules[y][x];
    }

    /** Imagen en blanco y negro con margen de 4 modulos, 'scale' pixeles por modulo. */
    public Bitmap toBitmap(int scale) {
        int border = 4, dim = (size + border * 2) * scale;
        int[] px = new int[dim * dim];
        for (int y = 0; y < dim; y++) {
            for (int x = 0; x < dim; x++) {
                px[y * dim + x] = get(x / scale - border, y / scale - border) ? Color.BLACK : Color.WHITE;
            }
        }
        return Bitmap.createBitmap(px, dim, dim, Bitmap.Config.ARGB_8888);
    }

    // ------------------------------------------------------------------ patrones fijos
    private void drawFunctionPatterns() {
        for (int i = 0; i < size; i++) {
            setFunction(6, i, i % 2 == 0);
            setFunction(i, 6, i % 2 == 0);
        }
        drawFinder(3, 3);
        drawFinder(size - 4, 3);
        drawFinder(3, size - 4);
        int[] pos = alignmentPositions();
        int n = pos.length;
        for (int i = 0; i < n; i++)
            for (int j = 0; j < n; j++)
                if (!(i == 0 && j == 0 || i == 0 && j == n - 1 || i == n - 1 && j == 0)) drawAlignment(pos[i], pos[j]);
        drawFormatBits(0);   // reserva
        drawVersion();
    }

    private void drawFinder(int x, int y) {
        for (int dy = -4; dy <= 4; dy++) {
            for (int dx = -4; dx <= 4; dx++) {
                int dist = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
                if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFunction(xx, yy, dist != 2 && dist != 4);
            }
        }
    }

    private void drawAlignment(int x, int y) {
        for (int dy = -2; dy <= 2; dy++)
            for (int dx = -2; dx <= 2; dx++) setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) != 1);
    }

    private int[] alignmentPositions() {
        if (version == 1) return new int[0];
        int num = version / 7 + 2;
        int step = version == 32 ? 26 : (version * 4 + num * 2 + 1) / (num * 2 - 2) * 2;
        int[] r = new int[num];
        r[0] = 6;
        for (int i = num - 1, pos = size - 7; i >= 1; i--, pos -= step) r[i] = pos;
        return r;
    }

    private void drawFormatBits(int mask) {
        int data = FORMAT_BITS[ecl] << 3 | mask, rem = data;
        for (int i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        int bits = (data << 10 | rem) ^ 0x5412;
        for (int i = 0; i <= 5; i++) setFunction(8, i, bit(bits, i));
        setFunction(8, 7, bit(bits, 6));
        setFunction(8, 8, bit(bits, 7));
        setFunction(7, 8, bit(bits, 8));
        for (int i = 9; i < 15; i++) setFunction(14 - i, 8, bit(bits, i));
        for (int i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(bits, i));
        for (int i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(bits, i));
        setFunction(8, size - 8, true);
    }

    private void drawVersion() {
        if (version < 7) return;
        int rem = version;
        for (int i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
        int bits = version << 12 | rem;
        for (int i = 0; i < 18; i++) {
            boolean b = bit(bits, i);
            int a = size - 11 + i % 3, c = i / 3;
            setFunction(a, c, b);
            setFunction(c, a, b);
        }
    }

    private void setFunction(int x, int y, boolean dark) {
        modules[y][x] = dark;
        isFunction[y][x] = true;
    }

    private static boolean bit(int x, int i) {
        return ((x >>> i) & 1) != 0;
    }

    // ------------------------------------------------------------------ datos
    private void drawCodewords(byte[] data) {
        int i = 0;
        for (int right = size - 1; right >= 1; right -= 2) {
            if (right == 6) right = 5;
            for (int vert = 0; vert < size; vert++) {
                for (int j = 0; j < 2; j++) {
                    int x = right - j;
                    boolean upward = ((right + 1) & 2) == 0;
                    int y = upward ? size - 1 - vert : vert;
                    if (!isFunction[y][x] && i < data.length * 8) {
                        modules[y][x] = bit(data[i >>> 3], 7 - (i & 7));
                        i++;
                    }
                }
            }
        }
    }

    private void applyMask(int m) {
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                if (isFunction[y][x]) continue;
                boolean inv;
                switch (m) {
                    case 0: inv = (x + y) % 2 == 0; break;
                    case 1: inv = y % 2 == 0; break;
                    case 2: inv = x % 3 == 0; break;
                    case 3: inv = (x + y) % 3 == 0; break;
                    case 4: inv = (x / 3 + y / 2) % 2 == 0; break;
                    case 5: inv = x * y % 2 + x * y % 3 == 0; break;
                    case 6: inv = (x * y % 2 + x * y % 3) % 2 == 0; break;
                    default: inv = ((x + y) % 2 + x * y % 3) % 2 == 0; break;
                }
                modules[y][x] ^= inv;
            }
        }
    }

    /** Penalizacion simplificada (rachas, bloques 2x2 y equilibrio blanco/negro). */
    private int penalty() {
        int p = 0, dark = 0;
        for (int y = 0; y < size; y++) {
            int runX = 1, runY = 1;
            for (int x = 0; x < size; x++) {
                if (modules[y][x]) dark++;
                if (x > 0) {
                    if (modules[y][x] == modules[y][x - 1]) { if (++runX == 5) p += 3; else if (runX > 5) p++; }
                    else runX = 1;
                    if (modules[x][y] == modules[x - 1][y]) { if (++runY == 5) p += 3; else if (runY > 5) p++; }
                    else runY = 1;
                }
                if (x > 0 && y > 0) {
                    boolean c = modules[y][x];
                    if (c == modules[y][x - 1] && c == modules[y - 1][x] && c == modules[y - 1][x - 1]) p += 3;
                }
            }
        }
        int total = size * size;
        int k = (Math.abs(dark * 20 - total * 10) + total - 1) / total - 1;
        return p + Math.max(0, k) * 10;
    }

    private byte[] addEccAndInterleave(byte[] data) {
        int numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][version];
        int blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][version];
        int rawCodewords = numRawDataModules(version) / 8;
        int numShortBlocks = numBlocks - rawCodewords % numBlocks;
        int shortBlockLen = rawCodewords / numBlocks;
        byte[][] blocks = new byte[numBlocks][];
        byte[] div = rsDivisor(blockEccLen);
        for (int i = 0, k = 0; i < numBlocks; i++) {
            byte[] dat = Arrays.copyOfRange(data, k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
            k += dat.length;
            byte[] ecc = rsRemainder(dat, div);
            if (i < numShortBlocks) dat = Arrays.copyOf(dat, dat.length + 1);
            byte[] block = Arrays.copyOf(dat, dat.length + ecc.length);
            System.arraycopy(ecc, 0, block, block.length - ecc.length, ecc.length);
            blocks[i] = block;
        }
        byte[] result = new byte[rawCodewords];
        for (int i = 0, k = 0; i < blocks[0].length; i++) {
            for (int j = 0; j < blocks.length; j++) {
                if (i != shortBlockLen - blockEccLen || j >= numShortBlocks) result[k++] = blocks[j][i];
            }
        }
        return result;
    }

    private static int numRawDataModules(int ver) {
        int result = (16 * ver + 128) * ver + 64;
        if (ver >= 2) {
            int numAlign = ver / 7 + 2;
            result -= (25 * numAlign - 10) * numAlign - 55;
            if (ver >= 7) result -= 36;
        }
        return result;
    }

    private static int numDataCodewords(int ver, int ecl) {
        return numRawDataModules(ver) / 8 - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
    }

    private static byte[] rsDivisor(int degree) {
        byte[] result = new byte[degree];
        result[degree - 1] = 1;
        int root = 1;
        for (int i = 0; i < degree; i++) {
            for (int j = 0; j < result.length; j++) {
                result[j] = (byte) gfMul(result[j] & 0xFF, root);
                if (j + 1 < result.length) result[j] ^= result[j + 1];
            }
            root = gfMul(root, 0x02);
        }
        return result;
    }

    private static byte[] rsRemainder(byte[] data, byte[] div) {
        byte[] result = new byte[div.length];
        for (byte b : data) {
            int factor = (b ^ result[0]) & 0xFF;
            System.arraycopy(result, 1, result, 0, result.length - 1);
            result[result.length - 1] = 0;
            for (int i = 0; i < result.length; i++) result[i] ^= (byte) gfMul(div[i] & 0xFF, factor);
        }
        return result;
    }

    private static int gfMul(int x, int y) {
        int z = 0;
        for (int i = 7; i >= 0; i--) {
            z = (z << 1) ^ ((z >>> 7) * 0x11D);
            z ^= ((y >>> i) & 1) * x;
        }
        return z;
    }

    private static final class BitBuf {
        byte[] b = new byte[64];
        int len = 0;

        void append(int val, int n) {
            for (int i = n - 1; i >= 0; i--) {
                if (len >= b.length * 8) b = Arrays.copyOf(b, b.length * 2);
                if (((val >>> i) & 1) != 0) b[len >>> 3] |= (byte) (0x80 >>> (len & 7));
                len++;
            }
        }

        int get(int i) {
            return (b[i >>> 3] >>> (7 - (i & 7))) & 1;
        }
    }
}
