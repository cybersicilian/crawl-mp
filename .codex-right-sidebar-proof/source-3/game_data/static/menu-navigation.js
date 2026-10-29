define(["jquery", "./enums", "./ui"], function ($, enums, ui) {
    "use strict";
    return function create(api) {
    function item_selectable(item) { return api.selectable(item); }
    function set_hovered() { return api.hover.apply(null, arguments); }
    function suppress_mouse_hover() { api.suppress(); }
    function menu_scroll_handler(value) { api.scroll(value); }
    function update_more() { api.more(); }
    // Scrolling functions

    function next_hoverable_item(reverse, starting_point, start_at_starting_point=false)
    {
        var menu = api.current();
        // port of some logic in menu.cc
        var items_tried = 0;
        var max_items;

        menu.flags
        if (menu.flags & enums.menu_flag.WRAP)
            max_items = menu.items.length;
        else if (reverse)
            max_items = menu.last_hovered; // up arrow on no hover does nothing
        else
            max_items = menu.items.length - Math.max(starting_point, 0);

        if (start_at_starting_point && menu.items.length > 0)
            max_items = Math.max(max_items, 1); // consider at least the starting point

        if (max_items <= 0)
            return -1;

        var new_hover = starting_point;
        if (reverse && new_hover < 0)
            new_hover = 0;
        var found = false;
        if (!start_at_starting_point)
            new_hover = new_hover + (reverse ? -1 : 1);

        // find an item that can be selected in the first place
        while (items_tried < max_items)
        {
            items_tried++;
            if (menu.flags & enums.menu_flag.WRAP)
                new_hover = (new_hover + menu.items.length) % menu.items.length;
            new_hover = Math.max(0, Math.min(new_hover, menu.items.length - 1));
            if (item_selectable(menu.items[new_hover])) // TODO: not identical to c++ logic
            {
                found = true;
                break;
            }
            new_hover = new_hover + (reverse ? -1 : 1);
            // new_hover may be invalid if loop exits now, but we don't use it
        }
        if (!found)
            return -1;
        return new_hover;
    }

    function cycle_hover(reverse)
    {
        var menu = api.current();
        var next = next_hoverable_item(reverse, menu.last_hovered);
        if (next != -1)
            set_hovered(next);
    }

    // return a positive or negative number indicating hover relative to the
    // current pane. Will return 0 if there is no current hover.
    function get_relative_hover()
    {
        var menu = api.current();
        // XX this function has some heuristics to deal with the fact that
        // headers mess up relative hover, and they still aren't perfect
        if (menu.last_hovered < 0 || menu.items.length == 0)
            return 0;

        // use a negative relative hover if we are on the last element, to
        // prevent a common weird interaction with headers. XX should this be
        // generalized?
        if (menu.last_visible == menu.last_hovered)
            return -1;

        var relative_hover = menu.last_hovered - menu.first_visible;

        var headers = 0;

        // factor out headers
        for (var i = 0; i <= relative_hover; i++)
            if (menu.items[menu.first_visible + i].level < 2)
                headers += 1;
        relative_hover = Math.max(0, relative_hover - headers);

        return relative_hover;
    }

    // set the hover relative to the current pane. If the value is negative,
    // index from the end. The value ignores non-hoverable items (headers).
    function set_relative_hover(relative_hover)
    {
        var menu = api.current();
        if (menu.items.length == 0)
            return;
        var hover_target = 0;
        if (relative_hover >= 0)
        {
            // skip headers
            for (var i = 0; i <= relative_hover
                        && menu.first_visible + i <= menu.last_visible; i++)
            {
                if (menu.items[menu.first_visible + i].level < 2)
                    relative_hover += 1;
            }

            hover_target = menu.first_visible + relative_hover;
        }
        else // XX headers not handled
            hover_target = menu.last_visible + relative_hover + 1;

        // don't scroll -- lock to whatever is currently visible
        if (hover_target > menu.last_visible)
            hover_target = menu.last_visible;
        else if (hover_target < menu.first_visible)
            hover_target = menu.first_visible;
        set_hovered(next_hoverable_item(false, hover_target, true), true);
    }

    function paging(up)
    {
        var menu = api.current();
        if (menu.items.length == 0)
            return;
        if ((menu.flags & enums.menu_flag.ARROWS_SELECT) && menu.last_hovered < 0)
            menu.last_hovered = menu.first_visible;
        var adjust_hover = menu.last_hovered >= 0;
        var relative_hover = get_relative_hover();
        if (up)
        {
            // if we are already at the top, don't scroll, and move any hover
            // to the top
            if (menu.first_visible == 0)
                relative_hover = 0;
            else
                scroll_bottom_to_item(menu.first_visible);
        }
        else
        {
            // if we are already at the end, don't scroll, and move any hover
            // to the end
            if (menu.last_visible == menu.items.length - 1)
                relative_hover = -1;
            else
                scroll_to_item(menu.last_visible);
        }

        if (adjust_hover)
            set_relative_hover(relative_hover)
    }

    function line_down()
    {
        var menu = api.current();
        if (menu.length <= 0)
            return;
        var next = menu.first_visible + 1;
        // treat a header and a following item as one item
        if (menu.items[menu.first_visible].level < 2)
            next = next + 1;
        if (next >= menu.items.length)
            next = menu.items.length - 1;
        scroll_to_item(next);
        snap_hover_in_page();
    }

    function line_up()
    {
        var menu = api.current();
        var previous = menu.first_visible - 1;
        if (previous < 0)
            previous = 0;
        scroll_to_item(previous);
        snap_hover_in_page();
    }

    function snap_hover_in_page()
    {
        var menu = api.current();
        if (menu.last_hovered < 0)
            return;
        else if (menu.last_hovered < menu.first_visible)
            set_hovered(menu.first_visible, false);
        else if (menu.last_hovered > menu.last_visible)
            set_hovered(menu.last_visible, false);
    }

    function snap_in_page(index)
    {
        var menu = api.current();
        // simpler than the c++ version! visible indices already calculated
        if (index < 0 || index >= menu.items.length)
            return;
        // the `<=` here is in order to check if a hovered first_visible item
        // is preceded by a header
        if (index <= menu.first_visible)
            scroll_to_item(index);
        else if (index >= menu.last_visible)
            scroll_bottom_to_item(index);
    }

    function scroll_to_item(item_or_index, was_server_initiated)
    {
        var menu = api.current();
        var index = (item_or_index.elem ?
                     item_or_index.index : item_or_index);
        if (menu.items.length == 0)
            return;

        var item = (item_or_index.elem ?
                    item_or_index : menu.items[item_or_index]);
        // ensure that an immediately preceding heading is visible
        if (item.index > 0 && menu.items[item.index - 1].level < 2)
            item = menu.items[item.index - 1];
        if (item.index == menu.first_visible)
            return;
        var contents = $(menu.scroller.scrollElement);
        var baseline = contents.children()[0].getBoundingClientRect().top;
        var elem_y = item.elem[0].getBoundingClientRect().top;
        if (menu.flags & enums.menu_flag.ARROWS_SELECT)
            suppress_mouse_hover();

        // allow a bit of extra space for the fade, number may need more tuning
        contents[0].scrollTop = Math.max(0, elem_y - baseline - 18);

        menu.anchor_last = false;
        menu_scroll_handler(was_server_initiated);
    }

    function scroll_bottom_to_item(item_or_index, was_server_initiated)
    {
        var menu = api.current();
        var index = (item_or_index.elem ?
                     item_or_index.index : item_or_index);
        if (menu.items.length == 0 || menu.last_visible == index)
            return;

        var item = (item_or_index.elem ?
                    item_or_index : menu.items[item_or_index]);
        var contents = $(menu.scroller.scrollElement);
        var baseline = contents.children().offset().top;

        if (menu.flags & enums.menu_flag.ARROWS_SELECT)
            suppress_mouse_hover();

        // allow a bit of extra space for the fade, number may need more tuning
        contents.scrollTop(item.elem.offset().top + item.elem.height() + 24
                - baseline - menu.elem.find(".menu_contents").innerHeight());

        menu.anchor_last = true;
        menu_scroll_handler(was_server_initiated);
    }

    function update_visible_indices()
    {
        var menu = api.current();
        var $contents = menu.elem.find(".menu_contents");
        var container_rect = $contents.children()[0].getBoundingClientRect();
        var top = Math.max(container_rect.top, 0);
        var bottom = Math.min(container_rect.bottom,
                                $(window).scrollTop() + $(window).height());
        var i;

        // initialize these to ensure that they are never NaN, even if we have
        // strange values for the bounding boxes
        menu.first_visible = 0;
        menu.last_visible = Math.max(0, menu.items.length - 1);
        menu.first_part_visible = -1;
        menu.last_part_visible = -1;

        for (i = 0; i < menu.items.length; i++)
        {
            const item = menu.items[i];
            const item_rect = item.elem[0].getBoundingClientRect();
            // +1 here is for float issues
            if (item_rect.top + 1.0 >= top)
            {
                menu.first_visible = i;
                break;
            }
            else if (item_rect.bottom - top > 10) // XX 10 here is a bit heuristic
                menu.first_part_visible = i;
        }
        for (; i < menu.items.length; i++)
        {
            const item = menu.items[i];
            const item_rect = item.elem[0].getBoundingClientRect();
            // -1 here is for float issues
            if (item_rect.bottom - 1.0 >= bottom)
            {
                // one after the last visible item
                if (bottom - item_rect.top > 10)
                    menu.last_part_visible = i;
                break;
            }
            else
                menu.last_visible = i;
        }
        if (menu.first_part_visible === -1)
            menu.first_part_visible = menu.first_visible;
        if (menu.last_part_visible === -1)
            menu.last_part_visible = menu.last_visible;
        update_more();
    }

    function update_server_scroll() { api.flush(); }
    function raw_arrow_keys()
    {
        var menu = api.current();
        return menu.tag == "macro_mapping"
            && ($(".raw_input_mode").length // raw input mode is up
                || menu.items.length == 0); // new binding input mode
    }

    function menu_keydown_handler(event)
    {
        var menu = api.current();
        if (!menu || menu.type === "crt") return;
        // can't check `hidden` class, which is on a 3x containing div
        if (!ui.top_popup() || ui.top_popup().is(":hidden")) return;
        if (ui.top_popup()[0] !== menu.elem[0]) return;

        if (event.altKey || event.ctrlKey) {
            // ???
            if (api.pending())
                update_server_scroll();
            return;
        }

        // keycodes only: characters go in menu_keypress_handler
        // TODO: this should interface somehow with key_conversion.js
        switch (event.which)
        {
        case 109: // numpad -
            if (menu_has_custom_dash())
                break;
            // otherwise, fall through to pageup:
        case 33: // page up
            if (raw_arrow_keys())
                break; // Treat input as raw, no need to scroll anyway
            paging(true);
            event.preventDefault();
            return false;
        case 107: // numpad +
        case 34: // page down
            if (raw_arrow_keys())
                break;
            paging();
            event.preventDefault();
            return false;
        case 35: // end
            if (raw_arrow_keys())
                break; // Treat input as raw, no need to scroll anyway
            scroll_bottom_to_item(menu.total_items - 1);
            if (menu.total_items > 0 && (menu.flags & enums.menu_flag.ARROWS_SELECT))
                set_hovered(next_hoverable_item(true, menu.total_items - 1, true));
            event.preventDefault();
            return false;
        case 36: // home
            if (raw_arrow_keys())
                break; // Treat input as raw, no need to scroll anyway
            scroll_to_item(0);
            if (menu.flags & enums.menu_flag.ARROWS_SELECT)
                set_hovered(next_hoverable_item(false, 0, true));
            event.preventDefault();
            return false;
        case 38: // up
            if (raw_arrow_keys())
                break; // Treat input as raw, no need to scroll anyway
            if ((menu.flags & enums.menu_flag.ARROWS_SELECT) && !event.shiftKey)
                cycle_hover(true);
            else
                line_up();
            event.preventDefault();
            return false;
        case 40: // down
            if (raw_arrow_keys())
                break; // Treat input as raw, no need to scroll anyway
            if ((menu.flags & enums.menu_flag.ARROWS_SELECT) && !event.shiftKey)
                cycle_hover(false);
            else
                line_down();
            event.preventDefault();
            return false;
        case 37: // left
            if (raw_arrow_keys())
                break; // Treat input as raw, no need to scroll anyway
            if (event.shiftKey)
            {
                line_up();
                event.preventDefault();
                return false;
            }
            break;
        case 39: // right
            if (raw_arrow_keys())
                break; // Treat input as raw, no need to scroll anyway
            if (event.shiftKey)
            {
                line_down();
                event.preventDefault();
                return false;
            }
            break;
        }

        if (api.pending())
            update_server_scroll();
    }

    function menu_has_custom_dash()
    {
        var menu = api.current();
        return menu.tag == "inventory" // drop/pickup use '-' to clear all (TODO: specific tag?)
            || menu.tag == "stash"     // TODO: ??
            || menu.tag == "actions"   // '-' = clear quiver
            || menu.tag == "macros"    // '-' = clear all macros
            || menu.tag == "macro_mapping" // leave available for binding
            || menu.tag == "use_item"; // '-' = unwield
    }

    function menu_keypress_handler(event)
    {
        var menu = api.current();
        if (!menu || menu.type === "crt") return;
        if (!ui.top_popup() || ui.top_popup()[0] !== menu.elem[0]) return;
        if (menu.tag == "macro_mapping") return; // Treat input as raw, no need
                                                 // to scroll anyway

        var chr = String.fromCharCode(event.which);

        if (chr == " " && (menu.flags & enums.menu_flag.MULTISELECT)
            && (menu.flags & enums.menu_flag.ARROWS_SELECT))
        {
            chr = ".";
        }

        // characters only: keycodes go in menu_keydown_handler
        switch (chr)
        {
        case "-":
            if (menu_has_custom_dash())
                break;
            // otherwise, fall through to pageup:
        case "<":
            if (menu.tag == "travel")
                break;
        case ";":
            paging(true);
            event.preventDefault();
            return false;

        case ">":
            if (menu.tag == "travel")
                break;
        case "+":
        case " ":
            paging();
            event.preventDefault();
            return false;
        }

        if (api.pending())
            update_server_scroll();
    }

    return {
        menu_keydown_handler: menu_keydown_handler,
        menu_keypress_handler: menu_keypress_handler,
        next_hoverable_item: next_hoverable_item,
        cycle_hover: cycle_hover,
        paging: paging,
        line_up: line_up,
        line_down: line_down,
        snap_in_page: snap_in_page,
        scroll_to_item: scroll_to_item,
        scroll_bottom_to_item: scroll_bottom_to_item,
        update_visible_indices: update_visible_indices
    };
    };
});
