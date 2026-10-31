define(["jquery", "comm", "client", "./textinput", "./util", "./options", "./nested-tips", "./message-references", "scrollback", "./inspection-dialog", "./party-model"],
function ($, comm, client, textinput, util, options, nested, references, scrollback, inspection, party) {
    "use strict";

    var more = false;
    var old_scroll_top;
    var history_limit = 500;
    // msg_channel_type from mpr.h; presentation classes only, the text is native.
    var channel_classes = { 1: "friend", 2: "prompt", 3: "god", 4: "duration", 5: "danger", 6: "warn",
        7: "recovery", 8: "sound", 9: "talk", 10: "talk", 11: "gain", 12: "mutation", 13: "monster-spell",
        14: "monster-enchant", 15: "friend", 16: "friend", 17: "monster-damage", 18: "target",
        19: "banishment", 20: "equipment", 21: "floor", 22: "multiturn", 23: "examine", 24: "examine",
        25: "diagnostic", 26: "error", 27: "tutorial", 28: "orb", 29: "portal", 30: "hell",
        31: "monster-warning", 32: "dgl", 33: "flavour", 34: "timeout" };
    var damage_pattern = /\b(?:hits|bites|claws|stings|kicks|punches|headbutts|gores|touches|engulfs|pecks|nips|slaps|whips|burns|freezes|shocks|tail-slaps|constricts|crushes|strikes|stabs|slashes|bludgeons|impales|chops|blasts|scorches|drains)\s+you\b|\byou are (?:hit|burned|frozen|shocked|engulfed|poisoned|wounded)\b/i;

    function hero_name(slot)
    {
        var state = window.crawl_party && window.crawl_party.state;
        var member = state && state.members && state.members.find(function (entry) { return entry.slot === slot; });
        return member && member.name ? member.name : "P" + (slot + 1);
    }

    function hide()
    {
        old_scroll_top = $("#messages_container").scrollTop();
        $("#messages").hide();
    }

    function show()
    {
        $("#messages").show();
        $("#messages_container").scrollTop(old_scroll_top);
    }

    var prefix_glyph_classes = "turn_marker command_marker";
    function set_last_prefix_glyph(text, classes)
    {
        var last_msg_elem = $("#messages .game_message").last();
        var prefix_glyph = last_msg_elem.find(".prefix_glyph");
        prefix_glyph.text(text);
        prefix_glyph.addClass(classes);
    }

    function new_command(new_turn)
    {
        $("#more").hide();
        if (new_turn)
            set_last_prefix_glyph("_", "turn_marker");
        else
            set_last_prefix_glyph("_", "command_marker");
    }

    /**
    * Remove all message elements from the player messages window save for the
    * last 500 entries, retaining useful scrollback within a bounded DOM.

    * This is necessary to prevent <div> elements from messages no longer in
    * view from pilling up over longer WebTiles session and thus slowing down
    * the browser.
    */
    function remove_old_messages()
    {
        var all_messages = $("#messages .game_message");
        var keep = history_limit;
        if (all_messages.length > keep)
        {
            var messages_to_remove = all_messages.slice(0, -keep);
            messages_to_remove.remove();
        }
    }

    function add_message(data)
    {
        var msg_elem = $("<div>");
        $("#messages").append(msg_elem);
        msg_elem.addClass("game_message");
        var text = typeof data.text === "string" ? data.text : "";
        var channel = Number.isInteger(data.channel) ? data.channel : null;
        if (channel !== null)
        {
            msg_elem.attr("data-channel", channel);
            if (channel_classes[channel]) msg_elem.addClass("msg-" + channel_classes[channel]);
        }
        if (channel === 5 || damage_pattern.test(text))
            msg_elem.addClass("is-damage");
        if (Number.isInteger(data.turn))
        {
            // The first line of a new game turn carries the separator; rollback
            // removes whole messages, so separators never outlive their line.
            msg_elem.attr("data-turn", data.turn);
            var previous = msg_elem.prev(".game_message");
            if (!previous.length || Number(previous.attr("data-turn")) !== data.turn)
                msg_elem.addClass("is-turn-start");
        }
        if (Number.isInteger(data.recipient) && data.recipient >= 0)
        {
            var colours = party && party.colours || [];
            msg_elem.addClass("msg-hero").attr({ "data-hero-slot": data.recipient, "data-hero-name": hero_name(data.recipient) });
            if (colours.length) msg_elem.css("--msg-hero", colours[data.recipient % colours.length]);
        }
        var prefix_glyph = $("<span></span>");
        prefix_glyph.addClass("prefix_glyph");
        prefix_glyph.html("&nbsp;");
        msg_elem.html(prefix_glyph);
        msg_elem.append(util.formatted_string_to_html(text));
        // Glossary terms in the log open (nestable) tooltips on hover.
        nested.linkify(msg_elem[0]);
    }

    function rollback(count)
    {
        $("#messages .game_message").slice(-count).remove();
    }

    function handle_messages(msg)
    {
        var container = document.getElementById("messages_container");
        var position = scrollback.capture(container, document.querySelectorAll("#messages .game_message"));
        if (msg.rollback)
            rollback(msg.rollback);
        if (msg.old_msgs)
            rollback(msg.old_msgs);
        if ("more" in msg)
        {
            more = msg.more;
            if ("more_text" in msg && msg.more_text.length > 0)
                $("#more").text(msg.more_text);
            else
                $("#more").text("--more--");
        }
        $("#more").toggle(more);
        if (msg.messages)
        {
            for (var i = 0; i < msg.messages.length; ++i)
            {
                add_message(msg.messages[i]);
            }
        }
        var cursor = $("#text_cursor");
        if (cursor.length > 0)
            cursor.appendTo($("#messages .game_message").last());
        remove_old_messages();
        scrollback.restore(container, position);
    }

    function history() {
        var copy = document.createElement("div");
        document.querySelectorAll("#messages .game_message").forEach(function (entry) {
            var line = document.createElement("p"); line.textContent = entry.textContent; copy.appendChild(line);
        });
        inspection.showContent("Message history", copy, "Recent game messages. Viewing takes no turn.");
    }

    function messages_key_handler()
    {
        return !textinput.input_active();
    }

    function text_cursor(data)
    {
        if (data.enabled)
        {
            if ($("#text_cursor").length > 0)
                return;
            if (textinput.input_active() &&
                textinput.input_type() == "messages" &&
                textinput.find_input().length > 0)
            {
                return;
            }
            var cursor = $("<span id='text_cursor'>_</span>");
            $("#messages .game_message").last().append(cursor);
        }
        else
        {
            $("#text_cursor").remove();
        }
    }

    options.add_listener(function ()
    {
        if (options.get("tile_font_msg_size") === 0)
            $("#message_pane").css("font-size", "");
        else
        {
            $("#message_pane").css("font-size",
                options.get("tile_font_msg_size") + "px");
        }

        var family = options.get("tile_font_msg_family");
        if (family !== "" && family !== "monospace")
        {
            family += ", monospace";
            document.documentElement.style.setProperty("--msg-font", family);
        }
    });

    comm.register_handlers({
        "msgs": handle_messages,
        "text_cursor": text_cursor
    });

    $(document).off("game_init.messages")
        .on("game_init.messages", function () {
            more = false;
            $("#more").attr({ role: "status", "aria-live": "polite", "data-tip-title": "More messages",
                "data-tip-body": "Press any key to continue reading. The game waits for you." });
            $("#messages_container").attr({ tabindex: 0, role: "region", "aria-label": "Combat log" })
                .off(".messageScroll").on("keydown.messageScroll keypress.messageScroll", function (event) {
                    // Arrow/Page/Home/End keys scroll this region without also moving a hero.
                    event.stopPropagation();
                });
            $(document).off("game_keydown.messages game_keypress.messages")
                .on("game_keydown.messages", messages_key_handler)
                .on("game_keypress.messages", messages_key_handler);
        }).on("game_message_history.messages", history);

    return {
        hide: hide,
        show: show,
        new_command: new_command
    };
});
