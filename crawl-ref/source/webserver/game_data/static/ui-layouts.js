define(["jquery", "comm", "client", "./ui", "./cell_renderer", "./util",
        "./scroller", "./nested-tips", "./ui-layout-format",
        "./ui-description-layouts", "./ui-scroller-layouts"],
function ($, comm, client, ui, cr, util, scroller, nested, format, descriptions, scrolling) {
    "use strict";

    var fmt_body_txt = format.body;
    var paneset_cycle = format.paneset_cycle;
    var scroller_handle_key = scrolling.handle_key;

    function progress_bar(msg)
    {
        var $popup = $(".templates > .progress-bar").clone();
        if (msg.title === "")
            $popup.children(".header").remove();
        else
            $popup.find(".header > span").html(msg.title);
        $popup.children(".bar-text").html("<span>" +
            util.formatted_string_to_html(msg.bar_text) + "</span>");
        $popup.children(".status > span").html(msg.status);
        return $popup;
    }

    function progress_bar_update(msg)
    {
        var $popup = ui.top_popup();
        if (!$popup.hasClass("progress-bar"))
            return;
        $popup.children(".bar-text").html("<span>" +
                    util.formatted_string_to_html(msg.bar_text) + "</span>");
        $popup.children(".status")[0].textContent = msg.status;
    }

    function msgwin_get_line(msg)
    {
        var $popup = $(".templates > .msgwin-get-line").clone();
        $popup.children(".header").html(util.formatted_string_to_html(msg.prompt));
        $popup.find("[data-hotkey='Enter']").replaceWith("<button type='button' class='workflow-button workflow-primary' data-hotkey='Enter'>Confirm <kbd>Enter</kbd></button>");
        $popup.find("[data-hotkey='Escape']").replaceWith("<button type='button' class='workflow-button' data-hotkey='Escape'>Cancel <kbd>Esc</kbd></button>");
        $("<div class='workflow-dialog-actions'></div>").append($popup.children("[data-hotkey]")).appendTo($popup);
        return $popup;
    }

    function focus_button($button)
    {
        var $popup = $button.closest(".newgame-choice");
        var menu_id = $button.closest("[menu_id]").attr("menu_id");
        $popup.find(".button.selected").removeClass("selected");
        $button.addClass("selected");
        var $scr = $button.closest(".simplebar-scroll-content");
        if ($scr.length === 1)
        {
            var br = $button[0].getBoundingClientRect();
            var gr = $scr.parent()[0].getBoundingClientRect();
            var delta = br.top < gr.top ? br.top - gr.top :
                    br.bottom > gr.bottom ? br.bottom - gr.bottom : 0;
            $scr[0].scrollTop += delta;
        }

        var $descriptions = $popup.find(".descriptions");
        paneset_cycle($descriptions, $button.attr("data-description-index"));
        if (!client.is_watching())
            comm.send_message("outer_menu_focus", {
                hotkey: ui.utf8_from_key_value($button.attr("data-hotkey")),
                menu_id: menu_id,
            });
    }

    function newgame_choice(msg)
    {
        var $popup = $(".templates > .newgame-choice").clone();
        if (msg.doll)
        {
            var $canvas = $("<canvas>");
            var $title = $("<span>");
            var $prompt = $("<div class=header>");
            $popup.children(".header").append($canvas).append($title).after($prompt);
            $title.html(util.formatted_string_to_html(msg.title));
            $prompt.html(util.formatted_string_to_html(msg.prompt));
            var renderer = new cr.DungeonCellRenderer();
            util.init_canvas($canvas[0], renderer.cell_width, renderer.cell_height);
            renderer.init($canvas[0]);
            $.each(msg.doll, function (i, doll_part) {
                renderer.draw_player(doll_part[0], 0, 0, 0, 0, doll_part[1]);
            });
        }
        else
            $popup.children(".header").html(util.formatted_string_to_html(msg.title));
        var renderer = new cr.DungeonCellRenderer();
        var $descriptions = $popup.find(".descriptions");

        function build_item_grid(data, $container, fat)
        {
            $container.attr("menu_id", data.menu_id);
            $.each(data.buttons, function (i, button) {
                var $button = $("<div class=button>");
                if ((button.tile || []).length > 0 || fat)
                {
                    var $canvas = $("<canvas class='glyph-mode-hidden'>");
                    util.init_canvas($canvas[0], renderer.cell_width, renderer.cell_height);
                    renderer.init($canvas[0]);

                    $.each(button.tile || [], function (_, tile) {
                        renderer.draw_from_texture(tile.t, 0, 0, tile.tex, 0, 0, tile.ymax, false);
                    });
                    $button.append($canvas);
                }
                $.each(button.labels || [button.label], function (i, label) {
                    // TODO: this has somewhat weird behavior if multiple spans
                    // are produced from the formatted string...should they
                    // really have a flex-grow property?
                    var $lbl = $(util.formatted_string_to_html(label)).css("flex-grow", "1");
                    $button.append($lbl);
                });
                // at least remove empty spans because of the above issue:
                $button.find("span:empty").remove();
                $button.attr("style", "grid-row:"+(button.y+1)+"; grid-column:"+(button.x+1)+";");
                $descriptions.append("<span class='pane'> " + button.description + "</span>");
                $button.attr("data-description-index", $descriptions.children().length - 1);
                $button.attr("data-hotkey", ui.key_value_from_utf8(button.hotkey));
                $button.addClass("hlc-" + button.highlight_colour);
                $container.append($button);

                $button.on('hover', function () { focus_button($(this)) });
            });
            $.each(data.labels, function (i, button) {
                var $button = $("<div class=label>");
                $button.append(util.formatted_string_to_html(button.label));
                $button.attr("style", "grid-row:"+(button.y+1)+"; grid-column:"+(button.x+1)+";");
                $container.append($button);
            });
        }

        var $main = $popup.find(".main-items");
        build_item_grid(msg["main-items"], $main, true);
        build_item_grid(msg["sub-items"], $popup.find(".sub-items"));
        scroller($main.parent()[0]);

        return $popup;
    }

    function newgame_choice_update(msg)
    {
        if (!client.is_watching() && msg.from_client)
            return;
        var $popup = ui.top_popup();
        if (!$popup || !$popup.hasClass("newgame-choice"))
            return;
        var hotkey = ui.key_value_from_utf8(msg.button_focus);
        focus_button($popup.find("[data-hotkey='"+hotkey+"']"));
    }

    function newgame_random_combo(msg)
    {
        var $popup = $(".templates > .describe-generic").clone().addClass("workflow-prompt");
        $popup.find(".header > span").html(util.formatted_string_to_html(msg.prompt));
        $popup.find(".body").html("Do you want to play this combination? [Y/n/q]");
        $("<div class='workflow-dialog-actions'></div>").append(
            "<button type='button' class='workflow-button workflow-primary' data-hotkey='Y'>Play <kbd>Y</kbd></button>",
            "<button type='button' class='workflow-button' data-hotkey='n'>Try another <kbd>n</kbd></button>",
            "<button type='button' class='workflow-button' data-hotkey='q'>Cancel <kbd>q</kbd></button>").appendTo($popup);

        var $canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas($canvas[0], renderer.cell_width, renderer.cell_height);
        renderer.init($canvas[0]);
        $.each(msg.doll, function (i, doll_part) {
            renderer.draw_player(doll_part[0], 0, 0, 0, 0, doll_part[1]);
        });

        return $popup;
    }

    function game_over(desc)
    {
        var $popup = $(".templates > .game-over").clone();
        $popup.find(".header > span").html(desc.title);
        $popup.children(".body").html(fmt_body_txt(desc.body));
        var s = scroller($popup.children(".body")[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });

        var canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas(canvas[0], renderer.cell_width, renderer.cell_height);
        renderer.init(canvas[0]);
        renderer.draw_from_texture(desc.tile.t, 0, 0, desc.tile.tex, 0, 0, desc.tile.ymax, false);

        return $popup;
    }

    function seed_selection(desc)
    {
        var $popup = $(".templates > .seed-selection").clone();
        $popup.find(".header").text(desc.title);
        $popup.find(".body-text").html(desc.body);
        $popup.find(".footer").html(desc.footer);
        if (!desc.show_pregen_toggle)
            $popup.find(".pregen-toggle").remove();
        scroller($popup.find(".body")[0]);

        var $input = $popup.find("input[type=text]");
        var input_val = $input.val();
        $input.on("input change", function (event) {
            var valid_seed = $input.val().match(/^\d*$/);
            if (valid_seed)
                input_val = $input.val();
            else
                $input.val(input_val);
        });

        return $popup;
    }

    var ui_handlers = $.extend({}, descriptions.handlers, {
        "formatted-scroller" : scrolling.render,
        "progress-bar" : progress_bar,
        "seed-selection" : seed_selection,
        "msgwin-get-line" : msgwin_get_line,
        "newgame-choice": newgame_choice,
        "newgame-random-combo": newgame_random_combo,
        "game-over" : game_over,
    });

    function register_ui_handlers(dict)
    {
        $.extend(ui_handlers, dict);
    }

    // Text scrollers (help, message history, notes...) and description
    // popups: glossary terms in their body text open nested tooltips.
    var linkified_types = /^(describe-|formatted-scroller)/;
    function linkify_popup($popup)
    {
        if (!$popup || !$popup.length) return;
        $popup.find(".body").each(function () { nested.linkify(this); });
    }

    function recv_ui_push(msg)
    {
        var popup = null
        var handler = ui_handlers[msg.type];
        try
        {
            popup = handler
                ? handler(msg)
                : $("<div>Unhandled UI type " + msg.type + "</div>");
            if (handler && linkified_types.test(msg.type))
                linkify_popup(popup);
        }
        catch (err)
        {
            console.log(err);
            popup = $("<div>Buggy UI of type " + msg.type + "</div>");
        }
        ui.show_popup(popup, msg["ui-centred"], msg.generation_id);
    }

    function recv_ui_pop(msg)
    {
        ui.hide_popup();
    }

    var ui_stack_handled = false;

    function recv_ui_stack(msg)
    {
        if (!client.is_watching())
            return;
        // only process once on load
        if (ui_stack_handled)
            return;

        for (var i = 0; i < msg.items.length; i++)
            comm.handle_message(msg.items[i]);
        ui_stack_handled = true;
    }

    function recv_ui_state(msg)
    {
        var update_handlers = $.extend({}, descriptions.updates, {
            "formatted-scroller" : scrolling.update,
            "progress-bar" : progress_bar_update,
            "newgame-choice" : newgame_choice_update,
        });
        var handler = update_handlers[msg.type];
        if (handler)
            handler(msg);
        if (handler && linkified_types.test(msg.type))
            linkify_popup(ui.top_popup());
    }

    function recv_ui_scroll(msg)
    {
        var $popup = ui.top_popup();
        // formatted scrollers send their own synchronization messages
        if ($popup === undefined
            || $popup.hasClass("formatted-scroller")
            || $popup.hasClass("menu"))
            return;

        if (msg.scroll !== undefined && (!msg.from_webtiles || client.is_watching()))
        {
            var body = $popup.find(".simplebar-scroll-content").parent();
            if (body.length === 1)
                scrolling.to_line(scroller(body[0]), msg.scroll);
        }
    }

    function ui_layouts_cleanup()
    {
        ui_stack_handled = false;
        scrolling.cleanup();
    }

    $(document).off("game_init.ui-layouts")
        .on("game_init.ui-layouts", function () {
        $(document).off("game_cleanup.ui-layouts")
                   .on("game_cleanup.ui-layouts", ui_layouts_cleanup);
    });

    comm.register_handlers({
        "ui-push": recv_ui_push,
        "ui-pop": recv_ui_pop,
        "ui-stack": recv_ui_stack,
        "ui-state": recv_ui_state,
        "ui-scroller-scroll": recv_ui_scroll,
    });

    return {
        register_handlers: register_ui_handlers,
    };
});
