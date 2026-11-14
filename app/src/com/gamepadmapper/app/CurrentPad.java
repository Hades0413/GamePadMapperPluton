package com.gamepadmapper.app;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;

/** El mando conectado (o el ultimo visto) para los datos del perfil al compartirlo (ProfileMeta). */
final class CurrentPad {
    private CurrentPad() {
    }

    /** Ultimo mando visto (para exportar aunque ahora no haya ninguno conectado). */
    private static final String PREF_PAD = "ultimo_mando";

    /** El perfil con el modelo de este telefono, el mando y la pantalla. */
    public static String add(Context c, String conf) {
        return ProfileMeta.add(conf, Community.deviceModel(), get(c));
    }

    /**
     * El mando conectado ahora, o el ultimo que se vio: primero los que Android tiene conectados,
     * luego el ultimo del servicio de accesibilidad, luego el que vio gpmapper (modo root,
     * {@code <base>/mando_info}) y por ultimo el que se guardo la ultima vez. "" si nunca hubo.
     */
    public static String get(Context c) {
        String pad = connectedPad();
        if (pad.isEmpty()) {
            String last = PadService.lastPad;
            if (last != null && !last.isEmpty()) pad = ProfileMeta.pad(last, PadService.lastPadVendor, PadService.lastPadProduct);
        }
        if (pad.isEmpty()) pad = rootPad();
        android.content.SharedPreferences sp = c.getSharedPreferences(Games.PREFS, Context.MODE_PRIVATE);
        if (pad.isEmpty()) return ProfileMeta.cleanPad(sp.getString(PREF_PAD, ""));
        if (!pad.equals(sp.getString(PREF_PAD, ""))) sp.edit().putString(PREF_PAD, pad).apply();
        return pad;
    }

    private static String connectedPad() {
        try {
            for (int id : android.view.InputDevice.getDeviceIds()) {
                android.view.InputDevice d = android.view.InputDevice.getDevice(id);
                if (d == null || d.isVirtual()) continue;
                int s = d.getSources();
                boolean pad = (s & android.view.InputDevice.SOURCE_GAMEPAD) == android.view.InputDevice.SOURCE_GAMEPAD
                        || (s & android.view.InputDevice.SOURCE_JOYSTICK) == android.view.InputDevice.SOURCE_JOYSTICK;
                if (pad && d.getVendorId() != 0) return ProfileMeta.pad(d.getName(), d.getVendorId(), d.getProductId());
            }
        } catch (RuntimeException ignored) {
            // sin servicio de entrada: se prueba lo siguiente
        }
        return "";
    }

    private static String rootPad() {
        File f = new File(Profile.baseDir(), "mando_info");
        if (!f.isFile() || f.length() > 16384) return "";
        try (FileInputStream in = new FileInputStream(f)) {
            SdlMapping.Info info = SdlMapping.Info.parse(new String(Library.readBytes(in, 16384), StandardCharsets.UTF_8));
            return info == null ? "" : ProfileMeta.pad(info.name, info.vendor, info.product);
        } catch (Exception e) {
            return "";
        }
    }
}
