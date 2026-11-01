/* Camera-only input. Native movement remains on compass arrows/vi/numpad.
 * No timers, interpolation, pointer lock or game-command dependencies. */
define([], function () {
    "use strict";
    var levelPitch = -0.07, minPitch = -0.8, maxPitch = 0.65;
    var shortcuts = "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+Home";
    function direction(angle) {
        var names = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
        return names[(Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8];
    }
    function clampPitch(value) { return Math.max(minPitch, Math.min(maxPitch, value)); }
    function editable(target) {
        var element = target && (target.nodeType === 3 ? target.parentElement : target);
        return Boolean(element && element.closest && element.closest(
            "input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox'],.text"));
    }
    function consume(event) {
        event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        else event.stopPropagation();
    }
    function mount(canvas, options) {
        if (!options || typeof options.allowed !== "function" || typeof options.snapshot !== "function"
            || typeof options.onChange !== "function") throw new Error("Camera controls require explicit state and eligibility callbacks");
        var root = options.keyboardRoot || canvas, doc = canvas.ownerDocument;
        var win = doc && doc.defaultView, drag = null, destroyed = false, listeners = [], claimed = new Set();
        var oldShortcuts = canvas.getAttribute("aria-keyshortcuts");
        var advertised = [oldShortcuts, shortcuts].filter(Boolean).join(" ");
        canvas.setAttribute("aria-keyshortcuts", advertised);
        function enabled() { return !destroyed && options.allowed() && !(doc && doc.hidden); }
        function view() {
            var value = options.snapshot();
            return { angle: Number.isFinite(value.angle) ? value.angle : -Math.PI / 2,
                pitch: Number.isFinite(value.pitch) ? clampPitch(value.pitch) : levelPitch };
        }
        function publish(angle, pitch, source) {
            if (!enabled()) return false;
            options.onChange({ angle: angle, pitch: clampPitch(pitch) }, source);
            return true;
        }
        function turn(amount) { var current = view(); return publish(current.angle + amount, current.pitch, "control"); }
        function level() { var current = view(); return publish(current.angle, levelPitch, "control"); }
        function release(pointer) {
            try {
                if (canvas.releasePointerCapture && canvas.hasPointerCapture && canvas.hasPointerCapture(pointer))
                    canvas.releasePointerCapture(pointer);
            } catch (ignored) { /* The browser may already have released a cancelled pointer. */ }
        }
        function cancelDrag() {
            var previous = drag; drag = null;
            if (previous) release(previous.id);
        }
        function cancel() { cancelDrag(); claimed.clear(); }
        function on(target, type, handler, capture) {
            if (!target || !target.addEventListener) return;
            target.addEventListener(type, handler, Boolean(capture));
            listeners.push(function () { target.removeEventListener(type, handler, Boolean(capture)); });
        }
        function down(event) {
            if (event.isPrimary === false) { cancelDrag(); return; }
            if (!enabled() || event.button !== 0 || event.ctrlKey || event.metaKey) return;
            cancelDrag();
            var current = view();
            consume(event); canvas.focus({ preventScroll: true });
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
                angle: current.angle, pitch: current.pitch, moved: false };
            try { if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId); }
            catch (ignored) { /* Pointerleave cancels safely if capture is unavailable. */ }
        }
        function move(event) {
            if (!drag) { if (enabled() && options.onHover) options.onHover(event); return; }
            if (drag.id !== event.pointerId) return;
            if (!enabled()) { cancelDrag(); return; }
            var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (Math.hypot(dx, dy) > 5) drag.moved = true;
            if (!drag.moved) return;
            consume(event); publish(drag.angle + dx * 0.005, drag.pitch - dy * 0.004, "pointer");
        }
        function up(event) {
            if (!drag || drag.id !== event.pointerId) return;
            var click = enabled() && !drag.moved; cancelDrag(); consume(event);
            if (click && options.onClick) options.onClick(event);
        }
        function context(event) {
            if (!enabled()) return;
            cancelDrag(); consume(event);
            if (options.onContextMenu) options.onContextMenu(event);
        }
        function keydown(event) {
            if (event.defaultPrevented || event.isComposing || editable(event.target) || !enabled()) return;
            if (event.key === "Escape" && drag) { consume(event); cancelDrag(); return; }
            if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") {
                if (!options.onContextMenu) return;
                consume(event); claimed.add(event.key);
                var rect = canvas.getBoundingClientRect();
                options.onContextMenu({ type: "contextmenu", button: 2, which: 3,
                    clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
                return;
            }
            if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            var current = view(), angle = current.angle, pitch = current.pitch;
            if (event.key === "ArrowLeft") angle -= Math.PI / 4;
            else if (event.key === "ArrowRight") angle += Math.PI / 4;
            else if (event.key === "ArrowUp") pitch += 0.12;
            else if (event.key === "ArrowDown") pitch -= 0.12;
            else if (event.key === "Home") pitch = levelPitch;
            else return;
            consume(event); claimed.add(event.key); publish(angle, pitch, "keyboard");
        }
        function finishKey(event) {
            if (!claimed.has(event.key)) return;
            consume(event); if (event.type === "keyup") claimed.delete(event.key);
        }
        on(canvas, "pointerdown", down);
        on(canvas, "pointermove", move);
        on(canvas, "pointerup", up);
        on(canvas, "pointercancel", cancelDrag);
        on(canvas, "lostpointercapture", cancelDrag);
        on(canvas, "pointerleave", function () {
            if (drag && (!canvas.hasPointerCapture || !canvas.hasPointerCapture(drag.id))) cancelDrag();
        });
        on(canvas, "contextmenu", context);
        on(canvas, "mousedown", function (event) { if (enabled()) event.stopPropagation(); });
        on(root, "keydown", keydown, true);
        on(root, "keypress", finishKey, true);
        on(root, "keyup", finishKey, true);
        on(win, "blur", cancel);
        on(doc, "visibilitychange", function () { if (doc.hidden) cancel(); });
        return { turn: turn, level: level, cancel: cancel,
            state: function () { return { dragging: Boolean(drag), moved: Boolean(drag && drag.moved), view: view() }; },
            destroy: function () {
                if (destroyed) return;
                cancel(); destroyed = true; listeners.forEach(function (remove) { remove(); }); listeners = [];
                if (canvas.getAttribute("aria-keyshortcuts") === advertised) {
                    if (oldShortcuts === null) canvas.removeAttribute("aria-keyshortcuts");
                    else canvas.setAttribute("aria-keyshortcuts", oldShortcuts);
                }
            } };
    }
    return { mount: mount, direction: direction, clampPitch: clampPitch, levelPitch: levelPitch,
        shortcuts: shortcuts, help: "Drag to look · Alt+arrows look · Alt+Home levels · movement uses compass directions" };
});
