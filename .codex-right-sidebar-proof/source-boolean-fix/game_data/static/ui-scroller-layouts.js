define(["jquery", "comm", "client", "./ui", "./util", "./scroller", "./options"],
function ($, comm, client, ui, util, scroller, options) {
    "use strict";

    var update_server_scroll_timeout = null;
    var scroller_from_server = false;

    function scroller_handle_key(scroller, event)
    {
        if (event.altKey || event.shiftkey || event.ctrlKey) {
            if (update_server_scroll_timeout)
                update_server_scroll();
            return;
        }

        var handled = true;

        if (event.type === "keydown")
            switch (event.which)
            {
                case 33: // page up
                    scroller_scroll_page(scroller, -1);
                    break;
                case 34: // page down
                    scroller_scroll_page(scroller, 1);
                    break;
                case 35: // end
                    scroller_scroll_to_line(scroller, 2147483647); //int32_t max
                    break;
                case 36: // home
                    scroller_scroll_to_line(scroller, 0);
                    break;
                case 38: // up
                    scroller_scroll_line(scroller, -1);
                    break;
                case 40: // down
                    scroller_scroll_line(scroller, 1);
                    break;
                default:
                    handled = false;
                    break;
            }
        else if (event.type === "keypress")
            switch (String.fromCharCode(event.which))
            {
                case " ": case ">": case "+": case '\'':
                    scroller_scroll_page(scroller, 1);
                    break;
                case "-": case "<": case ";":
                    scroller_scroll_page(scroller, -1);
                    break;
                default:
                    handled = false;
                    break;
            }
        else
            handled = false;

        if (handled)
        {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
        return handled;
    }

    function scroller_line_height(scroller)
    {
        var span = $(scroller.scrollElement).siblings('.scroller-lhd')[0];
        var rect = span.getBoundingClientRect();
        return rect.bottom - rect.top;
    }

    function scroller_scroll_page(scroller, dir)
    {
        var line_height = scroller_line_height(scroller);
        var contents = $(scroller.scrollElement);
        // XX this is a bit weird, maybe context[0] is the wrong thing to use?
        // The -24 is to compensate for the top/bottom shades. In practice, the
        // top line ends up a bit in the shade in long docs, possibly it should
        // be adjusted for.
        var page_shift = contents[0].getBoundingClientRect().height - 24;
        page_shift = Math.floor(page_shift / line_height) * line_height;
        contents[0].scrollTop += page_shift * dir;
        update_server_scroll();
    }

    function scroller_scroll_line(scroller, dir)
    {
        var line_height = scroller_line_height(scroller);
        var contents = $(scroller.scrollElement);
        contents[0].scrollTop += line_height * dir;
        update_server_scroll(scroller);
    }

    function scroller_scroll_to_line(scroller, line)
    {
        var $scroller = $(scroller.scrollElement);
        // TODO: can this work without special-casing int32_t max, where any
        // pos greater than the max scrolls to end?
        if (line == 2147483647) // FS_START_AT_END
        {
            // special case for webkit: excessively large values don't work
            var inner_h = $(scroller.contentElement).outerHeight();
            $scroller[0].scrollTop = inner_h - $scroller.parent().outerHeight();
        }
        else
        {
            var line_height = scroller_line_height(scroller);
            line *= line_height;
            $scroller[0].scrollTop = line;
        }
    }

    function update_server_scroll()
    {
        if (update_server_scroll_timeout)
        {
            clearTimeout(update_server_scroll_timeout);
            update_server_scroll_timeout = null;
        }
        var $popup = ui.top_popup();
        if (!$popup.hasClass("formatted-scroller"))
            return;
        var body = $popup.find(".simplebar-scroll-content").parent()[0];
        var s = scroller(body);
        var container = s.scrollElement;
        var line_height = scroller_line_height(s);
        comm.send_message("formatted_scroller_scroll", {
            scroll: Math.round(container.scrollTop / line_height),
        });
    }

    function scroller_onscroll()
    {
        // don't tell the server we scrolled, when we did so because the
        // server told us to; not absolutely necessary, but nice to have
        if (scroller_from_server)
            return;
        if (!update_server_scroll_timeout)
            update_server_scroll_timeout = setTimeout(update_server_scroll, 100);
    }

    function formatted_scroller(desc)
    {
        var $popup = $(".templates > .formatted-scroller").clone();
        var $body = $popup.children(".body");
        var body_html = util.formatted_string_to_html(desc.text);
        if (desc.highlight !== "")
        {
            var rexp = '[^\n]*('+desc.highlight+')[^\n]*\n?';
            var re = new RegExp(rexp, 'g');
            body_html = body_html.replace(re, function (line) {
                return "<span class=highlight>" + line + "</span>";
            });
        }
        $popup.attr("data-tag", desc.tag);
        $body.html(body_html);
        if (desc.more)
            $popup.children(".more").html(util.formatted_string_to_html(desc.more));
        else
            $popup.children(".more").remove();

        // XX why do some layouts use a span inside of a div, some just use
        // the div? (Answer remains unclear to me, but something about
        // preformatting + nested spans did mess this up when I tried to use
        // a template span here)
        if (desc.title)
            $popup.children(".header").html(util.formatted_string_to_html(desc.title));
        else
            $popup.children(".header").remove();

        var s = scroller($body[0]);
        var scroll_elem = s.scrollElement;
        scroll_elem.addEventListener("scroll", scroller_onscroll);
        $popup.on("keydown keypress", function (event) {
            if (event.which !== 36 || desc.tag !== "help")
                scroller_handle_key(s, event);
        });
        if (desc.easy_exit && options.get("tile_web_mouse_control"))
        {
            $popup.on("click", function () {
                // XX a bit ad hoc
                comm.send_message("key", { keycode: 27 });
            });
        }
        return $popup;
    }

    function formatted_scroller_update(msg)
    {
        var $popup = ui.top_popup();
        if (!$popup.hasClass("formatted-scroller"))
            return;
        var s = scroller($popup.find(".body")[0]);
        if (msg.text !== undefined)
        {
            var $body = $(s.contentElement);
            $body.html(util.formatted_string_to_html(msg.text));
            var ss = $popup.find(".body").eq(0).data("scroller");
            ss.recalculateImmediate();
        }
        if (msg.scroll !== undefined && (!msg.from_webtiles || client.is_watching()))
        {
            scroller_from_server = true;
            scroller_scroll_to_line(s, msg.scroll);
            scroller_from_server = false;
        }
    }

    function cleanup()
    {
        if (update_server_scroll_timeout)
        {
            clearTimeout(update_server_scroll_timeout);
            update_server_scroll_timeout = null;
        }
    }

    return {
        render: formatted_scroller,
        update: formatted_scroller_update,
        handle_key: scroller_handle_key,
        to_line: scroller_scroll_to_line,
        cleanup: cleanup
    };
});
