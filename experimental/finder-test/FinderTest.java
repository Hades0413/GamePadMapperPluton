import com.gamepadmapper.app.ButtonFinder;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Prueba de escritorio de ButtonFinder: analiza capturas reales y dibuja lo detectado.
 * Uso: java -cp <clases>;android.jar FinderTest salida.png captura1.png captura2.png ...
 */
public class FinderTest {
    public static void main(String[] a) throws Exception {
        List<int[]> frames = new ArrayList<>();
        BufferedImage first = null;
        int W = Integer.getInteger("w", ButtonFinder.WORK_WIDTH), H = 0;
        for (int i = 1; i < a.length; i++) {
            BufferedImage img = ImageIO.read(new File(a[i]));
            if (first == null) {
                first = img;
                H = Math.round((float) W * img.getHeight() / img.getWidth());
            }
            BufferedImage s = new BufferedImage(W, H, BufferedImage.TYPE_INT_ARGB);
            Graphics2D g = s.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(img, 0, 0, W, H, null);
            g.dispose();
            frames.add(s.getRGB(0, 0, W, H, null, 0, W));
        }
        long t = System.nanoTime();
        List<ButtonFinder.Cand> res = ButtonFinder.findPixels(frames, W, H, first.getWidth(), first.getHeight());
        System.out.printf("analisis: %.1f ms, %d candidatos%n", (System.nanoTime() - t) / 1e6, res.size());
        Graphics2D g = first.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setStroke(new BasicStroke(6));
        g.setFont(new Font("SansSerif", Font.BOLD, 34));
        for (ButtonFinder.Cand c : res) {
            Color col = !c.include ? Color.GRAY : c.role == ButtonFinder.JOYSTICK ? Color.GREEN
                    : c.role == ButtonFinder.PRIMARY ? Color.YELLOW : Color.ORANGE;
            g.setColor(col);
            g.drawOval(Math.round(c.x - c.r), Math.round(c.y - c.r), Math.round(c.r * 2), Math.round(c.r * 2));
            g.drawString(c.roleName(), Math.round(c.x - c.r), Math.round(c.y - c.r - 6));
            System.out.printf("  %-18s x=%5.0f y=%5.0f r=%4.0f%n", c.roleName(), c.x, c.y, c.r);
        }
        g.dispose();
        ImageIO.write(first, "png", new File(a[0]));
    }
}
