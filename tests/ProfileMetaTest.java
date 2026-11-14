import com.gamepadmapper.app.Profile;
import com.gamepadmapper.app.ProfileMeta;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * Datos del perfil al compartirlo (ProfileMeta): comentarios al principio que la app y gpmapper
 * ignoran. Escribe el perfil con los datos en args[1] (tests/run.sh lo pasa por gpmapper -c y lo
 * compara con el original).
 */
public class ProfileMetaTest {
    static int fails = 0;

    static void check(boolean ok, String what) {
        System.err.println((ok ? "  ok    " : "  FALLO ") + what);
        if (!ok) fails++;
    }

    public static void main(String[] args) throws Exception {
        String conf = new String(Files.readAllBytes(new File(args[0]).toPath()), StandardCharsets.UTF_8);
        String out = ProfileMeta.add(conf, "Redmi Note 9", "Wireless Controller (054c:05c4)");
        check(out.startsWith("# modelo: Redmi Note 9\n# mando: Wireless Controller (054c:05c4)\n# pantalla: 2400x1080\n"),
                "modelo, mando y pantalla al principio");
        check(out.endsWith(conf.replace("\r\n", "\n")), "el resto del perfil intacto");
        check(ProfileMeta.add(out, "Pixel 7", "").startsWith("# modelo: Pixel 7\n# pantalla: 2400x1080\n# Perfil"),
                "volver a compartir sustituye los datos (no se repiten)");

        // Limpieza: una linea, sin #, sin saltos y sin caracteres raros; nunca mas de 60.
        String evil = ProfileMeta.add("package = a.b\nscreen = 100x100\n", "X\n# pkg = evil.app\npackage = evil.app",
                "Pad#\nscreen = 1x1\u0000‮<script>");
        String[] lines = evil.split("\n");
        check(!evil.contains("<") && !evil.contains("\u0000") && !evil.contains("‮"), "sin caracteres raros");
        check(lines.length == 5 && lines[0].startsWith("# modelo: ") && lines[1].startsWith("# mando: ")
                && lines[2].equals("# pantalla: 100x100") && lines[3].equals("package = a.b"),
                "los datos no pueden meter lineas nuevas");
        check(lines[1].equals("# mando: Padscreen 1x1script") && lines[0].indexOf('#', 1) < 0
                && lines[0].indexOf('=') < 0, "mando y modelo limpios");
        check("package = a.b\n".equals(ProfileMeta.add("package = a.b\n", "", "")), "sin datos: nada");
        String longName = ProfileMeta.add("package = a.b\n", "", new String(new char[200]).replace('\0', 'a'));
        check(longName.split("\n")[0].length() == "# mando: ".length() + 60, "mando de 60 caracteres como mucho");

        check("Wireless Controller (054c:05c4)".equals(ProfileMeta.pad("Wireless Controller", 0x054c, 0x05c4)), "nombre e ids");
        check("Gamepad (2dc8:6006)".equals(ProfileMeta.pad("\u2122#", 0x2dc8, 0x6006)), "sin nombre: Gamepad");
        check("Xbox Wireless Controller".equals(ProfileMeta.pad(" Xbox Wireless Controller ", 0, 0)), "sin ids");

        Profile a = Profile.load(new File(args[0]));
        File withMeta = new File(args[1]);
        Files.write(withMeta.toPath(), out.getBytes(StandardCharsets.UTF_8));
        Profile b = Profile.load(withMeta);
        check(ProfileTest.dump(a).equals(ProfileTest.dump(b)), "la app lee igual el perfil con los datos");
        System.exit(fails == 0 ? 0 : 1);
    }
}
