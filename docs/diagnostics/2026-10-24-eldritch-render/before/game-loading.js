/* Readiness for one game view, independent of the loading screen's presentation.
 * Rendering can change native layers before the first playable scene exists. */
define([], function () {
    "use strict";

    var pending = false, layer = "loader", popups = 0, ready = {}, listeners = [];
    var requirements = ["assets", "player", "map"];

    function blocking() {
        return pending && !popups && (layer === "loader" || layer === "normal");
    }

    function notify() {
        listeners.forEach(function (listener) { listener(blocking()); });
    }

    function cancel() {
        pending = false;
        popups = 0;
        ready = {};
        notify();
    }

    return {
        begin: function () {
            pending = true;
            layer = "loader";
            popups = 0;
            ready = {};
            notify();
        },
        mark: function (requirement) {
            if (!pending || requirements.indexOf(requirement) === -1 || ready[requirement]) return;
            ready[requirement] = true;
            if (requirements.every(function (key) { return ready[key]; })) pending = false;
            notify();
        },
        setLayer: function (next) {
            layer = next;
            if (next === "lobby") cancel();
            else notify();
        },
        setPopupCount: function (count) {
            popups = count;
            notify();
        },
        cancel: cancel,
        blocking: blocking,
        subscribe: function (listener) {
            listeners.push(listener);
            listener(blocking());
        }
    };
});
