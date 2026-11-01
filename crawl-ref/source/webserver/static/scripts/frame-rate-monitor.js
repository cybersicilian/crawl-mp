/* Visible animation-frame cadence; independent of game turns and network traffic. */
define([], function () {
    "use strict";
    return function (changed) {
        var frame, started, frames = 0, running = false;
        function reset() { started = undefined; frames = 0; }
        function tick(now) {
            frame = undefined;
            if (!running || document.hidden) return;
            if (started === undefined) started = now;
            else frames++;
            var elapsed = now - started;
            if (elapsed >= 1000) {
                changed(Math.round(frames * 1000 / elapsed));
                started = now; frames = 0;
            }
            frame = window.requestAnimationFrame(tick);
        }
        function visibility() {
            if (frame !== undefined) window.cancelAnimationFrame(frame);
            frame = undefined; reset(); changed(null);
            if (running && !document.hidden) frame = window.requestAnimationFrame(tick);
        }
        function stop() {
            running = false;
            document.removeEventListener("visibilitychange", visibility);
            visibility();
        }
        return {
            start: function () {
                stop(); running = true;
                document.addEventListener("visibilitychange", visibility);
                visibility();
            },
            stop: stop
        };
    };
});
