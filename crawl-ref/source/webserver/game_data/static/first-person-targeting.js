/* First-person pointer -> native targeter. Range, beams, hit rules and actions stay native. */
define(["jquery", "comm", "client", "./game-context", "./map_knowledge", "./view_data", "./enums", "./tileinfo-dngn"],
function ($, comm, client, game, map, view, enums, tiles) {
    "use strict";
    var sequence = 0;
    function isTargetMode(mode) {
        return mode === enums.mouse_mode.TARGET || mode === enums.mouse_mode.TARGET_DIR || mode === enums.mouse_mode.TARGET_PATH;
    }
    function same(a, b) { return Boolean(a && b && a.x === b.x && a.y === b.y); }
    function create(options) {
        var namespace = ".firstPersonTargeting" + (++sequence), previousMode, lastSent = null;
        var hover = null, pending = null, tactical = false, destroyed = false, bar, reticle, status, toggle;
        function mode() { return game.get_input_mode ? game.get_input_mode() : null; }
        function active() {
            return !destroyed && isTargetMode(mode()) && (!game.get_ui_state || game.get_ui_state() === enums.ui.NORMAL)
                && (!client.is_watching || !client.is_watching()) && (!options.enabled || options.enabled());
        }
        function visible(loc) {
            return loc && Number.isInteger(loc.x) && Number.isInteger(loc.y) && map.visible(map.get(loc.x, loc.y));
        }
        function nativeCursor() {
            var loc = view.cursor_locs && view.cursor_locs[enums.CURSOR_MOUSE];
            return visible(loc) ? { x: loc.x, y: loc.y } : null;
        }
        function snapshot() {
            var enabled = active(), native = enabled ? nativeCursor() : null, location = enabled ? pending || native : hover;
            var entry = location && map.get(location.x, location.y), bg = entry && entry.t && enums.prepare_bg_flags(entry.t.bg || 0);
            var acknowledged = Boolean(location && native && same(location, native));
            var out = acknowledged && (bg.OOR || (entry.t.ov || []).indexOf(tiles.RAY_OUT_OF_RANGE) !== -1);
            var label = location && options.label && options.label(location) || entry && (entry.mon && entry.mon.name || entry.feature_name) || "visible tile";
            var kind = mode() === enums.mouse_mode.TARGET_DIR ? "direction" : mode() === enums.mouse_mode.TARGET_PATH ? "path" : "target";
            return { active: enabled, hovering: Boolean(!enabled && hover), mode: kind, tactical: tactical, location: location, nativeLocation: native,
                label: label, range: out ? "out" : "unknown", acknowledged: acknowledged };
        }
        function render() {
            if (!bar) return;
            var state = snapshot();
            bar.hidden = !state.active; reticle.hidden = !state.active || tactical;
            options.canvas.classList.toggle("first-person-targeting-active", state.active && !tactical);
            toggle.textContent = tactical ? "Back to 3D aim" : "Overhead aim";
            toggle.setAttribute("aria-pressed", String(tactical));
            var prefix = state.mode === "direction" ? "Choose direction" : state.mode === "path" ? "Choose path" : "Choose target";
            status.textContent = prefix + (state.location ? " · " + state.label : "")
                + (state.range === "out" ? " · Native target is out of range" : "")
                + " · Click to confirm · Esc to cancel";
            reticle.dataset.range = state.range;
            reticle.textContent = state.range === "out" ? "×" : "+";
        }
        function setTactical(value) {
            var next = Boolean(value && active());
            if (next === tactical) return;
            tactical = next; pending = null; render();
            if (options.onTacticalChange) options.onTacticalChange(next);
        }
        function sync(event) {
            var current = mode();
            if (current !== previousMode) { lastSent = pending = null; previousMode = current; }
            if (event && event.type === "map_cursor_changed") pending = null;
            if (event && event.type === "map_knowledge_cleared") lastSent = pending = null;
            if (!active()) { lastSent = pending = null; setTactical(false); }
            if (!inspectable() || hover && !visible(hover)) hover = null;
            render();
        }
        function inspectable() {
            return !destroyed && mode() === enums.mouse_mode.COMMAND
                && (!game.get_ui_state || game.get_ui_state() === enums.ui.NORMAL)
                && (!options.enabled || options.enabled());
        }
        function pick(event, inspection) {
            if (!(inspection ? inspectable() : active()) || tactical || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
            var rect = options.canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return null;
            var u = (event.clientX - rect.left) / rect.width, v = (event.clientY - rect.top) / rect.height;
            if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
            var loc = options.pick(u * options.canvas.width, v * options.canvas.height);
            if (!visible(loc)) return null;
            return { x: loc.x, y: loc.y, u: u, v: v };
        }
        function aim(loc) {
            var next = { x: loc.x, y: loc.y }; pending = next;
            if (reticle) { reticle.style.left = loc.u * 100 + "%"; reticle.style.top = loc.v * 100 + "%"; }
            if (!same(lastSent, next)) {
                // Failed/disconnected sends are not remembered or replayed later.
                if (comm.send_message("target_cursor", next) !== false) lastSent = next;
            }
            render(); return next;
        }
        function point(event) {
            if (event.ctrlKey || event.button === 2 || event.which === 3) return false;
            var inspecting = !active(), loc = pick(event,inspecting);
            if (!loc) { if (inspecting) { hover=null; if(options.onHoverChange)options.onHoverChange(); } return false; }
            if(inspecting){hover={x:loc.x,y:loc.y};return true;}
            hover=null;aim(loc);return true;
        }
        function confirm(event) {
            if (event.ctrlKey || event.button === 2 || event.which === 3) return false;
            var loc = pick(event); if (!loc) return false;
            aim(loc);
            // The existing mouse_control handler chooses/validates the native
            // target. In particular, out-of-range clicks remain native errors.
            $(options.eventTarget).trigger($.Event("cell_click", { cell: { x: loc.x, y: loc.y }, which: 1,
                shiftKey: event.shiftKey, altKey: event.altKey, ctrlKey: event.ctrlKey,
                clientX: event.clientX, clientY: event.clientY }));
            if (event.preventDefault) event.preventDefault();
            return true;
        }
        function center() {
            var rect = options.canvas.getBoundingClientRect();
            return point({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
        }
        function cancel() {
            if (!active()) return false;
            return comm.send_message("key", { keycode: 27 });
        }
        function mount() {
            if (!options.host) return;
            bar = document.createElement("div"); bar.className = "first-person-targeting-bar"; bar.hidden = true;
            status = document.createElement("span"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
            toggle = document.createElement("button"); toggle.type = "button";
            toggle.addEventListener("click", function (event) {
                setTactical(!tactical);
                if(!tactical&&event.detail>0)options.canvas.focus({preventScroll:true});
            });
            var stop = document.createElement("button"); stop.type = "button"; stop.textContent = "Cancel · Esc";
            stop.addEventListener("click", cancel); bar.append(status, toggle, stop);
            reticle = document.createElement("span"); reticle.className = "first-person-targeting-reticle";
            reticle.hidden = true; reticle.textContent = "+"; reticle.setAttribute("aria-hidden", "true");
            reticle.style.left = reticle.style.top = "50%"; options.host.append(bar, reticle);
            ["keydown", "keypress", "keyup", "mousedown"].forEach(function (name) {
                bar.addEventListener(name, function (event) {
                    event.stopPropagation();
                    if(name === "keydown" && event.key === "Escape") { event.preventDefault(); cancel(); }
                });
            });
        }
        mount();
        function leave(){hover=null;if(options.onHoverChange)options.onHoverChange();}
        options.canvas.addEventListener("pointerleave",leave);
        $(document).on("game_input_changed" + namespace + " game_ui_changed" + namespace
            + " map_cursor_changed" + namespace + " map_knowledge_changed" + namespace + " map_knowledge_cleared" + namespace, sync);
        sync();
        return { active: active, point: point, confirm: confirm, center: center, sync: sync, cancel: cancel,
            setTactical: setTactical, tactical: function () { return tactical; }, snapshot: snapshot,
            destroy: function () {
                destroyed = true; options.canvas.removeEventListener("pointerleave",leave); $(document).off(namespace); lastSent = pending = null; tactical = false;
                if (bar) bar.remove(); if (reticle) reticle.remove();
                options.canvas.classList.remove("first-person-targeting-active");
            } };
    }
    return { create: create, isTargetMode: isTargetMode };
});
