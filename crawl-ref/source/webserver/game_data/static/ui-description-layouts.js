define(["jquery", "comm", "client", "./ui", "./enums", "./cell_renderer",
        "./util", "./scroller", "./tileinfo-main", "./tileinfo-gui",
        "./tileinfo-player", "./ui-layout-format", "./ui-scroller-layouts", "./menu-presentation", "item-properties", "share-link"],
function ($, comm, client, ui, enums, cr, util, scroller, main, gui, player, format, scrolling, presentation, properties, shareLink) {
    "use strict";

    var describe_scale = 2.0;
    var fmt_body_txt = format.body;
    var _fmt_spellset_html = format.spellset;
    var _fmt_spells_list = format.spells_list;
    var paneset_cycle = format.paneset_cycle;
    var clickify_actions = format.actions;
    var format_spell_html = format.spell;
    var scroller_handle_key = scrolling.handle_key;

    function describe_generic(desc)
    {
        var $popup = $(".templates > .describe-generic").clone();
        var $body = $popup.children(".body");
        if (desc.title === "")
            $popup.children(".header").remove();
        else
            $popup.find(".header > span").text(desc.title);
        $body.html(fmt_body_txt(desc.body + desc.footer));
        var s = scroller($popup.children(".body")[0]);
        s.contentElement.className += " describe-generic-body";
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });

        var canvas = $popup.find(".header > canvas");
        if (desc.tile)
        {
            var renderer = new cr.DungeonCellRenderer();
            util.init_canvas(canvas[0],
                renderer.cell_width * describe_scale,
                renderer.cell_height * describe_scale);
            renderer.init(canvas[0]);
            renderer.draw_from_texture(desc.tile.t, 0, 0, desc.tile.tex, 0, 0,
                desc.tile.ymax, false, describe_scale);
        }
        else
            canvas.remove();

        return $popup;
    }

    function describe_feature_wide(desc)
    {
        var $popup = $(".templates > .describe-feature").clone();
        var $feat_tmpl = $(".templates > .describe-generic");
        desc.feats.forEach(function (feat) {
            var $feat = $feat_tmpl.clone().removeClass("hidden").addClass("describe-feature-feat");
            $feat.find(".header > span").text(feat.title);
            if (feat.body != feat.title)
            {
                var text = feat.body;
                if (feat.quote)
                     text += "\n\n" + feat.quote;
                $feat.find(".body").html(fmt_body_txt(text));
            }
            else
                $feat.find(".body").remove();

            var canvas = $feat.find(".header > canvas");
            var renderer = new cr.DungeonCellRenderer();
            util.init_canvas(canvas[0],
                renderer.cell_width * describe_scale,
                renderer.cell_height * describe_scale);
            renderer.init(canvas[0]);
            renderer.draw_from_texture(feat.tile.t, 0, 0, feat.tile.tex, 0, 0,
                feat.tile.ymax, false, describe_scale);
            $popup.append($feat);
        });
        if (desc.actions)
        {
            $popup.append("<div class=actions></div>");
            $popup.find(".actions").html(clickify_actions(desc.actions));
        }

        var s = scroller($popup[0]);
        $popup.on("keydown keypress", function (event) {
            var key = String.fromCharCode(event.which);
            if (key != "<" && key != ">") // XX not always
                scroller_handle_key(s, event);
        });
        return $popup;
    }

    function describe_item(desc)
    {
        var $popup = $(".templates > .describe-item").clone();
        $popup.find(".header > span").empty().append(properties.render(desc.title, { focusable: false }));
        var $body = $popup.find(".body");
        $body.html(_fmt_spellset_html(desc.body));
        _fmt_spells_list($body, desc.spellset, true);
        format.stat_grid($body[0]);
        var s = scroller($body[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });
        if (desc.actions)
            $popup.find(".actions").html(clickify_actions(desc.actions));
        else
            $popup.find(".actions").remove();
        presentation.actions($popup, desc);
        presentation.advanced($popup);
        if (desc.record_id)
            shareLink.controls("/randarts/" + encodeURIComponent(desc.record_id), desc.title)
                .insertAfter($popup.find(".header"));

        var canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas(canvas[0],
            renderer.cell_width * describe_scale,
            renderer.cell_height * describe_scale);
        renderer.init(canvas[0]);

        desc.tiles.forEach(function (tile) {
            renderer.draw_from_texture(tile.t, 0, 0, tile.tex, 0, 0, tile.ymax,
                false, describe_scale);
        });

        return $popup;
    }

    function describe_spell(desc)
    {
        var $popup = $(".templates > .describe-spell").clone();
        $popup.find(".header > span").text(desc.title);
        $popup.find(".body").html(format_spell_html(desc.desc));
        format.stat_grid($popup.find(".body")[0]);
        var s = scroller($popup.find(".body")[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });
        if (desc.can_mem)
            $popup.find(".actions").removeClass("hidden").empty().append(
                $("<button type='button' class='workflow-button workflow-primary' data-hotkey='M'>Memorise <kbd>M</kbd></button>"));

        var canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas(canvas[0],
            renderer.cell_width * describe_scale,
            renderer.cell_height * describe_scale);
        renderer.init(canvas[0]);
        renderer.draw_from_texture(desc.tile.t, 0, 0, desc.tile.tex, 0, 0,
            desc.tile.ymax, false, describe_scale);

        return $popup;
    }

    function describe_cards(desc)
    {
        var $popup = $(".templates > .describe-cards").clone();
        var $card_tmpl = $(".templates > .describe-generic");
        var t = gui.NEMELEX_CARD, tex = enums.texture.GUI;
        desc.cards.forEach(function (card) {
            var $card = $card_tmpl.clone().removeClass("hidden").addClass("describe-card");
            $card.find(".header > span").text(card.name);
            $card.find(".body").html(fmt_body_txt(card.desc));

            var canvas = $card.find(".header > canvas");
            var renderer = new cr.DungeonCellRenderer();
            util.init_canvas(canvas[0],
                renderer.cell_width * describe_scale,
                renderer.cell_height * describe_scale);
            renderer.init(canvas[0]);
            renderer.draw_from_texture(t, 0, 0, tex, 0, 0, 0, false,
                describe_scale);
            $popup.append($card);
        });
        var s = scroller($popup[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });
        return $popup;
    }

    function describe_god(desc)
    {
        var use_extra_pane = (desc.extra.length > 0);

        if (use_extra_pane)
            var $popup = $(".templates > #describe-god-extra").clone();
        else
            var $popup = $(".templates > #describe-god-basic").clone();
        $popup.find(".header > span").addClass("fg" + desc.colour).html(
                                                                    desc.name);

        var canvas = $popup.find(".header > canvas")[0];
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas(canvas,
            renderer.cell_width * describe_scale,
            renderer.cell_height * describe_scale);
        renderer.init(canvas);
        renderer.draw_from_texture(desc.tile.t, 0, 0,
                                   desc.tile.tex, 0, 0, 0, false,
                                   describe_scale);

        var $body = $popup.children(".body");
        var $footer = $popup.find(".footer > .paneset");
        var $panes = $body.children(".pane");

        if (!desc.is_altar)
            $footer.find('.join-keyhelp').remove();
        else
            $footer.find('.join-keyhelp').append(desc.service_fee)

        $panes.eq(0).find(".desc").html(fmt_body_txt(desc.description));
        $panes.eq(0).find(".god-favour td.title")
                    .addClass("fg"+desc.colour).html(desc.title);
        $panes.eq(0).find(".god-favour td.favour")
                    .addClass("fg"+desc.colour).html(desc.favour);
        var powers_list = desc.powers_list.split("\n").slice(3, -1);
        var $powers = $panes.eq(0).find(".god-powers");
        var re = /^(<[a-z]*>)?(.*\.) *(\(.*\))?$/;
        for (var i = 0; i < powers_list.length; i++)
        {
            var matches = powers_list[i].match(re);
            var colour = (matches.length == 4 && matches[1] === "<darkgrey>")
                ? 8 : desc.colour;
            var power = matches[2], cost = matches[3] || "";
            $powers.append("<div class='power fg"+colour+"'><div>"
                +power+"</div><div>"+cost+"</div></div>");
        }

        desc.powers = fmt_body_txt(desc.powers);
        if (desc.info_table.length !== "")
        {
            desc.powers += "<div class=tbl>"
                            + util.formatted_string_to_html(desc.info_table)
                            + "</div>";
        }
        $panes.eq(1).html(desc.powers);

        $panes.eq(2).html(
                    fmt_body_txt(desc.wrath));
        if (use_extra_pane)
        {
            $panes.eq(3).html("<div class=tbl>"
                                + util.formatted_string_to_html(desc.extra)
                                + "</div>");
        }

        var num_panes = (use_extra_pane ? 3 : 2)
        for (var i = 0; i <= num_panes; i++)
            scroller($panes.eq(i)[0]);


        $popup.on("keydown keypress", function (event) {
            var enter = event.which == 13, space = event.which == 32;
            if (enter || space)
                return;
            var s = scroller($panes.filter(".current")[0]);
            scroller_handle_key(s, event);
        });

        $popup.on("keydown", function (event) {
            if (event.key === "!" || event.key === "^")
            {
                paneset_cycle($body);
                paneset_cycle($footer);
            }
        });
        paneset_cycle($body);
        paneset_cycle($footer);

        presentation.tabs($popup, use_extra_pane ? ["Overview", "Powers", "Wrath", "Extra"] : ["Overview", "Powers", "Wrath"], function (index) {
            var current = $panes.index($panes.filter(".current"));
            for (var step = (index - current + $panes.length) % $panes.length; step > 0; step--)
                comm.send_message("key", { keycode: 33 });
            paneset_cycle($body, index); paneset_cycle($footer, index);
        });

        return $popup;
    }

    function describe_god_update(msg)
    {
        var $popup = ui.top_popup();
        if (!$popup.hasClass("describe-god"))
            return;
        if (msg.pane !== undefined && client.is_watching())
        {
            paneset_cycle($popup.children(".body"), msg.pane);
            var $footer = $popup.find(".footer > .paneset");
            if ($footer.length > 0)
                paneset_cycle($footer, msg.pane);
        }
        if (msg.prompt !== undefined)
            $popup.children(".footer").html(msg.prompt).addClass("fg3");
        presentation.updateTabs($popup);
    }

    function describe_item_spell_success(desc)
    {
        var $popup = ui.top_popup();
        if (desc.body !== undefined)
        {
            var $body = $popup.find(".simplebar-content");
            $body.html(fmt_body_txt(desc.body));
        }
    }

    function describe_monster(desc)
    {
        var $popup = $(".templates > .describe-monster").clone();
        $popup.find(".header > span").text(desc.title);
        var $body = $popup.find(".body.paneset");
        var $footer = $popup.find(".footer > .paneset");
        var $panes = $body.find(".pane");
        var $footer_panes = $footer.find(".pane");
        $panes.eq(0).html(_fmt_spellset_html(desc.body));
        _fmt_spells_list($panes.eq(0), desc.spellset, false);
        var have_quote = desc.quote !== "";
        var have_status = desc.status !== "";

        var footer0 = "<b class=\"fg15\">Description</b>";
        if (have_status)
            footer0 += " | Status";
        if (have_quote)
            footer0 += " | Quote";

        var footer1 = "Description";
        if (have_status)
            footer1 += " | <b class=\"fg15\">Status</b>";
        if (have_quote)
            footer1 += " | Quote";

        var footer2 = "Description";
        if (have_status)
            footer2 += " | Status";
        if (have_quote)
            footer2 += " | <b class=\"fg15\">Quote</b>";

        $footer_panes.eq(0).html(footer0);
        $footer_panes.eq(1).html(footer1);
        $footer_panes.eq(2).html(footer2);

        if (have_quote)
            $panes.eq(2).html(_fmt_spellset_html(desc.quote));
        else
        {
            $panes.eq(2).remove();
            $footer_panes.eq(2).remove();
        }

        if (have_status)
            $panes.eq(1).html(fmt_body_txt(desc.status));
        else
        {
            $panes.eq(1).remove();
            $footer_panes.eq(1).remove();
        }

        if (!have_status && !have_quote)
            $footer.parent().remove();

        var $canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas($canvas[0],
            renderer.cell_width * describe_scale,
            renderer.cell_height * describe_scale);
        renderer.init($canvas[0]);

        if ((desc.fg_idx >= main.MAIN_MAX) && desc.doll)
        {
            var mcache_map = {};
            if (desc.mcache)
            {
                for (var i = 0; i < desc.mcache.length; ++i)
                    mcache_map[desc.mcache[i][0]] = i;
            }
            $.each(desc.doll, function (i, doll_part) {
                var xofs = 0;
                var yofs = Math.max(0, player.get_tile_info(desc.doll[0][0]).h - 32);
                if (mcache_map[doll_part[0]] !== undefined)
                {
                    var mind = mcache_map[doll_part[0]];
                    xofs = desc.mcache[mind][1];
                    yofs += desc.mcache[mind][2];
                }
                renderer.draw_player(doll_part[0],
                        0, 0, xofs, yofs, doll_part[1], describe_scale);
            });
        }

        if ((desc.fg_idx >= player.MCACHE_START) && desc.mcache)
        {
            $.each(desc.mcache, function (i, mcache_part) {
                if (mcache_part) {
                    var yofs = Math.max(0, player.get_tile_info(mcache_part[0]).h - 32);
                    renderer.draw_player(mcache_part[0],
                            0, 0, mcache_part[1], mcache_part[2]+yofs,
                            undefined, describe_scale);
                }
            });
        }
        else if (desc.fg_idx > 0 && desc.fg_idx <= main.MAIN_MAX)
        {
            renderer.draw_foreground(0, 0, { t: {
                fg: { value: desc.fg_idx }, bg: 0, icons: [],
            }}, describe_scale);
        }

        renderer.draw_foreground(0, 0, { t: {
            fg: enums.prepare_fg_flags(desc.flag),
            bg: 0,
            icons: desc.icons,
        }}, describe_scale);

        for (var i = 0; i < $panes.length; i++)
            scroller($panes.eq(i)[0]);

        $popup.on("keydown keypress", function (event) {
            var s = scroller($panes.filter(".current")[0]);
            scroller_handle_key(s, event);
        });
        $popup.on("keydown", function (event) {
            if (event.key === "!")
            {
                paneset_cycle($body);
                if (have_quote || have_status)
                    paneset_cycle($footer);
            }
        });
        paneset_cycle($body);
        if (have_quote || have_status)
            paneset_cycle($footer);

        var labels = ["Description"];
        if (have_status) labels.push("Status");
        if (have_quote) labels.push("Quote");
        presentation.tabs($popup, labels, function (index) {
            var panes = $body.children(".pane"), current = panes.index(panes.filter(".current"));
            for (var step = (index - current + panes.length) % panes.length; step > 0; step--)
                comm.send_message("key", { keycode: 33 });
            paneset_cycle($body, index); paneset_cycle($footer, index);
        });

        return $popup;
    }

    function describe_monster_update(msg)
    {
        var $popup = ui.top_popup();
        if (!$popup.hasClass("describe-monster"))
            return;
        if (msg.pane !== undefined && client.is_watching())
        {
            paneset_cycle($popup.children(".body"), msg.pane);
            var $footer = $popup.find(".footer > .paneset");
            if ($footer.length > 0)
                paneset_cycle($footer, msg.pane);
        }
        presentation.updateTabs($popup);
    }

    function version(desc)
    {
        var $popup = $(".templates > .describe-generic").clone();
        $popup.find(".header > span").text(desc.information);
        var $body = $popup.find(".body");
        $body.html(fmt_body_txt(desc.features) + fmt_body_txt(desc.changes));
        var s = scroller($body[0]);
        $popup.on("keydown keypress", function (event) {
            scroller_handle_key(s, event);
        });

        var t = gui.STARTUP_STONESOUP, tex = enums.texture.GUI;
        var $canvas = $popup.find(".header > canvas");
        var renderer = new cr.DungeonCellRenderer();
        util.init_canvas($canvas[0],
            renderer.cell_width * describe_scale,
            renderer.cell_height * describe_scale);
        renderer.init($canvas[0]);
        renderer.draw_from_texture(t, 0, 0, tex, 0, 0, 0, false,
            describe_scale);

        return $popup;
    }

    return {
        handlers: {
            "describe-generic": describe_generic,
            "describe-feature-wide": describe_feature_wide,
            "describe-item": describe_item,
            "describe-spell": describe_spell,
            "describe-cards": describe_cards,
            "describe-god": describe_god,
            "describe-monster": describe_monster,
            "version": version
        },
        updates: {
            "describe-god": describe_god_update,
            "describe-monster": describe_monster_update,
            "describe-spell-success": describe_item_spell_success
        }
    };
});
