/* Cache warming spread across idle time. Tasks run in bounded slices between
 * paints and never inside one; a task returns true while it has work left. */
define([], function () {
    "use strict";
    var tasks = new Map(), scheduled = false, slice = 6;
    function now() { return window.performance && window.performance.now ? window.performance.now() : Date.now(); }
    function run(deadline) {
        scheduled = false;
        var started = now(), idle = deadline && typeof deadline.timeRemaining === "function";
        function remaining() { return idle ? Math.min(deadline.timeRemaining(), slice) : slice - (now() - started); }
        tasks.forEach(function (task, name) {
            if (remaining() <= 0) return;
            var more = false;
            try { more = task(remaining); } catch (error) { more = false; }
            if (!more) tasks.delete(name);
        });
        if (tasks.size) schedule();
    }
    function schedule() {
        if (scheduled) return;
        if (typeof window.requestIdleCallback === "function") { scheduled = true; window.requestIdleCallback(run, { timeout: 100 }); }
        else if (typeof window.setTimeout === "function") { scheduled = true; window.setTimeout(run, 16); }
    }
    return { add: function (name, task) { tasks.set(name, task); schedule(); },
        cancel: function (name) { tasks.delete(name); }, pending: function () { return tasks.size; } };
});
