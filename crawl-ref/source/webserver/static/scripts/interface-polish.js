define(["jquery"], function ($) {
    "use strict";
    var controls = ".coop-preset-btn, .dcss-btn, .party-mode-btn, .party-archetype-btn, "
        + ".party-ready-badge, .party-banner-btn, .party-mini-btn, .party-hud-btn, "
        + ".party-preset-chip, .party-ping-btn, .dcss-dock-btn, .party-buff-pill, "
        + ".party-badge, .party-insp-hero-btn, .party-insp-tab-btn, .party-insp-close-btn, "
        + ".party-slot-occupant, .party-slot-modes > span, .dcss-badge-pacing, .dcss-badge-pacing-inline, "
        + "#party_room_ff_badge, .chronicle-entry-badge, .chronicle-load-btn";
    var observers = new WeakMap();
    var headings = {
        "STORED PARTY COMPS": "Saved parties",
        "HALL OF PLAYER GHOSTS (BONES)": "Fallen adventurers",
        "COOL ITEMS & RELICS FOUND": "Relics & discoveries"
    };

    function updateText(element, text) {
        if (element && element.textContent !== text) element.textContent = text;
    }

    function lobbyLabels(root) {
        root.querySelectorAll("#banner").forEach(function (el) {
            // The default greeting duplicates the welcome/account strip. Preserve custom announcements.
            el.classList.toggle("default-welcome-banner",
                /^Welcome to WebTiles!\s*(Hello, [^!]+!)?\s*$/.test(el.textContent));
        });
        root.querySelectorAll("#party_room_title_text").forEach(function (el) {
            updateText(el, el.textContent.replace(/^=+\s*|\s*=+$/g, ""));
        });
        root.querySelectorAll("#party_room_host_text").forEach(function (el) {
            var match = /^\(Host: (.*?) \| Game: .*\)$/.exec(el.textContent);
            if (match) updateText(el, "Hosted by " + match[1] + " · Co-op expedition");
        });
        root.querySelectorAll(".party-slot-title").forEach(function (el) {
            updateText(el, el.textContent.replace(/^Slot (P\d)\s*\[Host\]$/, "$1 · Party leader"));
        });
        root.querySelectorAll("#party_turn_pacing_badge, .dcss-badge-pacing-inline").forEach(function (el) {
            updateText(el, "Simultaneous turns");
        });
        root.querySelectorAll("#btn_toggle_party_ff").forEach(function (el) {
            if (/^FF:/.test(el.textContent))
                updateText(el, el.textContent.includes("(ON)") ? "Friendly fire on" : "Friendly fire off");
        });
        root.querySelectorAll("#party_room_ff_badge").forEach(function (el) {
            if (/CLASSIC|SAFE PARTY/.test(el.textContent))
                updateText(el, el.textContent.includes("(ON)") ? "Enabled" : "Disabled");
        });
        root.querySelectorAll(".chronicle-box-header").forEach(function (el) {
            Array.prototype.forEach.call(el.childNodes, function (node) {
                if (node.nodeType !== Node.TEXT_NODE) return;
                var replacement = headings[node.nodeValue.trim()];
                if (replacement) node.nodeValue = replacement + " ";
            });
        });
    }

    function decorate(root) {
        root.querySelectorAll(controls).forEach(function (el) {
            // Change display punctuation only; bindings, data, and shortcuts stay intact.
            var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            var node;
            while ((node = walker.nextNode())) {
                var text = node.nodeValue.replace(/^(\s*)\[/, "$1").replace(/\](\s*)$/, "$1");
                if (text !== node.nodeValue) node.nodeValue = text;
            }
        });
        if (root.id !== "normal")
            lobbyLabels(root);
    }
    function touchesControls(mutations, root) {
        if (root.id !== "normal") return true;
        for (var i = 0; i < mutations.length; i++) {
            var m = mutations[i];
            var target = m.target && m.target.nodeType === 1 ? m.target : (m.target && m.target.parentElement);
            if (target && (target.matches(controls) || target.closest(controls))) return true;
            if (m.addedNodes) {
                for (var j = 0; j < m.addedNodes.length; j++) {
                    var n = m.addedNodes[j];
                    if (n.nodeType === 1 && (n.matches(controls) || n.querySelector(controls))) return true;
                    if (n.nodeType === 3 && (/\[|\]/.test(n.nodeValue || ""))) return true;
                }
            }
            if (m.type === "characterData" && /\[|\]/.test(m.target.nodeValue || "")) return true;
        }
        return false;
    }
    function observe(root) {
        if (!root || observers.has(root)) return;
        var queued = false;
        var observer = new MutationObserver(function (mutations) {
            if (queued || !touchesControls(mutations, root)) return;
            queued = true;
            requestAnimationFrame(function () { queued = false; decorate(root); });
        });
        observer.observe(root, { childList: true, subtree: true, characterData: true });
        observers.set(root, observer);
        decorate(root);
    }
    $(document).ready(function () { observe(document.getElementById("lobby")); });
    $(document).on("game_init.interface", function () { observe(document.getElementById("normal")); });
    return { observe: observe, decorate: decorate };
});
