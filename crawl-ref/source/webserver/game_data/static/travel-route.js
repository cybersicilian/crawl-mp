/* Asks the engine which cells a click would walk, so a preview can't drift from travel. */
define(["jquery", "comm"], function ($, comm) {
    "use strict";
    var patience = 300, sequence = 0, waiting = null, next = null, timer = null;
    function cells(flat) {
        var route = [];
        for (var index = 0; index + 1 < flat.length; index += 2) route.push({ x: flat[index], y: flat[index + 1] });
        return route;
    }
    function send(question) {
        question.id = ++sequence; waiting = question;
        timer = setTimeout(function () { settle(question.id, null); }, patience);
        if (comm.send_message("travel_route", { id: question.id, x: question.x, y: question.y }) === false)
            settle(question.id, null);
    }
    function settle(id, answer) {
        if (!waiting || waiting.id !== id) return;
        clearTimeout(timer);
        var done = waiting; waiting = null;
        // One question in flight at a time; only the newest one matters.
        if (next) { var question = next; next = null; send(question); }
        else done.callback(answer);
    }
    function ask(target, callback) {
        var question = { x: target.x, y: target.y, callback: callback };
        if (waiting) next = question; else send(question);
    }
    function cancel() {
        next = null;
        if (waiting) waiting.callback = $.noop;
    }
    comm.register_handlers({ travel_route: function (data) {
        settle(data.id, { route: cells(data.route), one_step: data.one_step });
    } });
    return { ask: ask, cancel: cancel };
});
