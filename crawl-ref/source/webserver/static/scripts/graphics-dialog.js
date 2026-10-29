/* Reversible personal settings never send native game commands. */
define(["jquery", "graphics-controls", "graphics-preferences"], function ($, controls, preferences) {
    "use strict";
    var dialog, content, opener;
    function close() {
        if (!dialog || !dialog.open) return;
        dialog.close();
        var target = opener && opener.isConnected && opener.getClientRects().length ? opener
            : document.getElementById("dock_session_menu") || document.getElementById("dungeon");
        if (target) target.focus({ preventScroll: true });
        opener = null;
    }
    function ensure() {
        if (dialog) return;
        dialog = document.createElement("dialog"); dialog.id = "graphics_settings_dialog"; dialog.className = "graphics-dialog";
        var top = document.createElement("div"), button = document.createElement("button"), root = document.createElement("section");
        top.className = "graphics-dialog-actions"; button.type = "button"; button.textContent = "Done · Esc";
        button.addEventListener("click", close); top.appendChild(button); dialog.append(top, root); document.body.appendChild(dialog);
        content = controls.mount(root); dialog.setAttribute("aria-labelledby", content.titleId);
        dialog.addEventListener("cancel", function (event) { event.preventDefault(); close(); });
        ["keydown", "keypress", "keyup"].forEach(function (type) {
            dialog.addEventListener(type, function (event) { event.stopPropagation(); });
        });
    }
    $(document).on("game_cleanup.graphicsSettings game_preinit.graphicsSettings", function () {
        if (!dialog) return;
        close(); content.destroy(); dialog.remove(); dialog = content = null;
    });
    return { open: function () {
        opener = document.activeElement; ensure();
        var tray = document.getElementById("quickbar_more"); if (tray) tray.open = false;
        dialog.showModal(); dialog.querySelector("button").focus(); preferences.refresh();
    } };
});
