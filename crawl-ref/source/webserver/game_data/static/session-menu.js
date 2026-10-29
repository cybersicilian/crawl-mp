define(["jquery", "client", "library-ui", "./workflow-actions", "./menu-keyboard", "./focus-trap", "graphics-dialog"],
function ($, client, library, actions, keyboard, focusTrap, graphics) {
    "use strict";
    var dialog, trap, opener, escapeHeld = false;

    function available() {
        return client.in_game() && !client.is_watching() && actions.ready()
            && $("#normal").is(":visible") && !$("#ui-stack > *, dialog[open]").length
            && !document.body.classList.contains("hud-layout-editing")
            && !(window.crawl_party && window.crawl_party.armed_ping_kind);
    }
    function update() {
        if (!dialog) return;
        var status = library.save_status();
        $(dialog).find("[data-session-save]").prop("disabled", Boolean(status.reason));
        document.getElementById("session_menu_status").textContent = status.reason
            || "Save your expedition and return to the lobby. You can resume it later.";
    }
    function close() {
        trap.deactivate();
        dialog.close();
        var target = opener; opener = null;
        if (target && target.isConnected) target.focus({ preventScroll: true });
    }
    function ensure() {
        if (dialog) return;
        dialog = $("<dialog id='session_menu' aria-labelledby='session_menu_title' aria-describedby='session_menu_status'>"
            + "<p class='session-menu-eyebrow'>Expedition</p><h1 id='session_menu_title'>Game menu</h1>"
            + "<p id='session_menu_status' role='status'></p><div class='session-menu-actions'>"
            + "<button type='button' class='workflow-button' id='session_menu_resume' autofocus>Resume <kbd>Esc</kbd></button>"
            + "<button type='button' class='workflow-button' data-session-save='continue'>Save</button>"
            + "<button type='button' class='workflow-button' data-session-save='quit'>Save and Quit</button>"
            + "<button type='button' class='workflow-button' data-session-graphics>Appearance &amp; graphics</button>"
            + "<a class='workflow-button' href='/profile' target='_blank' rel='noopener'>Profile &amp; appearance ↗</a>"
            + "</div></dialog>").appendTo("body")[0];
        $(dialog).on("keydown.sessionMenu keypress.sessionMenu keyup.sessionMenu", function (event) {
            event.stopPropagation();
        }).on("click", "#session_menu_resume", close)
            .on("click", "[data-session-graphics]", function () { close(); graphics.open(); })
            .on("click", "[data-session-save]", function () {
                if (library.save(this.getAttribute("data-session-save") === "quit")) close();
            });
        trap = focusTrap(dialog, { escapeDeactivates: false, initialFocus: false, returnFocusOnDeactivate: false });
        dialog.addEventListener("cancel", function (event) { event.preventDefault(); close(); });
    }
    function open() {
        if (!available()) return;
        opener = document.activeElement;
        ensure(); update();
        if (window.dcss_tooltips) window.dcss_tooltips.hide();
        var tray = document.getElementById("quickbar_more");
        if (tray) tray.open = false;
        dialog.showModal();
        trap.activate();
        document.getElementById("session_menu_resume").focus({ preventScroll: true });
    }
    function escape(event) {
        if (event.key !== "Escape") return;
        if (escapeHeld) {
            if (event.type === "keyup") escapeHeld = false;
            keyboard.consume(event); return;
        }
        if (event.type !== "keydown" || event.defaultPrevented || event.isComposing
            || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        if (dialog && dialog.open) {
            escapeHeld = true; keyboard.consume(event);
            if (!event.repeat) close();
            return;
        }
        if (!available() || keyboard.typing(event.target) || $(event.target).closest("#chat, #input_dialog").length
            || $("#quickbar_more[open], .workflow-expedition-details[open]").length) return;
        escapeHeld = true; keyboard.consume(event);
        if (!event.repeat) open();
    }
    function release() { escapeHeld = false; }
    function bind(enabled) {
        var method = enabled ? "addEventListener" : "removeEventListener";
        ["keydown", "keypress", "keyup"].forEach(function (type) { document[method](type, escape, true); });
        window[method]("blur", release); release();
    }
    function init() {
        if (!document.getElementById("dcss_quick_dock")) return;
        if (!document.getElementById("dock_session_menu")) {
            $("<button type='button' class='dcss-dock-btn' id='dock_session_menu' aria-haspopup='dialog' aria-keyshortcuts='Escape'>Menu <kbd>Esc</kbd></button>")
                .on("click", open).appendTo("#dcss_quick_dock");
        }
        bind(true);
    }
    $(document).on("game_library_controls.sessionMenu game_input_changed.sessionMenu", update)
        .on("game_cleanup.sessionMenu", function () {
            bind(false); opener = null;
            if (dialog) { close(); dialog.remove(); dialog = null; trap = null; }
            $("#dock_session_menu").remove();
        });
    return { init: init };
});
