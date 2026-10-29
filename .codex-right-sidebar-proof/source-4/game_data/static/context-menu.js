// Presentation and input ownership only; callers supply actions and freshness checks.
define(["jquery"], function ($) {
    "use strict";
    var current = null, held = new Set(), dismissedPointer = false;
    function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    function close(restore) {
        if (!current) return;
        var previous = current; current = null;
        previous.root.remove();
        if (previous.anchor) previous.anchor.setAttribute("aria-expanded", "false");
        if (restore !== false && previous.anchor && previous.anchor.isConnected)
            previous.anchor.focus({ preventScroll: true });
    }
    function fresh() {
        return current && current.anchor.isConnected && (!current.valid || current.valid());
    }
    function open(event, spec) {
        consume(event); close(false);
        if (!spec || !spec.entries.length) return;
        var anchor = event.currentTarget || event.target;
        var parent = $(anchor).closest("dialog[open], .menu, .formatted-scroller, .ui-popup-inner")[0] || document.body;
        var root = $("<div class='game-context-menu' role='menu' tabindex='-1' popover='manual'></div>")
            .attr("aria-label", spec.title).append($("<div class='game-context-title' role='presentation'></div>").text(spec.title))
            .appendTo(parent);
        current = { root: root, anchor: anchor, valid: spec.valid };
        spec.entries.forEach(function (entry) {
            var button = $("<button type='button' role='menuitem' tabindex='-1'></button>")
                .attr({ "aria-disabled": String(Boolean(entry.disabled)), title: entry.disabled || entry.detail || "" })
                .toggleClass("is-consequential", Boolean(entry.consequential))
                .append($("<span></span>").text(entry.label));
            if (entry.disabled || entry.detail) button.append($("<small></small>").text(entry.disabled || entry.detail));
            button.on("click", function (click) {
                consume(click);
                if (!fresh()) { close(); return; }
                if (entry.disabled) return;
                close(); entry.run();
            });
            root.append(button);
        });
        root.on("contextmenu", consume);
        if (root[0].showPopover) root[0].showPopover();
        var bounds = anchor.getBoundingClientRect();
        var keyboard = event.type === "keydown" || (!event.clientX && !event.clientY);
        var x = keyboard ? bounds.left : event.clientX, y = keyboard ? bounds.bottom : event.clientY;
        var box = root[0].getBoundingClientRect(), gap = 8;
        root.css({ left: Math.max(gap, Math.min(x, window.innerWidth - box.width - gap)),
            top: Math.max(gap, Math.min(y, window.innerHeight - box.height - gap)) });
        anchor.setAttribute("aria-expanded", "true");
        root.find("[role='menuitem']").first()[0].focus({ preventScroll: true });
        if (window.dcss_tooltips) window.dcss_tooltips.hide();
        $("#tooltip").hide();
    }
    function bind(element, builder) {
        return $(element).attr("aria-haspopup", "menu").off(".gameContext")
            .on("contextmenu.gameContext", function (event) { open(event, builder()); })
            .on("keydown.gameContext", function (event) {
                if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) open(event, builder());
            });
    }
    function keyboard(event) {
        var key = event.code || event.key;
        if (held.has(key) && event.type !== "keydown") {
            if (event.type === "keyup") held.delete(key);
            consume(event); return;
        }
        if (!current) {
            // A held activation key must not repeat into the game after dismissal.
            if (held.has(key)) consume(event);
            return;
        }
        if (event.type === "keydown" && event.key === "Tab") {
            held.add(key); close(); event.stopImmediatePropagation();
            return; // Let the browser advance from the restored owner in one keypress.
        }
        consume(event);
        if (event.type !== "keydown") return;
        held.add(key);
        if (!fresh()) { close(); return; }
        if (event.key === "Escape") { close(); return; }
        var buttons = current.root.find("[role='menuitem']").toArray();
        var index = buttons.indexOf(document.activeElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
                : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
            buttons[index].focus({ preventScroll: true });
            buttons[index].scrollIntoView({ block: "nearest" });
        } else if (!event.repeat && (event.key === "Enter" || event.key === " ") && index >= 0) buttons[index].click();
    }
    ["keydown", "keypress", "keyup"].forEach(function (type) { window.addEventListener(type, keyboard, true); });
    document.addEventListener("mousedown", function (event) {
        dismissedPointer = false;
        if (current && !current.root[0].contains(event.target)) {
            dismissedPointer = event.button === 0;
            close(); consume(event);
        }
    }, true);
    document.addEventListener("click", function (event) {
        if (dismissedPointer) { dismissedPointer = false; consume(event); }
    }, true);
    document.addEventListener("focusin", function (event) {
        if (current && !current.root[0].contains(event.target)) close(false);
    }, true);
    window.addEventListener("blur", function () { close(false); held.clear(); dismissedPointer = false; });
    window.addEventListener("resize", function () { close(); });
    document.addEventListener("scroll", function (event) {
        if (current && !current.root[0].contains(event.target)) close();
    }, true);
    $(document).on("game_cleanup.contextMenu game_popup_changed.contextMenu", function () { close(false); })
        .on("party_state_rendered.contextMenu game_actions_changed.contextMenu dungeon_tiles_changed.contextMenu", function () {
            if (current && !fresh()) close();
        });
    return { open: open, bind: bind, close: close, isOpen: function () { return Boolean(current); } };
});
