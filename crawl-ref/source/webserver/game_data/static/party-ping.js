/* All ping entry points bind their coordinates to the current personal floor. */
define(["comm"], function (comm) {
    "use strict";

    function send(x, y, kind) {
        var state = window.crawl_party && window.crawl_party.state;
        if (!Number.isInteger(x) || !Number.isInteger(y)
            || Math.abs(x) > 256 || Math.abs(y) > 256
            || (state && state.multiplayer && !state.floor)) return false;
        return comm.send_message("party_ping", {
            x: x, y: y, kind: kind || "look", floor: state && state.floor
        });
    }

    return { send: send };
});
