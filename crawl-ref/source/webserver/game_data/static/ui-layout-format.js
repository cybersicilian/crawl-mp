define(["jquery", "comm", "./enums", "./cell_renderer", "./util", "rich-text"],
function ($, comm, enums, cr, util, richText) {
    "use strict";

    function fmt_body_txt(txt)
    {
        return richText.render(txt, { colours: util.colours });
    }

    function _fmt_spellset_html(desc)
    {
        var desc_parts = desc.split("SPELLSET_PLACEHOLDER")
            .map(fmt_body_txt)
        if (desc_parts.length == 2)
            desc_parts.splice(1, 0, "<div id=spellset_placeholder></div>")
        return desc_parts.join("");
    }

    function _fmt_spells_list(root, spellset, colour)
    {
        var $container = root.find("#spellset_placeholder");
        // XX this container only seems to be added if there are spells, do
        // we actually need to remove it again?
        if ($container.length === 0 && spellset.length !== 0)
        {
            root.prepend("<div class='fg4'>Buggy spellset!</div>");
            return;
        }
        $container.attr("id", "").addClass("menu_contents spellset");
        if (spellset.length === 0)
        {
            $container.remove();
            return;
        }
        $.each(spellset, function (i, book) {
            if (book.label.trim())
                $container.append(book.label);
            var $list = $("<ol>");
            $.each(book.spells, function (i, spell) {
                var $item = $("<li class=selectable role='button' tabindex='0'>");
                var $canvas = $("<canvas class='glyph-mode-hidden'>");
                var letter = spell.letter;
                $item.attr("data-hotkey", letter);

                var renderer = new cr.DungeonCellRenderer();
                util.init_canvas($canvas[0], renderer.cell_width, renderer.cell_height);
                renderer.init($canvas[0]);
                renderer.draw_from_texture(spell.tile, 0, 0, enums.texture.GUI, 0, 0, 0, false);
                $item.append($canvas);

                var label = " " + letter + " - " + spell.title;
                $item.append("<span>" + util.formatted_string_to_html(label) + "</span>");

                if (spell.effect !== undefined)
                    $item.append("<span>" + util.formatted_string_to_html(spell.effect) + " </span>");
                if (spell.range_string !== undefined)
                    $item.append("<span>" + util.formatted_string_to_html(spell.range_string) + " </span>");

                $list.append($item);
                if (colour)
                    $item.addClass("fg"+spell.colour);
                $item.on("click", function () {
                    comm.send_message("text_input", { text: letter });
                    return false;
                });
            });
            $container.append($list);
        });
    }

    function paneset_cycle($el, next)
    {
        var $panes = $el.children(".pane");
        var $current = $panes.filter(".current").removeClass("current");
        if (next === undefined)
            next = $panes.index($current) + 1;
        $panes.eq(next % $panes.length).addClass("current");
    }

    // Given some string like "e(v)oke", produce a span with the `data-hotkey`
    // attribute set on that span. This auto-enables clicking. This will
    // handle both a final period, and a sequence of prefix words that do not
    // have a hotkey marked in them.
    // TODO: it might be more robust to produce structured info on the server
    // side...
    function clickify_action(action_text)
    {
        var suffix = "";
        var prefix = "";
        // makes some assumptions about how this is joined...see describe.cc
        // _actions_desc.
        if (action_text.endsWith(".")) // could be more elegant...
        {
            suffix = ".";
            action_text = action_text.slice(0, -1);
        }
        if (action_text.startsWith("or "))
        {
            prefix = "or ";
            action_text = action_text.substr(3);
        }
        var hotkeys = action_text.match(/\(.\)/); // very inclusive for the key name
        var data_attr = ""
        if (hotkeys)
            data_attr = " data-hotkey='" + hotkeys[0][1] + "'";
        return prefix
            + "<span" + data_attr + ">" + action_text + "</span>"
            + suffix;
    }

    // Turn a list of actions like that found in the describe item popup into
    // clickable links.
    function clickify_actions(actions_text)
    {
        // assumes that the list is joined via ", ", including the final
        // element. (I.e. this will break without the Oxford comma.)
        var words = actions_text.split(", ");
        var linkized = [];
        words.forEach(function(w) {
            linkized.push(clickify_action(w));
        });
        return linkized.join(", ");
    }

    function format_spell_html(desc)
    {
        var parts = desc.match(/(^[\s\S]*\n\n)(Level: [^\n]+)(\n\n[\s\S]*)$/);
        if (parts == null || parts.length != 4)
            return fmt_body_txt(desc);
        return fmt_body_txt(parts[1]) + "<pre class='native-spell-stats'>"
            + util.formatted_string_to_html(parts[2]) + "</pre>" + fmt_body_txt(parts[3]);
    }

    // Native stat lines ("Base accuracy: +2  Base damage: 7", "Level: 3
    // School: Fire  Fail: 4%") become a labelled definition grid. Only runs of
    // "Label: value" pairs convert; any other prose stays where it was.
    var stat_pair = /^([A-Z][A-Za-z' ]{1,24}): (\S.*)$/;
    function stat_segments(node)
    {
        var segments = [], current = document.createElement("span");
        function flush() {
            if (current.textContent.trim()) segments.push(current);
            current = document.createElement("span");
        }
        Array.from(node.childNodes).forEach(function (child) {
            if (child.nodeName === "BR") { flush(); return; }
            var text = child.nodeType === 3 ? child.nodeValue : child.textContent;
            var parts = text.split(/ {2,}|\n/);
            parts.forEach(function (part, index) {
                if (index) flush();
                if (!part) return;
                if (child.nodeType === 3) current.appendChild(document.createTextNode(part));
                else { var copy = child.cloneNode(true); copy.textContent = part; current.appendChild(copy); }
            });
        });
        flush();
        return segments;
    }
    function stat_grid(root)
    {
        $(root).find("pre.native-spell-stats, .rich-text > p").each(function () {
            var segments = stat_segments(this), rows = [];
            while (segments.length && stat_pair.test(segments[0].textContent.trim()))
                rows.push(segments.shift());
            if (rows.length < 2) return;
            var grid = $("<dl class='workflow-stat-grid'></dl>");
            rows.forEach(function (segment) {
                var match = segment.textContent.trim().match(stat_pair);
                var value = $("<dd></dd>").append($(segment).contents());
                // Strip the label from the first text node so value markup survives.
                var first = value[0].firstChild;
                while (first && first.nodeType !== 3 && first.firstChild) first = first.firstChild;
                if (first && first.nodeType === 3)
                    first.nodeValue = first.nodeValue.replace(/^\s*[A-Z][A-Za-z' ]{1,24}: /, "");
                grid.append($("<div></div>").append($("<dt></dt>").text(match[1]), value));
            });
            var rest = $("<p></p>");
            segments.forEach(function (segment, index) {
                if (index) rest.append(document.createElement("br"));
                rest.append($(segment).contents());
            });
            $(this).replaceWith(rest.text().trim() ? grid.add(rest) : grid);
        });
    }

    return {
        stat_grid: stat_grid,
        body: fmt_body_txt,
        spellset: _fmt_spellset_html,
        spells_list: _fmt_spells_list,
        paneset_cycle: paneset_cycle,
        actions: clickify_actions,
        spell: format_spell_html
    };
});
