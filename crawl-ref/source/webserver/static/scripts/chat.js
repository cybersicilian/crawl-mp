define(["jquery", "comm", "chat-items", "scrollback"], function ($, comm, items, scrollback) {
    "use strict";
    var new_message_count = 0;
    var spectators = {
            count: 0,
            names: ""
    };
    var history_limit = 25;
    var message_history = [];
    var unsent_message = { text: "", tags: [] };
    var draft_tags = [];
    var history_pos = -1;
    var chat_hidden = false;
    var history_position = null;

    function update_spectators(data)
    {
        delete data["msg"];
        $.extend(spectators, data);
        let spectatorsLabel = data.count === 1 ? "spectator" : "spectators";
        $("#spectator_count").html(`${data.count} ${spectatorsLabel}`);
        $("#spectator_list").html(data.names);
        $(document).trigger("spectators_changed", [spectators]);
    }

    // Hero colour tags come from the authoritative party state when a sender
    // can be matched to a seat; otherwise lines stay neutral.
    function hero_slot(sender)
    {
        var state = window.crawl_party && window.crawl_party.state;
        var members = state && state.members;
        if (!members || typeof sender !== "string" || !sender) return null;
        var needle = sender.trim().toLocaleLowerCase();
        for (var i = 0; i < members.length; i++)
        {
            var m = members[i];
            var names = [m.username, m.owner, m.player, m.account, m.name].filter(function (value) {
                return typeof value === "string";
            });
            if (names.some(function (value) { return value.trim().toLocaleLowerCase() === needle; }))
                return typeof m.slot === "number" ? m.slot : i;
        }
        return null;
    }

    function tag_hero(msg, sender)
    {
        var slot = hero_slot(sender);
        if (slot === null) return;
        msg.attr("data-hero-slot", String(slot % 4)).addClass("chat-line-hero");
    }

    function receive_message(data)
    {
        var msg = $("<span class='chat-line'></span>");
        if (typeof data.text === "string" && typeof data.sender === "string")
        {
            msg.append($("<span class='chat_sender'></span>").text(data.sender),
                $("<span class='chat_msg'></span>").append(items.render(data.text, data.tags, data.sender)));
            tag_hero(msg, data.sender);
        }
        else
        {
            append_legacy_message(msg, data);
            tag_hero(msg, msg.find(".chat_sender").first().text());
        }
        msg.toggleClass("chat-line-system", !!data.meta || !msg.find(".chat_sender").length);
        msg.find("a[target='_blank']").attr("rel", "noopener noreferrer");
        var histcon = $('#chat_history_container')[0];
        if (!histcon) return;
        var visible = $("#chat").is(":visible") && $("#chat_body").is(":visible");
        if (visible) history_position = scrollback.capture(histcon, histcon.querySelectorAll(".chat-line"));
        $("#chat_history").append(msg);
        if (visible) scrollback.restore(histcon, history_position);
        if ($("#chat_body").css("display") === "none" && !data.meta)
        {
            new_message_count++;
            update_message_count();
        }
        $(document).trigger("chat_message", [data.content]);
    }

    // Legacy notifications retain their roles; only text and safe links enter
    // the live DOM. Player-authored content always uses the structured branch.
    function append_legacy_message(target, data)
    {
        var parsed = new DOMParser().parseFromString(String(data.content || ""), "text/html");
        var sender = parsed.querySelector(".chat_sender");
        var senderName = sender ? sender.textContent : "";
        function append(node, parent) {
            if (node.nodeType === 3) { parent.append(document.createTextNode(node.textContent)); return; }
            if (node.nodeType !== 1 || /^(SCRIPT|STYLE|IFRAME|OBJECT)$/.test(node.tagName)) return;
            var element = $("<span></span>");
            ["chat_sender", "chat_msg", "chat_automated", "player", "watcher"].forEach(function (name) {
                if (node.classList.contains(name)) element.addClass(name);
            });
            if (node.classList.contains("chat_msg"))
                element.append(items.render(node.textContent, data.tags, senderName));
            else
                Array.prototype.forEach.call(node.childNodes, function (child) { append(child, element); });
            parent.append(element);
        }
        Array.prototype.forEach.call(parsed.body.childNodes, function (node) { append(node, target); });
    }

    function current_draft()
    {
        var text = $("#chat_input").val() || "";
        return { text: text, tags: items.relevant(text, draft_tags) };
    }

    function restore_draft(draft)
    {
        $("#chat_input").val(draft.text);
        draft_tags = draft.tags.slice();
    }

    function tag_item(item)
    {
        item = items.normalize(item);
        if (!item) return;
        focus();
        var input = $("#chat_input")[0];
        if (!input || $(input).css("display") === "none") return;
        var current = current_draft();
        if (current.tags.length >= 8 && !current.tags.some(function (tag) { return tag.name === item.name; }))
        {
            $("#chat_compose_status").text("You can tag up to eight items in one message.");
            return;
        }
        var start = input.selectionStart === null ? input.value.length : input.selectionStart;
        var end = input.selectionEnd === null ? start : input.selectionEnd;
        var insertion = (start && !/\s$/.test(input.value.slice(0, start)) ? " " : "") + items.token(item) + " ";
        var next = input.value.slice(0, start) + insertion + input.value.slice(end);
        if (input.maxLength > 0 && next.length > input.maxLength)
        {
            $("#chat_compose_status").text("This item tag would exceed the message length limit.");
            return;
        }
        input.value = next;
        input.setSelectionRange(start + insertion.length, start + insertion.length);
        draft_tags = current.tags.filter(function (tag) { return tag.name !== item.name; }).concat([item]);
        $("#chat_compose_status").text(item.name + " added to your message.");
    }

    function show_in_chat(text)
    {
        receive_message({"content": text});
    }

    function handle_dump(data)
    {
        var msg = $("<span>").addClass("chat_msg chat_automated")
                             .text(data.url + ".txt")
        receive_message({ content: msg[0].outerHTML });
    }

    function update_message_count()
    {
        var press_key = new_message_count > 0 ? " (Press F12)" : "";
        $("#message_count").html(new_message_count + " new messages" + press_key);
        $("#message_count").toggleClass("has_new", new_message_count > 0);
        $(document).trigger("chat_unread_changed", [new_message_count]);
    }

    function chat_message_send(e)
    {
        // The Enter key sends a message.
        if (e.which == 13 && !(e.originalEvent && e.originalEvent.isComposing))
        {
            var draft = current_draft();
            var content = draft.text;
            e.preventDefault();
            e.stopPropagation();
            if (content != "")
            {
                var payload = { text: content };
                if (draft.tags.length) payload.tags = draft.tags;
                comm.send_message("chat_msg", payload);
                $("#chat_input").val("");
                draft_tags = [];
                items.close(false);
                $('#chat_history_container').scrollTop($('#chat_history_container')[0].scrollHeight);
                message_history.unshift(draft);
                if (message_history.length > history_limit)
                    message_history.length = history_limit;
                history_pos = -1;
                unsent_message = { text: "", tags: [] };
                $("#chat_compose_status").text("Message sent.");
            }
            return false;
        }
        // Up arrow to access message history.
        else if (e.which == 38 && !e.shiftKey)
        {
            e.preventDefault();
            e.stopPropagation();
            var lim = Math.min(message_history.length, history_limit)
            if (message_history.length && history_pos < lim - 1)
            {
                /* Save any unsent input line before reading history so it can
                 * be reloaded after going past the beginning of message
                 * history with down arrow. */
                if (history_pos == -1)
                    unsent_message = current_draft();
                restore_draft(message_history[++history_pos]);
            }
        }
        // Down arrow to access message history and any unsent message.
        else if (e.which == 40 && !e.shiftKey)
        {
            e.preventDefault();
            e.stopPropagation();
            if (message_history.length && history_pos > -1)
            {
                var message;
                if (history_pos == 0)
                {
                    message = unsent_message;
                    history_pos--;
                }
                else
                    message = message_history[--history_pos];
                restore_draft(message);
            }
        }
        // Esc key or F12 again to return to game.
        else if (e.which == 27 || e.which == 123)
        {
            e.preventDefault();
            e.stopPropagation();
            toggle();
            $(document.activeElement).blur();
        }
        return true;
    }

    function toggle()
    {
        if ($("#chat_body").css("display") === "none")
        {
            $("#chat").show();
            $("#chat_body").show();
            $("#chat_caption").attr("aria-expanded", "true");
            new_message_count = 0;
            update_message_count();
            $("#message_count").html("(Esc: close)");
            scrollback.restore(document.getElementById("chat_history_container"), history_position);
        }
        else
        {
            var container = document.getElementById("chat_history_container");
            history_position = scrollback.capture(container, container.querySelectorAll(".chat-line"));
            items.close(false);
            $("#chat_body").hide();
            $("#chat_caption").attr("aria-expanded", "false");
            if ($("#dock_chat_btn").length)
                $("#chat").hide();
            update_message_count();
        }
    }

    function toggle_entire_chat()
    {
        if ($("#chat").css("display") === "none")
        {
            chat_hidden = false;
            // slide looks odd if the chat box is already 1 line
            if ($("#chat_body").css("display") === "none")
                $("#chat").show();
            else
            {
                $("#chat").slideDown(200);
                scrollback.restore(document.getElementById("chat_history_container"), history_position);
            }
        }
        else
        {
            var container = document.getElementById("chat_history_container");
            history_position = scrollback.capture(container, container.querySelectorAll(".chat-line"));
            chat_hidden = true;
            items.close(false);
            $(document.activeElement).blur();
            // slide looks odd if the chat box is already 1 line
            if ($("#chat_body").css("display") === "none")
                $("#chat").hide();
            else
                $("#chat").slideUp(200);
        }
        $("#chat_hidden").toggle(chat_hidden && !$("#dock_chat_btn").length);
    }

    function super_hide_chat()
    {
        // this hides chat and deletes the + div, so needs a reload or logout
        // to get back the chat window.
        if ($("#chat").css("display") != "none")
            toggle_entire_chat();
        $("#chat_hidden").remove();
    }

    function reset_visibility(in_game)
    {
        if (!in_game)
        {
            $("#chat").hide()
            $("#chat_hidden").hide()
        }
        else
        {
            var docked = $("#dcss_quick_dock").length > 0;
            $("#chat").toggle(!chat_hidden && (!docked || $("#chat_body").is(":visible")));
            $("#chat_hidden").toggle(chat_hidden && !docked);
        }
    }

    function focus()
    {
        if (!$("#chat_hidden").length)
            return;
        var container = document.getElementById("chat_history_container");
        if ($("#chat").is(":visible") && $("#chat_body").is(":visible"))
            history_position = scrollback.capture(container, container.querySelectorAll(".chat-line"));
        chat_hidden = false;
        $("#chat").show();
        $("#chat_hidden").hide();
        if ($("#chat_hidden").css("display") != "none")
            toggle_entire_chat();
        if ($("#chat_body").css("display") === "none")
            toggle();

        scrollback.restore(container, history_position);
        $("#chat_input").focus();
    }

    function clear()
    {
        $("#spectator_list").html("&nbsp;");
        $("#chat_history").html("");
        $("#spectator_count").html("0 spectators");
        new_message_count = 0;
        draft_tags = [];
        message_history = [];
        history_pos = -1;
        unsent_message = { text: "", tags: [] };
        history_position = null;
        $("#chat_input").val("");
        items.setItems([]);
        items.close(false);
        update_message_count();
        $("#chat_body").slideUp(200);
    }

    $(document).ready(function () {
        items.init(tag_item);
        $("<span id='chat_compose_status' class='chat-sr-only' role='status' aria-live='polite'></span>").appendTo("#chat_body");
        $("#chat").attr({ role: "region", "aria-label": "Expedition chat" });
        $("#chat_caption").attr({ "aria-label": "Toggle expedition chat", "aria-expanded": "false",
            "aria-controls": "chat_body", role: "button", title: "Show or hide the conversation (F12)" });
        $("#chat_hide_button").attr({ "aria-label": "Hide expedition chat", title: "Hide chat" });
        $("#chat_input").attr({ placeholder: "Message your expedition…", "aria-label": "Message your expedition", maxlength: 500 });
        $("#chat_history").attr({ role: "log", "aria-live": "polite", "aria-relevant": "additions" });
        $("#chat_history_container").attr({ tabindex: 0, role: "region", "aria-label": "Expedition chat history" });
        // Chat controls own keyboard input; item search and button activation
        // must never also dispatch movement or commands to the dungeon.
        $("#chat").on("keydown.chatControls keypress.chatControls", function (event) {
            event.stopPropagation();
            if (event.type === "keydown" && !event.isDefaultPrevented()
                && (event.which === 27 || event.which === 123) && event.target.id !== "chat_input")
            {
                event.preventDefault();
                toggle();
                $(document.activeElement).blur();
            }
        });
        $("#chat_input").bind("keydown", chat_message_send);
        $("#chat_send_btn").on("click", function () {
            $("#chat_input").trigger($.Event("keydown", { which: 13 })).focus();
        });
        $("#chat_caption").bind("click", toggle);
        $("#chat_hide_button").bind("click", toggle_entire_chat);
        $("#chat_hidden").bind("click", toggle_entire_chat);
    });

    comm.register_handlers({
        "dump": handle_dump,
        "chat": receive_message,
        "update_spectators": update_spectators,
        "toggle_chat": toggle_entire_chat,
        "super_hide_chat": super_hide_chat
    });

    return {
        spectators: spectators,
        clear: clear,
        focus: focus,
        reset_visibility: reset_visibility,
        show_in_chat: show_in_chat,
        set_items: items.setItems,
        tag_item: tag_item,
    }
});
