import com.gamepadmapper.app.Profile;

import java.io.File;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Pruebas del formato de perfil (.conf) sin Android: leer -> guardar -> leer no pierde nada,
 * guardar es estable, y el volcado canonico (mismo formato que "gpmapper -c") para comparar
 * con el motor root. Uso: ver tests/run.sh
 */
public class ProfileTest {
    static int fails = 0;

    static void check(boolean ok, String what) {
        System.err.println((ok ? "  ok    " : "  FALLO ") + what);
        if (!ok) fails++;
    }

    public static void main(String[] args) throws Exception {
        File fixture = new File(args[0]);
        File tmp = Files.createTempDirectory("gpm").toFile();
        Profile p = Profile.load(fixture);

        // Valores leidos
        check("com.ejemplo.juego".equals(p.pkg), "package");
        check("Pruebas".equals(p.name), "name");
        check(p.sw == 2400 && p.sh == 1080, "screen");
        check(Math.abs(p.lsDeadzone - 0.25f) < 1e-4 && Math.abs(p.lsCurve - 1.5f) < 1e-4, "ls_deadzone / ls_curve");
        check("0,1".equals(p.lsAxes) && "2,5".equals(p.rsAxes), "ls_axes / rs_axes");
        check(p.lookInvert && Math.abs(p.lookY - 0.8f) < 1e-4, "look_y / look_invert");
        check(Profile.QUICK.equals(p.bindings.get("B").type), "B = quick");
        check(p.bindings.get("X").rate == 12, "turbo 12/s");
        check(Profile.BURST.equals(p.bindings.get("L3").type) && p.bindings.get("L3").count == 5
                && p.bindings.get("L3").gap == 80, "rafaga de 5 toques cada 80 ms");
        check(p.bindings.get("R1").steps.size() == 3, "macro de 3 pasos");
        check(p.bindings.get("LS").dpad, "LS con dpad");
        check(!p.bindings.get("RS").dpad && Profile.LOOK.equals(p.bindings.get("RS").type), "RS camara");
        check(p.bindings.containsKey("L2+A") && p.bindings.containsKey("SELECT+B"), "capas");
        check(p.bindings.containsKey("AXIS_9+"), "eje como boton");
        check("L2".equals(p.aimButton) && Math.abs(p.aimScale - 0.4f) < 1e-4 && Math.abs(p.lookAccel - 0.5f) < 1e-4,
                "aim_button / aim_scale / look_accel");
        check(p.matchesController("Xbox Wireless Controller") && !p.matchesController("DualSense"), "controller");
        check(Math.abs(p.rumble - 0.3f) < 1e-4, "rumble");
        check(Math.abs(p.gyro - 1.2f) < 1e-4 && "L2".equals(p.gyroButton) && p.gyroInvert && Math.abs(p.mouse - 0.8f) < 1e-4,
                "gyro / gyro_button / gyro_invert / mouse");
        check(p.bindings.containsKey("KB_W") && p.bindings.containsKey("MOUSE_LEFT"), "teclado y raton");

        // Ida y vuelta
        p.file = new File(tmp, "a.conf");
        p.save();
        Profile q = Profile.load(p.file);
        check(dump(p).equals(dump(q)), "leer -> guardar -> leer conserva todo");
        q.file = new File(tmp, "b.conf");
        q.save();
        check(Files.readString(p.file.toPath()).equals(Files.readString(q.file.toPath())), "guardar dos veces da el mismo archivo");

        // Compatibilidad: un perfil antiguo sin 'dpad' sigue igual
        File old = new File(tmp, "old.conf");
        Files.writeString(old.toPath(), "package = x\nLS = stick 300 800 100\nA = tap 10 20\n");
        Profile o = Profile.load(old);
        check(!o.bindings.get("LS").dpad && Profile.TAP.equals(o.bindings.get("A").type), "perfil antiguo sin dpad");

        System.out.print(dump(p));
        System.err.println(fails == 0 ? "Profile: todo correcto" : "Profile: " + fails + " fallo(s)");
        System.exit(fails == 0 ? 0 : 1);
    }

    /** Formato canonico, igual que "gpmapper -c": TECLA tipo X Y [R] [dpad] [pasos]. */
    static String dump(Profile p) {
        List<String> out = new ArrayList<>();
        for (Profile.Binding b : p.bindings.values()) {
            if (Profile.isNonRootInput(b.key)) continue;   // teclado y raton: solo sin root
            // gpmapper: toque rapido = macro de 1 paso; rafaga = macro de N pasos
            String t = Profile.QUICK.equals(b.type) || Profile.BURST.equals(b.type) ? "macro" : b.type;
            StringBuilder sb = new StringBuilder(String.format(Locale.ROOT, "%s %s %.0f %.0f", b.key, t, b.x, b.y));
            if (Profile.STICK.equals(b.type) || Profile.LOOK.equals(b.type)) sb.append(String.format(Locale.ROOT, " %.0f", b.r));
            if (Profile.STICK.equals(b.type) && b.dpad) sb.append(" dpad");
            if (Profile.MACRO.equals(b.type)) sb.append(' ').append(b.steps.size());
            if (Profile.QUICK.equals(b.type)) sb.append(" 1");
            if (Profile.BURST.equals(b.type)) sb.append(' ').append(b.count);
            out.add(sb.toString());
        }
        Collections.sort(out);
        out.add(String.format(Locale.ROOT, "~ajustes aim=%s %.2f accel=%.2f rumble=%.2f controller=%s",
                p.aimButton.isEmpty() ? "-" : p.aimButton, p.aimScale, p.lookAccel, p.rumble,
                p.controller.isEmpty() ? "-" : p.controller));
        Collections.sort(out);
        return "package " + p.pkg + "\nscreen " + Math.round(p.sw) + "x" + Math.round(p.sh) + "\n" + String.join("\n", out) + "\n";
    }
}
