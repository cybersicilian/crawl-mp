/* Coalesce derived presentation work; authoritative state changes stay synchronous. */
define([], function () {
    "use strict";
    return function (update) {
        var frame = null;
        function schedule() {
            if (frame !== null) return;
            frame = window.requestAnimationFrame(function () {
                frame = null;
                update();
            });
        }
        schedule.cancel = function () {
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = null;
        };
        return schedule;
    };
});
