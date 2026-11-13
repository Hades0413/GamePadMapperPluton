package com.gamepadmapper.app;

import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Pantallas de "Perfiles de la comunidad": juegos (primero los instalados) -> perfiles de un
 * juego -> ficha del perfil con vista previa e "Instalar". Solo lectura; "me gusta", reportar
 * y subir se hacen en la web.
 */
final class CommunityUi {
    /** Lo que la pantalla necesita de MainActivity. */
    interface Host {
        /** Instala un perfil pasando por la confirmacion habitual. */
        void install(String conf, String sourceName);
    }

    private final Activity a;
    private final Host host;
    private final Dialog dialog;
    private final LinearLayout body;
    private final TextView title;
    private final ScrollView scroll;
    /** Pantallas anteriores (para "atras"). */
    private final Deque<Runnable> back = new ArrayDeque<>();
    private Runnable current;
    /** Cambia en cada navegacion: las respuestas de pantallas ya cerradas se descartan. */
    private int generation;
    /** Cache de la sesion: volver atras no repite peticiones. */
    private final Map<String, Object> memo = new HashMap<>();

    static void open(Activity a, Host host, String pkg, String gameName) {
        CommunityUi ui = new CommunityUi(a, host);
        if (pkg == null) ui.go(ui::showGames);
        else ui.go(() -> ui.showGame(pkg, gameName, false));
        ui.dialog.show();
    }

    private CommunityUi(Activity a, Host host) {
        this.a = a;
        this.host = host;
        dialog = new Dialog(a, android.R.style.Theme_DeviceDefault_NoActionBar);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Ui.BG);
        root.setFitsSystemWindows(true);

