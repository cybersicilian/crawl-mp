/* A multiplayer action can wait on a partner. Key auto-repeat would keep adding
 * to that wait, walking the hero on long after the key is released. Ignore
 * repeats until the hero can act again; a fresh press still queues as normal. */
define(["jquery", "./enums", "./party-model"], function ($, enums, model) {
    "use strict";
    var command_mode = false;
    function ignored(state, repeat, command) {
        if (!repeat || !command || !state || !state.multiplayer) return false;
        var slot = model.controlledSlot(state);
        var hero = (state.members || []).find(function (member) { return member.slot === slot; });
        return Boolean(hero && (hero.queued_action || hero.can_act === false));
    }
    function onKey(event) {
        var key = event.originalEvent;
        if (!ignored(window.crawl_party && window.crawl_party.state, Boolean(key && key.repeat), command_mode)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }
    $(document).on("game_input_changed.heldKeys", function (event, mode) {
        command_mode = mode === enums.mouse_mode.COMMAND;
    }).on("game_keydown.heldKeys game_keypress.heldKeys", onKey)
        .on("game_cleanup.heldKeys", function () { command_mode = false; });
    return { ignored: ignored };
});
