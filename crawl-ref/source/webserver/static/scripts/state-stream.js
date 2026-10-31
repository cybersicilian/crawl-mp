/* Versioned JSON deltas. Consumer mutation cannot change the wire baseline. */
define([], function () {
    "use strict";
    var own = Function.call.bind(Object.prototype.hasOwnProperty);
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function apply(state, change) {
        if (!Array.isArray(change) || change.length < 1 || change.length > 2 || !Array.isArray(change[0]))
            throw new Error("Invalid state change");
        var path = change[0];
        if (!path.length) {
            if (change.length !== 2) throw new Error("Cannot delete state root");
            return change[1];
        }
        var target = state;
        path.forEach(function (key, index) {
            if (key === "__proto__" || key === "prototype" || key === "constructor"
                || !(typeof key === "string" || Number.isInteger(key)) || target === null || typeof target !== "object"
                || Array.isArray(target) && (!Number.isInteger(key) || key < 0 || key >= target.length))
                throw new Error("Invalid state path");
            if (index < path.length - 1) {
                if (!own(target, key)) throw new Error("Missing state path");
                target = target[key];
            } else if (change.length === 2) target[key] = change[1];
            else {
                if (Array.isArray(target)) throw new Error("Array deletions require replacement");
                delete target[key];
            }
        });
        return state;
    }
    return function (resync) {
        var streams = Object.create(null), waiting = Object.create(null);
        return {
            reset: function () { streams = Object.create(null); waiting = Object.create(null); },
            accept: function (frame) {
                var channel = frame.channel, previous = streams[channel];
                if (typeof channel !== "string" || !Number.isSafeInteger(frame.revision) || frame.revision < 1) return null;
                try {
                    var state;
                    if (own(frame, "state")) state = clone(frame.state);
                    else {
                        if (!previous || frame.base !== previous.revision || frame.revision !== frame.base + 1
                            || !Array.isArray(frame.changes)) throw new Error("Missing state baseline");
                        state = previous.state;
                        frame.changes.forEach(function (change) { state = apply(state, change); });
                    }
                    if (!state || state.msg !== channel) throw new Error("Invalid state channel");
                    streams[channel] = { state: state, revision: frame.revision };
                    delete waiting[channel];
                    return clone(state);
                } catch (error) {
                    delete streams[channel];
                    if (!waiting[channel]) { waiting[channel] = true; resync(channel); }
                    return null;
                }
            }
        };
    };
});