        LinearLayout bar = new LinearLayout(a);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(6), dp(6), dp(12), dp(6));
        LinearLayout backBtn = Ui.button(a, R.drawable.ic_back, "", 0x00000000, Ui.TEXT, v -> goBack());
        backBtn.setContentDescription(L.t("Atrás"));
        backBtn.setPadding(0, 0, 0, 0);
        bar.addView(backBtn, new LinearLayout.LayoutParams(dp(44), dp(44)));
        title = Ui.oneLine(Ui.text(a, "", 18, Ui.TEXT, true));
        title.setPadding(dp(8), 0, 0, 0);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(bar);

        scroll = new ScrollView(a);
        body = new LinearLayout(a);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(16), dp(4), dp(16), dp(24));
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        dialog.setContentView(root);
        Window w = dialog.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Ui.BG));
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        }
        dialog.setOnKeyListener((d, code, ev) -> {
            if (code == KeyEvent.KEYCODE_BACK && ev.getAction() == KeyEvent.ACTION_UP) {
                goBack();
                return true;
            }
            return code == KeyEvent.KEYCODE_BACK;
        });
    }

    // ---------------------------------------------------------------- navegacion

    private void go(Runnable screen) {
        if (current != null) back.push(current);
        current = screen;
        screen.run();
    }

    private void goBack() {
        if (back.isEmpty()) {
            dialog.dismiss();
            return;
        }
        current = back.pop();
        current.run();
    }

    /** Limpia la pantalla y devuelve el numero de esta navegacion. */
    private int screen(String t) {
        title.setText(t);
        body.removeAllViews();
        scroll.scrollTo(0, 0);
        return ++generation;
    }

    /** Carga en segundo plano (con cache de sesion) y pinta si la pantalla sigue abierta. */
    private <T> void load(String key, Fetch<T> fetch, Show<T> show) {
        final int gen = generation;
        @SuppressWarnings("unchecked") T cached = (T) memo.get(key);
        if (cached != null) {
            show.show(cached);
            return;
        }
        final View spinner = spinner();
        body.addView(spinner);
        new Thread(() -> {
            try {
                T result = fetch.fetch();
                a.runOnUiThread(() -> {
                    if (gen != generation || !dialog.isShowing()) return;
                    body.removeView(spinner);
                    memo.put(key, result);
                    show.show(result);
                });
            } catch (Exception e) {
                a.runOnUiThread(() -> {
                    if (gen != generation || !dialog.isShowing()) return;
                    body.removeView(spinner);
                    error(e.getMessage(), () -> current.run());
                });
            }
        }).start();
    }

    private interface Fetch<T> {
        T fetch() throws Exception;
    }

    private interface Show<T> {
        void show(T value);
    }

    // ---------------------------------------------------------------- juegos

    private void showGames() {
        screen(L.t("Perfiles de la comunidad"));
        load("games", () -> Community.games(a), games -> {
            TextView intro = Ui.text(a, L.t("Perfiles que han subido otros jugadores. Revisa la vista previa antes de ")
                    + L.t("instalar: siempre te pediremos confirmación."), 13, Ui.TEXT_2, false);
            intro.setPadding(dp(4), 0, dp(4), dp(10));
            body.addView(intro);
            if (games.isEmpty()) {
                empty(L.t("Todavía no hay perfiles. ¡Sube el tuyo desde la web!"));
                webRow(Community.SITE);
                return;
            }
            final EditText search = new EditText(a);
            search.setSingleLine(true);
            search.setInputType(InputType.TYPE_CLASS_TEXT);
            search.setHint(L.t("Buscar juego…"));
            search.setTextColor(Ui.TEXT);
            search.setHintTextColor(Ui.TEXT_3);
            search.setTextSize(15);
            search.setBackground(Ui.round(a, Ui.SURFACE_2, 14));
            search.setPadding(dp(14), dp(10), dp(14), dp(10));
            search.setCompoundDrawablePadding(dp(10));
            body.addView(search, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));
            final LinearLayout list = new LinearLayout(a);
            list.setOrientation(LinearLayout.VERTICAL);
            body.addView(list);
            fillGames(list, games, "");
            search.addTextChangedListener(new TextWatcher() {
                @Override public void beforeTextChanged(CharSequence s, int st, int c, int af) { }
                @Override public void onTextChanged(CharSequence s, int st, int b, int c) { }
                @Override public void afterTextChanged(Editable s) {
                    fillGames(list, games, s.toString());
                }
            });
            webRow(Community.SITE);
        });
    }

    private void fillGames(LinearLayout list, List<Community.Game> games, String query) {
        list.removeAllViews();
        String q = query.trim().toLowerCase(Locale.ROOT);
        List<Community.Game> mine = new ArrayList<>(), others = new ArrayList<>();
        for (Community.Game g : games) {
            if (!q.isEmpty() && !g.name.toLowerCase(Locale.ROOT).contains(q)
                    && !g.pkg.toLowerCase(Locale.ROOT).contains(q)) continue;
            (Games.installed(a, g.pkg) ? mine : others).add(g);
        }
        if (!mine.isEmpty()) gameSection(list, L.t("Para tus juegos"), mine);
        if (!others.isEmpty()) gameSection(list, mine.isEmpty() ? L.t("Juegos") : L.t("Más juegos"), others);
        if (mine.isEmpty() && others.isEmpty()) {
            TextView t = Ui.text(a, L.t("No hay juegos con ese nombre."), 14, Ui.TEXT_2, false);
            t.setPadding(dp(4), dp(16), dp(4), dp(8));
            list.addView(t);
        }
    }

    private void gameSection(LinearLayout list, String name, List<Community.Game> games) {
        list.addView(section(name));
        LinearLayout card = card();
        for (Community.Game g : games) {
            boolean installed = Games.installed(a, g.pkg);
            LinearLayout r = row(() -> go(() -> showGame(g.pkg, g.name, false)));
            ImageView icon = new ImageView(a);
            if (installed) {
                icon.setImageDrawable(Games.icon(a, g.pkg));
                Ui.clipRound(icon, dp(10));
            } else {
                icon.setImageResource(R.drawable.ic_gamepad);
                icon.setColorFilter(Ui.TEXT_3);
                icon.setPadding(dp(8), dp(8), dp(8), dp(8));
                icon.setBackground(Ui.round(a, Ui.SURFACE_2, 10));
            }
            r.addView(icon, new LinearLayout.LayoutParams(dp(40), dp(40)));
            r.addView(texts(g.name, g.profiles == 1 ? L.t("1 perfil") : g.profiles + L.t(" perfiles")),
                    new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            if (installed) r.addView(Ui.chip(a, L.t("Instalado"), Ui.OK));
            card.addView(r);
        }
        list.addView(card);
    }

    // ---------------------------------------------------------------- perfiles de un juego

    private void showGame(String pkg, String gameName, boolean recent) {
        String name = gameName != null && !gameName.isEmpty() ? gameName : Games.label(a, pkg);
        screen(name);
        LinearLayout tabs = new LinearLayout(a);
        tabs.setPadding(0, 0, 0, dp(10));
        tabs.addView(tab(L.t("Populares"), !recent, () -> current = () -> showGame(pkg, gameName, false)),
                new LinearLayout.LayoutParams(0, dp(40), 1));
        View gap = new View(a);
        tabs.addView(gap, new LinearLayout.LayoutParams(dp(8), 1));
        tabs.addView(tab(L.t("Recientes"), recent, () -> current = () -> showGame(pkg, gameName, true)),
                new LinearLayout.LayoutParams(0, dp(40), 1));
        body.addView(tabs);
        final LinearLayout list = new LinearLayout(a);
        list.setOrientation(LinearLayout.VERTICAL);
        body.addView(list);
        loadPage(list, pkg, recent, 0);
    }

    private View tab(String label, boolean selected, Runnable select) {
        LinearLayout t = Ui.button(a, 0, label, selected ? Ui.PRIMARY_DARK : Ui.SURFACE_2,
                selected ? Color.WHITE : Ui.TEXT_2, v -> {
                    if (selected) return;
                    select.run();
                    current.run();
                });
        return t;
    }

    private void loadPage(LinearLayout list, String pkg, boolean recent, int page) {
        String key = "game:" + pkg + ":" + recent + ":" + page;
        LinearLayout target = new LinearLayout(a);
        target.setOrientation(LinearLayout.VERTICAL);
        list.addView(target);
        // load() pinta en "body": se usa un contenedor propio para esta pagina.
        final int gen = generation;
        @SuppressWarnings("unchecked") List<Community.Item> cached = (List<Community.Item>) memo.get(key);
        if (cached != null) {
            showPage(list, target, pkg, recent, page, cached);
            return;
        }
        View spinner = spinner();
        target.addView(spinner);
        new Thread(() -> {
            try {
                List<Community.Item> items = Community.profiles(a, pkg, recent, page);
                a.runOnUiThread(() -> {
                    if (gen != generation || !dialog.isShowing()) return;
                    target.removeView(spinner);
                    memo.put(key, items);
                    showPage(list, target, pkg, recent, page, items);
                });
            } catch (Exception e) {
                a.runOnUiThread(() -> {
                    if (gen != generation || !dialog.isShowing()) return;
                    target.removeView(spinner);
                    TextView t = Ui.text(a, L.t("No se pudo cargar: ") + e.getMessage(), 13, Ui.DANGER, false);
                    target.addView(t);
                    target.addView(Ui.button(a, 0, L.t("Reintentar"), Ui.SURFACE_2, Ui.TEXT, v -> {
                        list.removeView(target);
                        loadPage(list, pkg, recent, page);
                    }));
                });
            }
        }).start();
    }

    private void showPage(LinearLayout list, LinearLayout target, String pkg, boolean recent, int page,
                          List<Community.Item> items) {
        if (items.isEmpty() && page == 0) {
            empty(L.t("Aún no hay perfiles para este juego."));
            webRow(Community.gameUrl(pkg));
            return;
        }
        LinearLayout card = card();
        for (Community.Item it : items) {
            LinearLayout r = row(() -> go(() -> showProfile(it.id, it.title)));
            String sub = (it.author.isEmpty() ? "" : "@" + it.author + " · ") + it.buttons + L.t(" botones")
                    + " · ♥ " + it.likes;
            r.addView(texts(it.title, sub), new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            card.addView(r);
        }
        target.addView(card);
        if (items.size() == Community.PAGE) {
            LinearLayout more = Ui.button(a, 0, L.t("Cargar más"), Ui.SURFACE_2, Ui.TEXT, null);
            more.setOnClickListener(v -> {
                target.removeView(more);
                loadPage(list, pkg, recent, page + 1);
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44));
            lp.topMargin = dp(10);
            target.addView(more, lp);
        } else if (page == 0) {
            webRow(Community.gameUrl(pkg));
        }
    }

    // ---------------------------------------------------------------- ficha de un perfil

    private void showProfile(String id, String fallbackTitle) {
        screen(fallbackTitle);
        load("profile:" + id, () -> Community.profile(a, id), it -> {
            if (it == null) {
                empty(L.t("Este perfil ya no está disponible."));
                return;
            }
            title.setText(it.title);
            TextView game = Ui.text(a, it.gameName.isEmpty() ? it.pkg : it.gameName, 14, Ui.TEXT_2, true);
            body.addView(game);
            String meta = (it.author.isEmpty() ? "" : L.t("por @") + it.author + " · ") + "♥ " + it.likes + " · "
                    + it.buttons + L.t(" botones");
            if (it.createdAt > 0) meta += " · " + java.text.DateFormat.getDateInstance().format(new java.util.Date(it.createdAt));
            TextView m = Ui.text(a, meta, 13, Ui.TEXT_3, false);
            m.setPadding(0, dp(2), 0, dp(10));
            body.addView(m);
            if (!it.description.isEmpty()) {
                TextView desc = Ui.text(a, it.description, 14, Ui.TEXT, false);
                desc.setPadding(0, 0, 0, dp(12));
                body.addView(desc);
            }

            ProfilePreviewView preview = new ProfilePreviewView(a, Profile.parse(it.conf));
            body.addView(preview, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));
            TextView legend = Ui.text(a, L.t("Vista previa en tu pantalla · morado: botones · amarillo: capas · ")
                    + L.t("turquesa: joystick, cámara y deslizar"), 11, Ui.TEXT_3, false);
            legend.setPadding(dp(2), dp(6), dp(2), dp(14));
            body.addView(legend);

            LinearLayout install = Ui.button(a, R.drawable.ic_download, L.t("Instalar"), Ui.PRIMARY_DARK, Color.WHITE, v -> {
                try {
                    // El perfil tiene que ser del juego anunciado (y no de una app sensible).
                    if (!Library.validate(it.conf).equals(it.pkg)) throw new java.io.IOException(L.t("El perfil no es del juego indicado"));
                } catch (Exception e) {
                    Toast.makeText(a, e.getMessage(), Toast.LENGTH_LONG).show();
                    return;
                }
                host.install(it.conf, L.t("Comunidad: ") + it.title + (it.author.isEmpty() ? "" : " (@" + it.author + ")"));
            });
            body.addView(install, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)));

            LinearLayout actions = new LinearLayout(a);
            actions.setPadding(0, dp(10), 0, 0);
            actions.addView(Ui.button(a, R.drawable.ic_favorite, L.t("Me gusta"), Ui.SURFACE_2, Ui.TEXT,
                    v -> openWeb(Community.profileUrl(it.id))), new LinearLayout.LayoutParams(0, dp(44), 1));
            View gap = new View(a);
            actions.addView(gap, new LinearLayout.LayoutParams(dp(8), 1));
            actions.addView(Ui.button(a, R.drawable.ic_flag, L.t("Reportar"), Ui.SURFACE_2, Ui.DANGER,
                    v -> openWeb(Community.profileUrl(it.id))), new LinearLayout.LayoutParams(0, dp(44), 1));
            body.addView(actions);
            TextView note = Ui.text(a, L.t("«Me gusta» y «Reportar» se abren en la web (con tu cuenta de GitHub)."),
                    12, Ui.TEXT_3, false);
            note.setPadding(dp(2), dp(8), dp(2), 0);
            body.addView(note);
        });
    }

    // ---------------------------------------------------------------- piezas

    private void openWeb(String url) {
        try {
            a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            Toast.makeText(a, L.t("No hay navegador disponible"), Toast.LENGTH_SHORT).show();
        }
    }

    private void webRow(String url) {
        LinearLayout c = card();
        c.addView(Ui.menuRow(a, R.drawable.ic_open, Ui.PRIMARY, L.t("Abrir en la web"),
                L.t("Sube tus perfiles, da «me gusta» o reporta"), v -> openWeb(url)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(16);
        body.addView(c, lp);
    }

    private void error(String msg, Runnable retry) {
        TextView t = Ui.text(a, L.t("No se pudo cargar: ") + msg + "\n" + L.t("Revisa tu conexión a internet."),
                14, Ui.TEXT_2, false);
        t.setPadding(dp(4), dp(24), dp(4), dp(12));
        body.addView(t);
        body.addView(Ui.button(a, 0, L.t("Reintentar"), Ui.PRIMARY_DARK, Color.WHITE, v -> retry.run()),
                new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44)));
    }

    private void empty(String msg) {
        TextView t = Ui.text(a, msg, 14, Ui.TEXT_2, false);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(8), dp(32), dp(8), dp(8));
        body.addView(t);
    }

    private View spinner() {
        LinearLayout box = new LinearLayout(a);
        box.setGravity(Gravity.CENTER);
        box.setPadding(0, dp(32), 0, dp(32));
        box.addView(new ProgressBar(a));
        return box;
    }

    private TextView section(String s) {
        TextView t = Ui.text(a, s, 14, Ui.TEXT_2, true);
        t.setPadding(dp(4), dp(18), 0, dp(8));
        return t;
    }

    private LinearLayout card() {
        LinearLayout c = new LinearLayout(a);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(dp(4), dp(4), dp(4), dp(4));
        c.setBackground(Ui.round(a, Ui.SURFACE, 18));
        return c;
    }

    private LinearLayout row(Runnable onClick) {
        LinearLayout r = new LinearLayout(a);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(12), dp(10), dp(12), dp(10));
        r.setBackground(Ui.ripple(a, 0x00000000, 12));
        r.setClickable(true);
        r.setOnClickListener(v -> onClick.run());
        return r;
    }

    private LinearLayout texts(String main, String sub) {
        LinearLayout t = new LinearLayout(a);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setPadding(dp(12), 0, dp(8), 0);
        t.addView(Ui.oneLine(Ui.text(a, main, 15, Ui.TEXT, true)));
        t.addView(Ui.oneLine(Ui.text(a, sub, 12, Ui.TEXT_2, false)));
        return t;
    }

    private int dp(float v) {
        return Ui.dp(a, v);
    }
}
