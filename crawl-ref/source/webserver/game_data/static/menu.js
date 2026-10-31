define(["jquery", "comm", "client", "./ui", "./enums", "./cell_renderer",
        "./util", "./options", "./scroller", "./menu-items", "./menu-navigation", "./menu-presentation", "./menu-selection-controls"],
function ($, comm, client, ui, enums, cr, util, options, scroller, createItems, createNavigation, presentation, selectionControls) {
    "use strict";

    var menu_stack = [];
    var menu = null;
    var update_server_scroll_timeout = null;
    var menu_close_timeout = null;
    var itemView = createItems({ current: function () { return menu; },
        click: item_click_handler, snap: function (index) { snap_in_page(index); } });
    var navigation = createNavigation({ current: function () { return menu; },
        selectable: itemView.item_selectable, hover: itemView.set_hovered,
        suppress: itemView.suppress_mouse_hover, scroll: menu_scroll_handler, more: update_more,
        pending: function () { return update_server_scroll_timeout; }, flush: update_server_scroll });
    var item_selectable = itemView.item_selectable;
    var menu_title_indent = itemView.menu_title_indent;
    var set_item_contents = itemView.set_item_contents;
    var add_hover_class = itemView.add_hover_class;
    var set_hovered = itemView.set_hovered;
    var suppress_mouse_hover = itemView.suppress_mouse_hover;
    var update_item_range = itemView.update_item_range;
    var prepare_hoverable_item = itemView.prepare_hoverable_item;
    var menu_keydown_handler = navigation.menu_keydown_handler;
    var menu_keypress_handler = navigation.menu_keypress_handler;
    var next_hoverable_item = navigation.next_hoverable_item;
    var cycle_hover = navigation.cycle_hover;
    var paging = navigation.paging;
    var line_up = navigation.line_up;
    var line_down = navigation.line_down;
    var snap_in_page = navigation.snap_in_page;
    var scroll_to_item = navigation.scroll_to_item;
    var scroll_bottom_to_item = navigation.scroll_bottom_to_item;
    var update_visible_indices = navigation.update_visible_indices;


    function menu_cleanup()
    {
        menu_stack = [];
        menu = null;
        if (update_server_scroll_timeout)
        {
            clearTimeout(update_server_scroll_timeout);
            update_server_scroll_timeout = null;
        }
        if (menu_close_timeout)
        {
            clearTimeout(menu_close_timeout);
            menu_close_timeout = null;
        }
        itemView.reset();
    }

    function display_menu()
    {
        var menu_div = $(".templates > .menu").clone();
        menu_div.addClass("menu_" + menu.tag);
        menu.elem = menu_div;

        if (menu.type === "crt")
        {
            // Custom-drawn CRT menu
            menu_div.removeClass("menu").addClass("menu_txt");
            ui.show_popup(menu_div, menu["ui-centred"]);
            return;
        }

        // Normal menu
        menu_div.prepend("<div class='menu_title'>");
        update_title();

        var content_div= $("<div class='menu_contents'>");
        menu_div.append(content_div);

        var items_inner = $("<div class='menu_contents_inner'>");
        content_div.append(items_inner);

        var container = $("<ol>");
        items_inner.append(container);

        var chunk = menu.items;
        menu.items = { length: menu.total_items };
        menu.first_present = 999999;
        menu.last_present = -999999;
        update_item_range(menu.chunk_start, chunk);

        menu.scroller = scroller(content_div[0]);
        menu.scroller.scrollElement.addEventListener('scroll', menu_scroll_handler);

        menu_div.append("<div class='menu_more'></div>");
        selectionControls.update(menu);
        update_more();

        if (client.is_watching())
            menu.following_player_scroll = true;

        // suppress mouseenter events on initial display. It might be nice
        // to do this only if the cursor is currently hiddent, but I haven't
        // been able to reliably detect that.
        suppress_mouse_hover();

        ui.show_popup(menu_div, menu["ui-centred"]);
        handle_size_change();

        // if we get focus back after a popup over this one, don't use mouse
        // position at the time to set hover:
        $(ui.top_popup()).on("focusin",
            function (ev)
            {
                suppress_mouse_hover();
            });

        if (menu.flags & enums.menu_flag.START_AT_END)
            scroll_bottom_to_item(menu.items.length - 1, true);
        else if (menu.jump_to)
            scroll_to_item(menu.jump_to, true);
        else if (menu.items.length > 0)
            scroll_to_item(0, true);

        if (menu.last_hovered >= 0)
            add_hover_class(menu.last_hovered);
    }

    function update_server_scroll()
    {
        if (update_server_scroll_timeout)
        {
            clearTimeout(update_server_scroll_timeout);
            update_server_scroll_timeout = null;
        }

        if (!menu || menu.type == "crt")
            return;

        update_visible_indices();
        comm.send_message("menu_scroll", {
            first: menu.first_visible,
            last: menu.last_visible,
            hover: menu.last_hovered
        });
    }

    function schedule_server_scroll()
    {
        if (!update_server_scroll_timeout)
            update_server_scroll_timeout = setTimeout(update_server_scroll, 100);
    }

    function update_title()
    {
        var title = menu.elem.find(".menu_title")
        title.html(util.formatted_string_to_html(menu.title.text));
        title.css("padding-left", menu_title_indent()+"px");
        presentation.title(menu);
    }

    function title_prompt(data)
    {
        var prompt;

        var restore = function () {
            if (!client.is_watching || !client.is_watching())
                $("#title_prompt").blur();
            menu.elem.find(".menu_title").removeClass("raw_input_mode");
            update_title();
        };

        // manual close from server side: used for raw input mode
        if (data && data.close)
        {
            restore();
            return;
        }

        var title = menu.elem.find(".menu_title");
        if (data && data.raw)
        {
            title.addClass("raw_input_mode")
            return; // everything else is handled manually, including exiting
        }

        if (!data || !data.prompt)
            prompt = "Select what? (regex) ";
        else
            prompt = data.prompt;
        title.html(prompt);
        var input = $("<input id='title_prompt' class='text title_prompt' type='text'>");
        title.append(input);

        // unclear to me exactly why a timeout is needed but it seems to be
        if (!client.is_watching || !client.is_watching())
            setTimeout(function () { input.focus(); }, 50);

        // escape handling: ESC is intercepted in ui.js and triggers blur(), so
        // can't be handled directly here
        input.focusout(function (ev)
            {
                ev.preventDefault();
                comm.send_message("key", { keycode: 27 }); // Send ESC
                return false;
            })

        if (menu.tag == "macro_mapping")
        {
            input.keypress(function (ev) {
                var chr = String.fromCharCode(event.which);
                if (chr == '?')
                {
                    // TODO: a popup from here does not take focus over
                    // the input, which is still receiving keys. But I'm not
                    // sure how to fix...
                    comm.send_message("key", { keycode: ev.which });
                    ev.preventDefault();
                    return false;
                }
            });
        }

        input.keydown(function (ev) {
            if (ev.which == 13)
            {
                // somewhat hacky / oldschool: just send the text + enter.
                // TODO: sync via explicit json
                // first, remove the focusout handler, since this will defocus
                input.off("focusout");
                var enter = String.fromCharCode(13);
                var text = input.val() + enter;
                comm.send_message("text_input", { text: text });

                restore();
                ev.preventDefault();
                return false;
            }
        });
    }

    // Message handlers

    function open_menu(data)
    {
        if (data.replace)
        {
            menu_stack.pop();
            ui.hide_popup();
        }
        menu_stack.push(data);
        menu = data;

        display_menu();
    }

    function close_menu()
    {
        if (menu_stack.length > 1
            && menu_stack[menu_stack.length - 2].last_hovered >= 0)
        {
            suppress_mouse_hover();
        }
        menu_stack.pop();
        ui.hide_popup();
        menu = menu_stack[menu_stack.length - 1];
    }

    function close_all_menus()
    {
        while (menu_stack.length > 0)
            close_menu();
    }

    function update_more()
    {
        if (menu.type != "crt")
        {
            const contents_height = menu.elem.find(".menu_contents_inner").height();
            const contents = $(menu.scroller.scrollElement);
            const avail_height = contents.height();
            var shown_more = contents_height > avail_height
                                                ? menu.more : menu.alt_more;

            const scroll_end = contents_height - avail_height;
            var scroll_percent;
            if (contents[0].scrollTop === 0 || scroll_end <= 0)
                scroll_percent = "top";
            else if (contents[0].scrollTop >= scroll_end)
                scroll_percent = "bot";
            else
            {
                scroll_percent = (contents[0].scrollTop * 100
                                / scroll_end).toFixed(0) + "%";
                if (scroll_percent.length === 2)
                    scroll_percent = " " + scroll_percent;
            }
            shown_more = shown_more.replace(/XXX/, scroll_percent);

            var more = menu.elem.find(".menu_more");
            if (menu.column_layout) shown_more = shown_more.replace(/\|/g, " | ");
            more.html(util.formatted_string_to_html(shown_more));
            more.css("padding-left", menu_title_indent()+"px");
            more[0].classList.toggle("hidden", shown_more.length === 0);
        }
    }

    function update_menu(data)
    {
        // n.b. this may overwrite hover, but we can't update it yet because
        // menu items won't have been sent. `handle_size_change` will ensure
        // that it does get synced, but are there cases where something more
        // is needed?
        $.extend(menu, data);

        var old_length = menu.items.length;
        menu.items.length = menu.total_items;
        if (menu.total_items < old_length)
        {
            for (var i = old_length; i >= menu.total_items; --i)
                delete menu.items[i];
            // XX I don't really understand what `container` is doing here, but
            // this code is required to shorten a menu
            var container = menu.elem.find(".menu_contents ol");
            container.empty();
            $.each(menu.items, function(i, item) {
                item.elem.data("item", item);
                prepare_hoverable_item(item);
                container.append(item.elem);
            });
        }
        update_title();
        selectionControls.update(menu);
        update_more();
    }

    function update_menu_items(data)
    {
        update_item_range(data.chunk_start, data.items);
        selectionControls.update(menu);
        handle_size_change();
    }

    function server_menu_scroll(data)
    {
        if (!data.force && !client.is_watching())
            return;

        menu.server_first_visible = data.first;
        if (menu.following_player_scroll || data.force)
        {
            scroll_to_item(data.first, true);
            set_hovered(data.last_hovered);
            update_more();
        }
    }

    comm.register_handlers({
        "menu": open_menu,
        "close_menu": close_menu,
        "close_all_menus": close_all_menus,
        "update_menu": update_menu,
        "update_menu_items": update_menu_items,
        "menu_scroll": server_menu_scroll,
        "title_prompt": title_prompt,
    });

    // Event handlers

    function handle_size_change()
    {
        if (!menu || menu.type == "crt")
            return;

        if (menu.last_hovered > menu.items.length)
            menu.last_hovered = -1; // sanity check
        // ensure hover class is properly set.
        if (menu.last_hovered >= 0 && !item_selectable(menu.items[menu.last_hovered]))
        {
            // a mildly smarter behavior would find the first hoverable position
            // ignoring headers
            cycle_hover(false);
        }
        else
            set_hovered(menu.last_hovered);

        if (menu.anchor_last)
            scroll_bottom_to_item(menu.last_visible, true);
        else if (menu.first_visible)
            scroll_to_item(menu.first_visible, true);
        else
            update_visible_indices();

        update_more();
    }

    function menu_scroll_handler(was_server_initiated)
    {
        // XXX: punt on detecting user-initiated scrolling for now
        if (was_server_initiated === false)
            menu.following_player_scroll = false;

        update_visible_indices();
        schedule_server_scroll();
    }

    function item_click_handler(event)
    {
        if (client.is_watching()) return;
        if (update_server_scroll_timeout)
            update_server_scroll();

        var item = $(this).data("item");
        if (!item) return;
        if (event.key === "Enter" && (menu.flags & enums.menu_flag.MULTISELECT))
        {
            comm.send_message("key", { keycode: 13 });
            return;
        }
        if (menu.flags & enums.menu_flag.ARROWS_SELECT)
        {
            set_hovered($(this).index()); // should be unnecesssary?
            // TODO: send a select event, keycode is very ad hoc here
            if (menu.flags & enums.menu_flag.SINGLESELECT)
            {
                if (event.which == 1)
                    comm.send_message("key", { keycode: 13 });
                else if (event.which == 3)
                    comm.send_message("text_input", { text: '\'' });
            }
            else if (menu.flags & enums.menu_flag.MULTISELECT)
            {
                if (event.which == 1)
                    comm.send_message("key", { keycode: 32 });
                else if (event.which == 3)
                    comm.send_message("text_input", { text: '\'' });
            }
        }
        // TODO: don't rely on hotkeys here
        else if (item.hotkeys && item.hotkeys.length && event.which == 1)
            comm.send_message("key", { keycode: item.hotkeys[0] });
    }

    options.add_listener(function ()
    {
        if (options.get("tile_font_crt_size") === 0)
        {
            $("#crt").css("font-size", "");
            $(".menu").css("font-size", "");
        }
        else
        {
            $("#crt").css("font-size",
                options.get("tile_font_crt_size") + "px");
            $(".menu").css("font-size",
                options.get("tile_font_crt_size") + "px");
        }

        var family = options.get("tile_font_crt_family");
        if (family !== "" && family !== "monospace")
        {
            family += ", monospace";
            document.documentElement.style.setProperty("--crt-font", family);
        }

        handle_size_change();
    });

    $(document).off("game_init.menu")
               .on("game_init.menu", function () {
        menu_stack = [];
        $(window).off("resize.menu")
                 .on("resize.menu", handle_size_change);
        $(document).off("game_keydown.menu game_keypress.menu")
                   .on("game_keydown.menu", menu_keydown_handler)
                   .on("game_keypress.menu", menu_keypress_handler);
        $(document).off("game_cleanup_menu")
                   .on("game_cleanup.menu", menu_cleanup);
    });
});
