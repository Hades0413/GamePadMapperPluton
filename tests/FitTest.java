import com.gamepadmapper.app.Profile;

/** Imprime puntos adaptados a otra pantalla (Profile.fitX/fitY), para compararlos con gpmapper -F. */
public class FitTest {
    public static void main(String[] args) {
        for (String c : args) {
            String[] p = c.split(",");
            float sw = Float.parseFloat(p[0]), sh = Float.parseFloat(p[1]), w = Float.parseFloat(p[2]),
                    h = Float.parseFloat(p[3]), x = Float.parseFloat(p[4]), y = Float.parseFloat(p[5]);
            System.out.printf(java.util.Locale.ROOT, "%.2f %.2f %.4f%n", Profile.fitX(x, sw, sh, w, h),
                    Profile.fitY(y, sw, sh, w, h), Profile.fitScale(sw, sh, w, h));
        }
    }
}
