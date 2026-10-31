define(["jquery", "comm", "./enums", "./cell_renderer", "./util", "./options", "./menu-presentation", "./context-menu"],
function ($, comm, enums, cr, util, options, presentation, menus) {
    "use strict";
    return function create(api) {
    var mouse_hover_suppressed = null;
    function item_click_handler(event) { return api.click.call(this, event); }
    function snap_in_page(index) { api.snap(index); }
    // Helpers

    function item_selectable(item)
    {
        var menu = api.current();
        // TODO: the logic on the c++ side is somewhat different here
        return item.level == 2
            // in the use item menu, selecting a non-hotkeyed item triggers
            // relettering on the server
            && (menu.tag == "use_item" || item.hotkeys && item.hotkeys.length);
    }

    function item_text(item)
    {
        var menu = api.current();
        return item.text;
    }

    function item_colour(item)
    {
        var menu = api.current();
        if (item.colour === undefined)
            return 7;
        return item.colour;
    }

    function menu_title_indent()
    {
        var menu = api.current();
        if (!options.get("tile_menu_icons")
            || options.get("tile_display_mode") !== "tiles"
            || !(menu.tag === "ability" || menu.tag === "spell"))
            return 0;
        return 32 + 2; // menu <ol> has a 2px margin
    }

    function set_item_contents(item, elem)
    {
        var menu = api.current();
        elem.html(util.formatted_string_to_html(item_text(item)));
        elem.css('min-height', '0.5em');
        var col = item_colour(item);
        elem.removeClass();
        elem.addClass("level" + item.level);
        elem.addClass("fg" + col);

        if (item.level < 2)
            elem.css("padding-left", menu_title_indent()+"px");

        if (item_selectable(item))
        {
            elem.addClass("selectable");
            elem.off("click.menu_item").off("contextmenu.menu_item");
            elem.on("click.menu_item", item_click_handler);
            menus.bind(elem, function () {
                var expectedText = item.text;
                var entries = [{ label: menu.flags & enums.menu_flag.MULTISELECT ? "Toggle selection" : "Select",
                    run: function () { api.click.call(elem[0], $.Event("click", { which: 1 })); } }];
                if (menu.flags & enums.menu_flag.ARROWS_SELECT) entries.push({ label: "Inspect",
                    run: function () { api.click.call(elem[0], $.Event("contextmenu", { which: 3 })); } });
                return { title: $("<div></div>").html(util.formatted_string_to_html(item.text)).text(), entries: entries,
                    valid: function () { return api.current() === menu && item.text === expectedText && item_selectable(item); } };
            });
        }

        if (item.tiles && item.tiles.length > 0
            && options.get("tile_display_mode") == "tiles")
        {
            var renderer = new cr.DungeonCellRenderer();
            var canvas = $("<canvas>");
            util.init_canvas(canvas[0], renderer.cell_width,
                                        renderer.cell_height);
            canvas.css("vertical-align", "middle");
            renderer.init(canvas[0]);

            $.each(item.tiles, function () {
                renderer.draw_from_texture(this.t, 0, 0, this.tex, 0, 0, this.ymax, false);
            });

            elem.prepend(canvas);
        }
        presentation.item(item, elem, menu);
    }

    function add_hover_class(item)
    {
        var menu = api.current();
        if (item < 0 || item >= menu.items.length)
            return;
        menu.items[item].elem.addClass("hovered");
    }

    function remove_hover_class(item)
    {
        var menu = api.current();
        if (item < 0 || item >= menu.items.length)
            return;
        menu.items[item].elem.removeClass("hovered");
    }

    function mouse_set_hovered(index)
    {
        var menu = api.current();
        if (mouse_hover_suppressed)
            return;
        if (index >= 0 &&
            (index < menu.first_part_visible || index > menu.last_part_visible))
        {
            return;
        }
        set_hovered(index, false, true);
    }

    function clear_suppress()
    {
        var menu = api.current();
        mouse_hover_suppressed = null;
    }

    function suppress_mouse_hover()
    {
        var menu = api.current();
        // ugh -- keep mouseenter from triggering, is there a better way?
        if (mouse_hover_suppressed)
            clearTimeout(mouse_hover_suppressed);
        mouse_hover_suppressed = setTimeout(clear_suppress, 200);
    }

    function set_hovered(index, snap=true, from_mouse=false)
    {
        var menu = api.current();
        if (index >= menu.items.length)
            index = Math.max(0, menu.items.length - 1);
        if (index == menu.last_hovered
            && (index < 0 || item_selectable(menu.items[index])))
        {
            // just make sure the hover class is set correctly
            add_hover_class(menu.last_hovered);
            return;
        }
        remove_hover_class(menu.last_hovered);
        if (index < 0 || item_selectable(menu.items[index]))
        {
            menu.last_hovered = index;
            add_hover_class(menu.last_hovered);
            if (menu.last_hovered >= 0 && snap == true)
                snap_in_page(menu.last_hovered);
            comm.send_message("menu_hover",
                {
                    hover: menu.last_hovered,
                    mouse: from_mouse
                });
        }
    }

    function prepare_hoverable_item(item)
    {
        var menu = api.current();
        // TODO: mouse movement over a menu item after hover has been moved
        // off it by arrows isn't enough to restore hover; moving the
        // mouse cursor in and out is needed. Worth addressing?
        item.elem.hover(
            function() {
                mouse_set_hovered($(this).index());
            }, function() {
                // XX if this uses mouse_set_hovered, the timing seems
                // to be extremely flaky w.r.t. a new hover.
                if (!(menu.flags & enums.menu_flag.ARROWS_SELECT))
                    set_hovered(-1);
                // otherwise, keep the hover unless mousenter moves it into
                // a new cell
            });
    }

    function prepare_item_range(start, end, container)
    {
        var menu = api.current();
        // Guarantees that the given (inclusive) range of item indices
        // exists

        if (start < 0) start = 0;
        if (end >= menu.total_items)
            end = menu.total_items - 1;

        if (start >= menu.total_items || end < 0)
            return;

        // Find out which indices are missing. This assumes that all
        // missing items are in a continuous range, which is the case
        // as long as the only ways to jump farther than chunk_size are
        // home and end.
        while (menu.items[start] !== undefined && start <= end)
            start++;
        if (start > end) return;
        while (menu.items[end] !== undefined && start <= end)
            end--;

        container = container || menu.elem.find(".menu_contents_inner ol");

        // Find the place where we add the new elements
        var present_index = end;
        while (present_index < menu.total_items
               && menu.items[present_index] === undefined)
        {
            present_index++;
        }
        var anchor = null;
        if (menu.items[present_index])
            anchor = menu.items[present_index].elem;

        // Create the placeholders
        for (var i = start; i <= end; ++i)
        {
            var item = {
                level: 2,
                text: "...",
                index: i
            };
            var elem = $("<li>...</li>");
            elem.data("item", item);
            elem.addClass("placeholder");
            item.elem = elem;
            prepare_hoverable_item(item);

            if (anchor)
                anchor.before(elem);
            else
                container.append(elem);

            menu.items[i] = item;
        }

        if (start < menu.first_present)
            menu.first_present = start;
        if (end > menu.last_present)
            menu.last_present = end;
    }

    function update_item_range(chunk_start, items_list)
    {
        var menu = api.current();
        prepare_item_range(0, menu.total_items-1);
        for (var i = 0; i < items_list.length; ++i)
        {
            var real_index = i + chunk_start;
            var item = menu.items[real_index];
            if (!item) continue;
            var new_item = items_list[i];
            if (typeof new_item === "string")
            {
                new_item = {
                    type: 2,
                    text: new_item
                };
            }
            // Probably this could should simply replace item? But I'm nervous
            // about changing it from extend...
            $.extend(item, new_item);
            if (new_item.colour === undefined)
                delete item.colour;
            if (new_item.tiles === undefined)
                delete item.tiles;
            if (new_item.hotkeys === undefined)
                delete item.hotkeys;

            set_item_contents(item, item.elem);
        }
    }

    return {
        item_selectable: item_selectable,
        menu_title_indent: menu_title_indent,
        set_item_contents: set_item_contents,
        add_hover_class: add_hover_class,
        set_hovered: set_hovered,
        suppress_mouse_hover: suppress_mouse_hover,
        update_item_range: update_item_range,
        prepare_hoverable_item: prepare_hoverable_item,
        reset: function () { clearTimeout(mouse_hover_suppressed); mouse_hover_suppressed = null; }
    };
    };
});
