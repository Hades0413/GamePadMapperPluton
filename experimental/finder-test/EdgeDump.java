package com.gamepadmapper.app;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Prueba: guarda el mapa de bordes estables de ButtonFinder. Uso: EdgeDump salida.png a.png b.png ... */
public class EdgeDump {
    public static void main(String[] a) throws Exception {
        int W = Integer.getInteger("w", ButtonFinder.WORK_WIDTH), H = 0;
        List<int[]> frames = new ArrayList<>();
        int sw = 0, sh = 0;
        for (int i = 1; i < a.length; i++) {
            BufferedImage img = ImageIO.read(new File(a[i]));
            sw = img.getWidth();
            sh = img.getHeight();
            H = Math.round((float) W * sh / sw);
            BufferedImage s = new BufferedImage(W, H, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = s.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(img, 0, 0, W, H, null);
            g.dispose();
            frames.add(s.getRGB(0, 0, W, H, null, 0, W));
        }
        ButtonFinder.debug = true;
        ButtonFinder.findPixels(frames, W, H, sw, sh);
        BufferedImage o = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        for (int i = 0; i < W * H; i++) o.setRGB(i % W, i / W, ButtonFinder.debugEdge[i] ? 0xFFFFFF : 0);
        ImageIO.write(o, "png", new File(a[0]));
        String q = System.getProperty("at");   // "x,y" en pixeles de pantalla: picos cercanos
        if (q != null) {
            float qx = Float.parseFloat(q.split(",")[0]) * W / sw, qy = Float.parseFloat(q.split(",")[1]) * H / sh;
            System.out.printf("punto (%.1f, %.1f) en la imagen reducida%n", qx, qy);
            for (float[] p : ButtonFinder.debugPeaks)
                if (Math.hypot(p[1] - qx, p[2] - qy) < 6)
                    System.out.printf("  pico score=%.2f x=%.0f y=%.0f r=%.0f cobertura=%.2f%n", p[0], p[1], p[2], p[3],
                            ButtonFinder.debugCoverage(W, H, p[1], p[2], p[3]));
            for (int r = 10; r <= 20; r++)
                System.out.printf("  cobertura directa r=%d: %.2f%n", r, ButtonFinder.debugCoverage(W, H, qx, qy, r));
        }
    }
}
