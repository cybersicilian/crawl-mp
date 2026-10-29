/* Retain source nodes, independent scroll, and form state. Consumers supply
 * membership and labels; this mechanism has no routes or data requests. */
define(function () {
    "use strict";
    return function create(options) {
        var current = options.initial, positions = {}, controls = [];
        if (options.storageKey) {
            try {
                var saved = JSON.parse(sessionStorage.getItem(options.storageKey) || "null");
                if (saved && options.views.some(function (view) { return view.id === saved.current; })) {
                    current = saved.current; positions = saved.positions || {};
                }
            } catch (error) { /* Storage is optional, including in private browsing. */ }
        }
        if (options.views.some(function (view) { return view.id === options.requested; })) current = options.requested;
        function remember() {
            if (!options.storageKey) return;
            try { sessionStorage.setItem(options.storageKey, JSON.stringify({ current: current, positions: positions })); }
            catch (error) { /* The workspace still works without persistence. */ }
        }
        function refresh() {
            options.views.forEach(function (view) {
                view.sections.forEach(function (id) {
                    var node = document.getElementById(id);
                    if (!node) return;
                    node.dataset.workspaceView = view.id;
                    node.classList.toggle("workspace-view-hidden", options.enabled() && view.id !== current);
                });
            });
            controls.forEach(function (control) {
                if (control.dataset.workspaceTarget === current) control.setAttribute("aria-current", "page");
                else control.removeAttribute("aria-current");
            });
        }
        function show(id, focus, destination) {
            var view = options.views.find(function (entry) { return entry.id === id; });
            if (!view) return;
            var changed = id !== current;
            if (changed) positions[current] = window.scrollY;
            current = id; remember(); refresh();
            window.requestAnimationFrame(function () {
                var target = destination && document.getElementById(destination);
                if (target) target.scrollIntoView({ block: "start" });
                else if (changed) window.scrollTo(0, positions[id] || 0);
                if (focus) {
                    var section = target || view.sections.map(function (sectionId) {
                        return document.getElementById(sectionId);
                    }).find(function (node) { return node && node.getClientRects().length > 0; });
                    var heading = section && (section.querySelector("h1, h2, .party-hall-title") || section);
                    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
                }
            });
        }
        window.addEventListener("pagehide", function () { positions[current] = window.scrollY; remember(); });
        return { refresh: refresh, show: show, current: function () { return current; },
            register: function (control) { controls.push(control); refresh(); } };
    };
});
