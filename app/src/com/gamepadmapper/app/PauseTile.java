package com.gamepadmapper.app;

import android.content.ComponentName;
import android.content.Context;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

import java.io.File;

/**
 * Boton de Ajustes rapidos «Mando»: pausa o reanuda el mapeo sin abrir la app (por ejemplo para
 * escribir en el chat del juego). Funciona con los dos motores: crea o borra &lt;base&gt;/paused, que
 * leen PadService (accesibilidad) y gpmapper (root) cada segundo. SELECT + START sigue valiendo.
 */
public class PauseTile extends TileService {

    static File flag() {
        return new File(Profile.baseDir(), "paused");
    }

    static boolean isPaused() {
        return flag().exists();
    }

    static void setPaused(Context c, boolean paused) {
        File f = flag();
        try {
            if (paused) {
                File dir = f.getParentFile();
                if (dir != null && !dir.exists()) //noinspection ResultOfMethodCallIgnored
                    dir.mkdirs();
                //noinspection ResultOfMethodCallIgnored
                f.createNewFile();
            } else {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        } catch (Exception ignored) {
        }
        try {
            TileService.requestListeningState(c, new ComponentName(c, PauseTile.class));
        } catch (Exception ignored) {
            // sin el boton añadido: no pasa nada
        }
    }

    @Override
    public void onStartListening() {
        refresh();
    }

    @Override
    public void onClick() {
        setPaused(this, !isPaused());
        refresh();
    }

    private void refresh() {
        Tile t = getQsTile();
        if (t == null) return;
        boolean paused = isPaused();
        t.setState(paused ? Tile.STATE_INACTIVE : Tile.STATE_ACTIVE);
        t.setLabel(L.t("Mando"));
        if (android.os.Build.VERSION.SDK_INT >= 29) t.setSubtitle(paused ? L.t("En pausa") : L.t("Activo"));
        t.setContentDescription(paused ? L.t("Mapeo del mando en pausa") : L.t("Mapeo del mando activo"));
        t.updateTile();
    }
}
