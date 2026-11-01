/* The one Settings control, for the lobby and a running game.
 * Appearance saves through the account API, game preferences through the socket. */
define(["jquery", "comm", "graphics-controls", "graphics-preferences", "rc-settings", "tip-controls"], function ($, comm, controls, preferences, rows, tips) {
    "use strict";
    var dialog = null, opener = null, gameId = null, liveGame = null, request = 0;
    var views = [
        { category: rows.APPEARANCE, rootId: "settings_appearance", create: controls.mount },
        { category: "Tutorial tips", rootId: "settings_tips", create: tips.mount }
    ];
    views.forEach(function (view) { view.defaultCreate = view.create; });
    function mountView(view) {
        if (view.handle) view.handle.destroy();
        view.handle = view.create(document.getElementById(view.rootId));
        rows.attachSection(view.category, view.rootId, view.handle);
    }
    var accountOwner = preferences.snapshot().username || null;
    var queuedOpen = null;
    var waiting = false, closing = false, timer = null, restartHandler = null;

    function shell() {
        dialog = document.createElement("dialog");
        dialog.id = "settings_dialog"; dialog.setAttribute("aria-labelledby", "rc_settings_title");
        dialog.innerHTML = "<div id='settings_shell'>"
            + "<header class='rc-settings-header'><div class='rc-settings-heading'>"
            + "<h2 id='rc_settings_title'>Settings</h2><p id='settings_lede' class='rc-settings-lede'></p></div>"
            + "<p id='rc_settings_warning' class='rc-settings-notice tr-callout tr-callout-warn' hidden></p>"
            + "<p id='rc_settings_error' class='rc-settings-notice rc-settings-notice-error tr-callout tr-callout-danger' role='alert' hidden></p></header>"
            + "<div id='rc_settings_workspace'><div class='rc-settings-toolbar'>"
            + "<div class='rc-search'><label class='rc-search-label' for='rc_settings_search'>Find a setting</label>"
            + "<input id='rc_settings_search' type='search' placeholder='Search every category' autocomplete='off'></div>"
            + "<label class='rc-changed-filter'><input id='rc_settings_changed' type='checkbox'> <span>Customized only</span></label>"
            + "<span id='rc_settings_count' role='status'></span></div>"
            + "<div class='rc-settings-body'><nav id='rc_settings_categories' aria-label='Settings categories'></nav>"
            + "<div class='rc-settings-scroll'><section id='settings_appearance' class='rc-card' aria-label='Appearance and graphics'></section>"
            + "<section id='settings_tips' class='rc-card' aria-label='Tutorial tips'></section><div id='rc_settings_sections'></div>"
            + "<p id='rc_settings_empty' class='rc-settings-empty' hidden>No settings match. Try another search or turn off Customized only.</p>"
            + "</div></div></div>"
            + "<footer class='rc-settings-actions'><span id='rc_settings_status' class='rc-settings-status' role='status' aria-live='polite'></span>"
            + "<button class='rc-action tr-btn' type='button' id='rc_settings_retry' hidden>Try again</button>"
            + "<button class='rc-action tr-btn' type='button' id='rc_settings_undo' disabled>Undo changes</button>"
            + "<button class='rc-action rc-action-primary tr-btn tr-btn-primary' type='button' id='rc_settings_close'>Done <kbd>Esc</kbd></button>"
            + "</footer></div>";
        document.body.appendChild(dialog);
        views.forEach(mountView);
        rows.onChange(schedule);
        document.getElementById("rc_settings_close").addEventListener("click", close);
        dialog.addEventListener("cancel", function (event) { event.preventDefault(); close(); });
        // Nothing typed here may reach the game underneath.
        ["keydown", "keypress", "keyup"].forEach(function (type) {
            dialog.addEventListener(type, function (event) { event.stopPropagation(); });
        });
        $(document).on("graphics_settings_changed.settingsDialog", function (event, state) {
            var owner = state.username || null;
            if (owner !== accountOwner) {
                var previousOwner = accountOwner; accountOwner = owner;
                if (!previousOwner && owner) { if (dialog.open) rows.refresh(); return; }
                request++; waiting = closing = false; queuedOpen = null;
                clearTimeout(timer); timer = null;
                gameId = liveGame = restartHandler = null;
                if (dialog.open) dialog.close();
                opener = null;
            } else if (dialog.open) rows.refresh();
        });
    }
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(flush, 300);
    }
    function flush() {
        clearTimeout(timer); timer = null;
        if (waiting || !gameId) return;
        var changes = rows.take();
        if (!changes) return;
        waiting = true;
        comm.send_message("set_game_settings", { game_id: gameId, changes: changes, request_id: String(++request) });
    }
    // Whatever needs the game reloaded waits until the last save is answered.
    function settle() {
        if (waiting || rows.busy()) return;
        if (queuedOpen) {
            var options = queuedOpen; queuedOpen = null;
            if (dialog.open) dialog.close();
            closing = false; open(options); return;
        }
        if (!closing) return;
        closing = false;
        var pending = rows.restartPending();
        if (pending.length && restartHandler) restartHandler(pending, rows.sharedGame());
    }
    function receive(data, username) {
        if (data.game_id !== gameId || data.request_id !== String(request) || data.username !== username) return;
        var save = waiting; waiting = false;
        if (!data.available) {
            if (save) rows.failed(data.error || "Game settings could not be saved.");
            else rows.showError(data.error || "Game settings are unavailable.");
            closing = false;
            document.getElementById("rc_settings_sections").inert = false;
            return;
        }
        if (save) rows.saved(data); else rows.load(data);
        if (!rows.retrying()) flush();
        settle();
    }
    function close() {
        if (!dialog || !dialog.open) return;
        queuedOpen = null;
        dialog.close();
        var target = opener && opener.isConnected && opener.getClientRects().length ? opener
            : document.getElementById("dock_session_menu") || document.getElementById("dungeon");
        if (target) target.focus({ preventScroll: true });
        opener = null; closing = true;
        flush(); settle();
    }
    function firstLobbyGame() {
        var link = document.querySelector("#play_now .edit_rc_link");
        return link ? String(link.getAttribute("data-game_id")) : null;
    }
    function open(options) {
        options = options || {};
        if (!dialog) shell();
        var target = liveGame || options.gameId || firstLobbyGame();
        if (dialog.open && target === gameId) {
            queuedOpen = null;
            document.getElementById("rc_settings_sections").inert = false;
            if (options.category) rows.select(options.category);
            return;
        }
        if (gameId && target !== gameId && (waiting || rows.busy())) {
            queuedOpen = options;
            document.getElementById("settings_lede").textContent = "Finishing your previous game's settings before opening this game.";
            document.getElementById("rc_settings_sections").inert = true;
            if (!dialog.open) { opener = document.activeElement; dialog.showModal(); }
            flush(); return;
        }
        document.getElementById("rc_settings_sections").inert = false;
        if (!dialog.open) opener = document.activeElement;
        closing = false;
        var tray = document.getElementById("quickbar_more");
        if (tray) tray.open = false;
        var reuse = gameId === target && (waiting || rows.busy());
        if (!reuse) {
            gameId = target; waiting = false;
            rows.loading(options.category);
        } else if (options.category) rows.select(options.category);
        if (!dialog.open) dialog.showModal();
        document.getElementById("rc_settings_search").focus({ preventScroll: true });
        preferences.refresh();
        if (gameId && !reuse) comm.send_message("get_game_settings", { game_id: gameId, request_id: String(++request) });
    }
    $(document).on("game_cleanup.settingsDialog", function () {
        if (!dialog || !dialog.open) return;
        dialog.close(); opener = null; closing = false;
    });
    return { open: open, close: close, receive: receive,
        bindAccountSection: function (category, create) {
            var view = views.find(function (entry) { return entry.category === category; });
            if (!view) return false;
            view.create = create || view.defaultCreate;
            if (dialog) mountView(view);
            return true;
        },
        // The running game names itself here, and says how to reload.
        bindGame: function (id, handler) { liveGame = id; restartHandler = handler; },
        isOpen: function () { return Boolean(dialog && dialog.open); } };
});
