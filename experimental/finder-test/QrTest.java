import com.gamepadmapper.app.QrCode;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.LuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.EnumMap;
import java.util.Map;

/** Prueba de QrCode: genera codigos y los decodifica con ZXing. Uso: QrTest perfil.conf */
public class QrTest {
    public static void main(String[] a) throws Exception {
        String conf = new String(Files.readAllBytes(Paths.get(a[0])), StandardCharsets.UTF_8);
        String[] tests = {"HELLO", "Gamepad Mapper Plutón · ñ á", conf, conf + conf};
        int ok = 0;
        for (int ecl = 0; ecl < 4; ecl++) {
            for (String t : tests) {
                QrCode q = QrCode.encode(t, ecl);
                if (q == null) { System.out.printf("ecl %d: %d bytes no cabe%n", ecl, t.getBytes(StandardCharsets.UTF_8).length); continue; }
                int s = 4, b = 4, dim = (q.size + 2 * b) * s;
                BufferedImage img = new BufferedImage(dim, dim, BufferedImage.TYPE_INT_RGB);
                for (int y = 0; y < dim; y++)
                    for (int x = 0; x < dim; x++)
                        img.setRGB(x, y, q.get(x / s - b, y / s - b) ? 0 : 0xFFFFFF);
                LuminanceSource src = new BufferedImageLuminanceSource(img);
                Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
                hints.put(DecodeHintType.CHARACTER_SET, "UTF-8");
                hints.put(DecodeHintType.PURE_BARCODE, Boolean.TRUE);
                String got;
                try {
                    Result r = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(src)), hints);
                    got = r.getText();
                } catch (Exception e) {
                    got = "ERROR " + e;
                }
                boolean same = t.equals(got);
                if (same) ok++;
                System.out.printf("ecl %d version %2d (%d bytes): %s%n", ecl, q.version,
                        t.getBytes(StandardCharsets.UTF_8).length, same ? "OK" : "FALLO -> " + got);
            }
        }
        System.out.println("correctos: " + ok);
    }
}
