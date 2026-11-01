/* Reloads the running game so restart-bound settings apply. The player sees a
 * brief curtain; a game that cannot reload now keeps the change for its next start. */
define(["jquery", "comm", "client", "library-ui", "expedition-url", "game-loading"], function ($, comm, client, library, expeditionURL, loading) {
    "use strict";
    var saving = null, reloading = false, curtain = null, safety = null;

    function hide() {
        clearTimeout(safety); saving = null; reloading = false;
        if (curtain) { curtain.remove(); curtain = null; }
    }
    function show() {
        curtain = document.createElement("div");
        curtain.id = "settings_restart_curtain"; curtain.setAttribute("role", "status");
        curtain.textContent = "Applying settings…";
        document.body.appendChild(curtain);
        // Never leave the player behind a curtain if a step goes missing.
        safety = setTimeout(hide, 30000);
    }
    function deferred() {
        library.notice("Saved. These settings apply the next time this expedition starts.");
    }
    // Companions come back with the save, but other players would be sent away.
    function request(pending, shared) {
        var id = client.expedition_id();
        if (saving || reloading || !id || shared || client.is_watching()
            || library.save_status().reason) { deferred(); return; }
        show(); saving = id;
        if (!library.save(true, true)) { hide(); deferred(); }
    }
    $(document).on("lobby_returned.settingsRestart", function () {
        if (!saving) return;
        var destination = expeditionURL.hash(saving), id = saving;
        saving = null; reloading = true;
        if (location.hash === destination) comm.send_message("expedition_open", { id: id });
        else location.hash = destination;
    }).on("library_save_refused.settingsRestart", function () {
        if (!saving && !reloading) return;
        hide(); deferred();
    });
    loading.subscribe(function (blocking) {
        if (reloading && !blocking && client.in_game()) hide();
    });
    return { request: request };
});
