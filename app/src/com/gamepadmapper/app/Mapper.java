package com.gamepadmapper.app;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.view.InputDevice;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Estado del servicio gpmapper (root, modulo Magisk) leido de status.txt, rotacion para
 * gpmapper -R y lista de mandos conectados. Sin root se usa PadService (accesibilidad).
 */
public final class Mapper {
    public static final String TOUCH_NAME = "Gamepad Mapper Touch";

    private Mapper() {
    }

    // ---------------------------------------------------------------- estado
    public static final class Status {
        public boolean running, root, rotate;
        public String gamepad = "", touch = "", profile = "", version = "";
        /** Numero de compilacion del motor (los modulos anteriores a 1.1 no lo escriben: 1). */
        public int build = 1;
    }

    public static Status status() {
        Status s = new Status();
        Map<String, String> m = new HashMap<>();
        File f = new File(Profile.baseDir(), "status.txt");
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                int eq = line.indexOf('=');
                if (eq > 0) m.put(line.substring(0, eq), line.substring(eq + 1));
            }
        } catch (IOException e) {
            return s;
        }
        long t = parseLong(m.get("time"));
        long now = System.currentTimeMillis() / 1000;
        s.running = t > 0 && Math.abs(now - t) <= 7;
        s.root = "0".equals(m.get("uid"));
        s.rotate = "1".equals(m.get("rotate"));
        s.gamepad = nz(m.get("gamepad"));
        s.touch = nz(m.get("touch"));
        s.profile = nz(m.get("profile"));
        s.build = (int) Math.max(1, parseLong(m.get("build")));
        s.version = nz(m.get("version"));
        return s;
    }

    /** El servicio sin root necesita que la app le diga la rotacion de la pantalla. */
    public static boolean needsRotation() {
        Status s = status();
        return s.running && s.rotate;
    }

    private static long parseLong(String s) {
        try {
            return s == null ? 0 : Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    // ---------------------------------------------------------------- rotacion
    private static int lastRotation = -1;

    /** Escribe la rotacion actual (0..3) para gpmapper -R. Solo escribe si cambia. */
    public static void writeRotation(int rot) {
        if (rot == lastRotation && new File(Profile.baseDir(), "rotation").exists()) return;
        File dir = Profile.baseDir();
        File tmp = new File(dir, "rotation.tmp");
        try {
            if (!dir.exists() && !dir.mkdirs()) return;
            try (OutputStream o = new FileOutputStream(tmp)) {
                o.write((rot + "\n").getBytes(StandardCharsets.US_ASCII));
            }
            if (!tmp.renameTo(new File(dir, "rotation"))) return;
            lastRotation = rot;
        } catch (IOException ignored) {
        }
    }

    // ---------------------------------------------------------------- mandos conectados
    public static final class Pad {
        public final String name;
        public final boolean gamepad;   // modo gamepad (perfiles)
        public final boolean touch;     // modo tactil / raton / lapiz
        public final int id;            // InputDevice id

        Pad(String name, boolean gamepad, boolean touch, int id) {
            this.name = name;
            this.gamepad = gamepad;
            this.touch = touch;
            this.id = id;
        }
    }

    /**
     * Android une las partes de un mando (gamepad, teclado, "consumer control") en un solo
     * dispositivo y a veces se queda con el nombre de una parte: "GamepadPlus V3 Consumer
     * Control" -> "GamepadPlus V3".
     */
    static String cleanName(String n) {
        String[] suffixes = {" Consumer Control", " System Control", " Keyboard", " Mouse", " Touchscreen",
                " Touchpad", " Motion Sensors"};
        for (String s : suffixes) {
            if (n.endsWith(s) && n.length() > s.length()) return n.substring(0, n.length() - s.length());
        }
        return n;
    }

    private static boolean has(int sources, int s) {
        return (sources & s) == s;
    }

    /**
     * Mandos conectados y en que modo estan.
     * <p>
     * No se filtra por isExternal(): un IDC con device.internal=1 (p. ej. el arreglo del modo
     * tactil del GamepadPlus, que comparte vendor/product con su modo gamepad) hace que
     * Android trate al mando como interno. Lo que se anuncia como gamepad/joystick es un
     * mando; para los tactiles se descartan las pantallas del propio telefono (vendor 0).
     */
    public static List<Pad> pads() {
        List<Pad> out = new ArrayList<>();
        for (int id : InputDevice.getDeviceIds()) {
            InputDevice d = InputDevice.getDevice(id);
            if (d == null || d.isVirtual()) continue;
            String name = d.getName();
            if (name == null || name.equals(TOUCH_NAME)) continue;
            int s = d.getSources();
            boolean pad = has(s, InputDevice.SOURCE_GAMEPAD) || has(s, InputDevice.SOURCE_JOYSTICK);
            boolean touch = has(s, InputDevice.SOURCE_MOUSE) || has(s, InputDevice.SOURCE_STYLUS)
                    || has(s, InputDevice.SOURCE_TOUCHSCREEN) || has(s, InputDevice.SOURCE_TOUCHPAD);
            boolean external = android.os.Build.VERSION.SDK_INT < 29 || d.isExternal();
            if (touch && !pad && !external && d.getVendorId() == 0) continue;   // pantalla del telefono
            if (pad || touch) out.add(new Pad(cleanName(name), pad, touch && !pad, id));
        }
        return out;
    }
}
