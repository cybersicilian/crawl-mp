/* The server owns a game's presentation. Local maps never change that mode. */
define(["jquery", "comm"], function ($, comm) {
    "use strict";
    var mode = "overhead", identifier = null;
    function theme() { document.documentElement.dataset.expeditionView = mode; }
    function receive(data) {
        mode = data.mode === "first_person" ? "first_person" : "overhead";
        identifier = data.expedition_id || null;
        theme();
        $(document).trigger("expedition_presentation_changed", [mode]);
    }
    comm.register_handlers({ game_presentation: receive });
    $(document).on("game_preinit.expeditionPresentation game_cleanup.expeditionPresentation", function () {
        mode = "overhead"; identifier = null;
        theme();
    });
    return { current: function () { return mode; }, identifier: function () { return identifier; } };
});
