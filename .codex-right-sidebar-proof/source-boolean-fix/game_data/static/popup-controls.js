define(["jquery", "comm", "client", "./menu-keyboard", "./menu-presentation"], function ($, comm, client, keyboard, presentation) {
    "use strict";
    function attach(element, depth) {
        element.addClass("workflow-surface");
        presentation.popup(element);
        if (element.children(".workflow-popup-tools").length) return;
        var tools = $("<div class='workflow-popup-tools'></div>");
        var state = window.crawl_party && window.crawl_party.state;
        var hero = state && state.members.find(function (member) { return member.slot === state.active_slot; });
        if (hero) tools.append($("<span class='workflow-popup-hero'></span>").text("P" + (hero.slot + 1) + " · " + hero.name));
        else tools.append($("<span class='workflow-popup-hero'></span>").text("Dungeon journal"));
        $("<button type='button' class='workflow-button'></button>")
            .text(depth > 1 ? "Back " : "Close ").append("<kbd aria-hidden='true'>Esc</kbd>")
            .attr("aria-label", depth > 1 ? "Back to the previous panel" : "Close panel")
            .prop("disabled", client.is_watching()).on("click", function (event) {
                event.stopPropagation(); comm.send_message("key", { keycode: 27 });
            }).appendTo(tools);
        var multiple = element.children(".workflow-selection-tools").length > 0;
        var hint = multiple ? "Click or Space: select · Enter: confirm · Esc: cancel"
            : element.hasClass("workflow-action-menu") ? "Letter keys select · Tab moves between actions · Enter activates"
            : element.hasClass("formatted-scroller") ? "↑ / ↓: scroll · Page Up / Down: page · Esc: return"
            : element.hasClass("menu_txt") ? "Use the letter keys shown below · Esc: return"
                : "Letter keys select · Tab moves focus · Enter activates";
        element.append($("<div class='workflow-key-help workflow-popup-help'></div>").text(hint));
        element.prepend(tools);
    }
    function keydown(element, event) {
        return !client.is_watching() && keyboard.handle(element, event);
    }
    return { attach: attach, keydown: keydown };
});
