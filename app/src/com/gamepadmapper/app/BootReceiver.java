package com.gamepadmapper.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;

/** Al encender el telefono, vuelve a activar la burbuja de juegos si estaba activada. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        Profile.init(c);
        if (!Games.bubbleEnabled(c) || !Perms.canDrawBubble(c) || !Perms.canKnowGame(c)) return;
        try {
            c.startForegroundService(new Intent(c, OverlayService.class));
        } catch (Exception ignored) {
            // Algunas versiones no permiten iniciarlo aqui; se inicia al abrir la app.
        }
    }
}
