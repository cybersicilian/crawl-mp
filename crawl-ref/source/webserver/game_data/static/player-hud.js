define(["jquery", "./options", "./util", "./player-stat-tips", "./status-icons"],
function ($, options, util, stat_tips, icons) {
    "use strict";

    // Render the native player state; protocol and inventory identity stay in player.js.
    function create(player) {
        var set_rich_tip = stat_tips.set;
        var index_to_letter = player.index_to_letter;
        var inventory_item_desc = player.inventory_item_desc;

        var stat_boosters = {
            "str": "vitalised",
            "int": "vitalised",
            "dex": "vitalised",
            "hp": "divinely vigorous|berserking",
            "mp": "divinely vigorous"
        };

        /**
         * Update the stats area bar of the given type.
         * @param name     The name of the bar.
         * @param propname The player property name, if it is different from the
         *                 name of the bar defined in game_data/template/game.html
         */
        function update_bar(name, propname)
        {
            if (!propname) propname = name;

            var value = player[propname], max = Math.max(1, player[propname + "_max"] || 0);
            var heat = name === "mp" && player.species === "Automaton";
            if (heat) value = Math.max(0, (player.mp_max || 0) - (player.mp || 0));
            var old_key = heat ? "old_heat" : "old_" + propname;
            var old_value;
            if (old_key in player)
                old_value = player[old_key];
            else
                old_value = value;
            if (value < 0)
                value = 0;
            if (old_value > max)
                old_value = max;
            player[old_key] = value;
            var increase = old_value < value;
            // XX should both of these be floor?
            var full_bar = Math.round(10000 * (increase ? old_value : value) / max);
            var change_bar = Math.floor(10000 * Math.abs(old_value - value) / max);
            // Use poison_survival to display our remaining hp after poison expires.
            if (name == "hp")
            {
                $("#stats_hp_bar_poison").css("width", 0);
                var poison_bar = 0;
                var poison_survival = Math.max(0, player["poison_survival"]);
                if (Number.isFinite(poison_survival) && poison_survival < value)
                {
                    poison_bar = Math.round(10000 * (value - poison_survival)
                                                / max);
                    full_bar = Math.round(10000 * poison_survival / max);
                    $("#stats_hp_bar_poison").css("width", (poison_bar / 100)
                                                  + "%");
                }
                if (full_bar + poison_bar + change_bar > 10000)
                    change_bar = 10000 - poison_bar - full_bar;
            }
            else if (full_bar + change_bar > 10000)
            {
                change_bar = 10000 - full_bar;
            }

            $("#stats_" + name + "_bar_full").css("width", (full_bar / 100) + "%");
            $("#stats_" + name + "_bar_" + (increase ? "increase" : "decrease"))
                .css("width", (change_bar / 100) + "%");
            $("#stats_" + name + "_bar_" + (increase ? "decrease" : "increase"))
                .css("width", 0);
        }

        function update_bar_noise()
        {
            player.noise_max = 1000;
            var level = player.adjusted_noise, max = player.noise_max;
            var old_value;
            if ("old_noise" in player)
                old_value = player.old_noise
            else
                old_value = level;
            if (level < 0)
                level = 0;
            if (old_value > max)
                old_value = max;

            // The adjusted_noise value has already been rescaled in
            // player.cc:get_adjusted_noise. It ranges from 0 to 1000.
            var adjusted_level = 0, noise_cat = "";

            // colors are set in `style.css` via the selector `data-level`.
            if (level <= 333)
                noise_cat = "quiet";
            else if (level <= 666)
                noise_cat = "loud";
            else if (level < 1000)
                noise_cat = "veryloud";
            else
                noise_cat = "superloud";

            var silenced = player.has_status("silence")
            if (silenced)
            {
                level = 0;
                old_value = 0;
                noise_cat = "blank";
                // I couldn't get this to work just directly putting the text in #stats_noise_bar,
                // because clearing the text later will adjust the span width.
                $("#stats_noise_status").text("Silenced");
            } else {
                $("#stats_noise_status").text("");
            }
            $("#stats_noise").attr("data-level", noise_cat);

            player.old_noise = level;


            var full_bar = Math.round(10000 * level / max);
            var change_bar = Math.round(10000 * Math.abs(old_value - level) / max);
            if (full_bar + change_bar > 10000)
            {
                change_bar = 10000 - full_bar;
            }

            if (player.wizard && !silenced)
            {
                // the exact value is too hard to interpret to show outside of
                // wizmode, because noise propagation is very complicated.
                $("#stats_noise").attr("data-shownum", true);
                $("#stats_noise_num").text(player.noise);
            }
            else
            {
                $("#stats_noise").attr("data-shownum", null);
                $("#stats_noise_num").text("");
            }

            $("#stats_noise_bar_full").css("width", (full_bar / 100) + "%");
            if (adjusted_level < old_value)
                $("#stats_noise_bar_decrease").css("width", (change_bar / 100) + "%");
            else
                $("#stats_noise_bar_decrease").css("width", 0);
        }

        function repeat_string(s, n)
        {
            return Array(n+1).join(s);
        }

        function wielded_weapon(offhand=false)
        {
            var elem;
            var wielded = offhand ? player.offhand_index : player.weapon_index;
            var colour = offhand ? player.offhand_weapon_colour
                                 : player.weapon_colour;
            if (wielded == -1)
            {
                elem = $("<span>");
                elem.text(player.unarmed_attack);
                elem.addClass("fg" + colour);
            }
            else
                elem = inventory_item_desc(wielded, false, colour);

            return elem;
        }

        function quiver()
        {
            // any use for player.quiver_available any more?
            return util.formatted_string_to_html(player.quiver_desc);
        }

        function update_defense(type)
        {
            var elem = $("#stats_"+type);
            elem.text(player[type]);
            elem.removeClass();

            if (type == "ac")
            {
                if (player.ac_mod > 0)
                    elem.addClass("boosted_defense");
                else if (player.ac_mod < 0)
                    elem.addClass("degenerated_defense");
            }
            else if (type == "ev")
            {
                if (player.ev_mod > 0)
                    elem.addClass("boosted_defense");
                else if (player.ev_mod < 0)
                    elem.addClass("degenerated_defense");
            }
            else if (type == "sh")
            {
                if (player.sh_mod > 0)
                    elem.addClass("boosted_defense");
                else if (player.sh_mod < 0)
                    elem.addClass("degenerated_defense");
            }
        }

        function stat_class(stat)
        {
            var val = player[stat];
            var max_val = player[stat + "_max"];
            if (player.has_status("lost " + stat))
                return "zero_stat";

            var limits = options.get("stat_colour")
            for (var i in limits)
                if (val <= limits[i].value)
                    return "colour_" + limits[i].colour;

            if (player.has_status(stat_boosters[stat]))
                return "boosted_stat";

            if (val < max_val)
                return "degenerated_stat";

            return "";
        }

        function update_stat(stat)
        {
            var val = player[stat];
            var max_val = player[stat + "_max"];
            var elem = $("<span>");
            elem.text(val);
            if (val < max_val)
            {
                elem.append(" (" + max_val + ")");
            }
            elem.addClass(stat_class(stat));
            $("#stats_" + stat).html(elem);
        }

        function update_doom()
        {
            if (player.doom == 0 && options.get("always_show_doom_contam") === false)
            {
                $("#stats_doom_ui").hide();
                return;
            }
            else
                $("#stats_doom_ui").show();

            var val = player["doom"] || 0;
            var elem = $("<span>");
            elem.text(" " + val + "%");

            var colour = "fg7";
            if (player.doom == 0)
                colour = "fg8";
            if (player.doom >= 75)
                colour = "fg5";
            else if (player.doom >= 50)
                colour = "fg12";
            else if (player.doom >= 25)
                colour = "fg14";

            elem.addClass(colour);
            var tooltip = $("#stats_status_lights_tooltip");
            // Hide the tooltip so that it goes away if expired.
            tooltip.hide();
            $("#stats_doom").html(elem);

            var doom_html = player["doom_desc"]
                ? util.formatted_string_to_html(player["doom_desc"])
                : "";
            set_rich_tip(
                $("#stats_doom_ui"),
                "Doom: " + val + "%",
                "[Hazard]",
                "Accumulated Doom (" + val + "%). Reaching 100% Doom triggers severe planar consequences.",
                "Avoid doom-inflicting attacks",
                doom_html,
                false
            );
        }

        function update_contam()
        {
            if (player.contam == 0 && options.get("always_show_doom_contam") === false)
            {
                $("#stats_contam_ui").hide();
                return;
            }
            else
                $("#stats_contam_ui").show();

            var val = player.contam || 0;
            var elem = $("<span>");
            elem.text(" " + val + "%");

            var colour = "fg8";
            if (val >= 200)
                colour = "fg4";
            else if (val >= 100)
                colour = "fg14";
            elem.addClass(colour);
            $("#stats_contam").html(elem);

            set_rich_tip(
                $("#stats_contam_ui"),
                "Magical Contamination: " + val + "%",
                "[Hazard]",
                "Residual arcane radiation (" + val + "%). High contamination (100%+) can cause mutagenic bursts and explosions.",
                val > 0 ? "Dissipates gradually over turns" : "No active magical contamination",
                null,
                false
            );
        }

        function percentage_color(name)
        {
            var real = false;
            // There is only real_hp_max, real_mp_max doesn't exist
            if (player["real_" + name + "_max"]
                && player["real_" + name + "_max"] != player[name + "_max"])
                real = true;

            $("#stats_" + name).removeClass();
            $("#stats_" + name + "_separator").removeClass();
            $("#stats_" + name + "_max").removeClass();
            if (real)
                $("#stats_real_" + name + "_max").removeClass();

            if (player.has_status(stat_boosters[name]))
            {
                $("#stats_" + name).addClass("boosted_stat");
                $("#stats_" + name + "_separator").addClass("boosted_stat");
                $("#stats_" + name + "_max").addClass("boosted_stat");
                if (real)
                    $("#stats_real_" + name + "_max").addClass("boosted_stat");
                return;
            }

            var val = player[name] / player[(real ? "real_" : "") + name + "_max"]
                      * 100;
            var limits = options.get(name + "_colour");
            var colour = null;
            for (var i in limits)
                if (val <= limits[i].value)
                    colour = limits[i].colour;

            if (colour)
                $("#stats_" + name).addClass("colour_" + colour);
        }

        var simple_stats = ["hp", "hp_max", "mp", "mp_max", "xl", "progress"];
        /**
         * Update the stats pane area based on the player's current properties.
         */
        function update_stats_pane()
        {
            var title_text = player.name
                             + (player.title && player.title[0] === "," ? "" : " ")
                             + (player.title || "");
            $("#stats_titleline").text(title_text);
            $("#stats_wizmode").text(player.wizard ? "*WIZARD*" : player.explore ? "*EXPLORE*" : "");

            var species_god = player.species_display_name;
            if (player.god != "")
                species_god += " of " + player.god;
            if (player.god == "Xom")
            {
                if (player.piety_rank >=0)
                {
                    $("#stats_piety").text(repeat_string(".",player.piety_rank) + "*"
                                           + repeat_string(".",5-player.piety_rank));
                }
                else
                    $("#stats_piety").text("......"); // very special plaything
            }
            else if ((player.piety_rank > 0 || player.god != "")
                     && player.god != "Gozag")
            {
                $("#stats_piety").html(repeat_string("*", player.piety_rank)
                                       + repeat_string(".", 6-player.piety_rank-player.ostracism_pips)
                                       + "<span class=fg5>"
                                       + repeat_string("X", player.ostracism_pips)
                                       + "</span>");
            }
            else
                $("#stats_piety").text("");

            if (player.god == "Gozag")
            {
                $("#stats_gozag_gold_label").text(" Gold: ");
                $("#stats_gozag_gold_label").css("padding-left", "0.5em");
                $("#stats_gozag_gold").text(player.gold);
            } else {
                $("#stats_gozag_gold_label").text("");
                $("#stats_gozag_gold").text("");
                $("#stats_gozag_gold_label").css("padding-left", "0");
            }
            $("#stats_gozag_gold").toggleClass("boosted_stat", !!player.has_status("gold aura"));

            $("#stats_species_god").text(species_god);
            $("#stats_piety").toggleClass("penance", !!player.penance);
            $("#stats_piety").toggleClass("monk", player.god == "");

            for (var i = 0; i < simple_stats.length; ++i)
                $("#stats_" + simple_stats[i]).text(player[simple_stats[i]]);

            var heat = player.species === "Automaton";
            $("#stats_mpline > .stats_caption").text(heat ? "Heat:" : "Magic:");
            if (heat)
                $("#stats_mp").text(Math.max(0, player.mp_max - player.mp));

            $("#stats_hpline > .stats_caption").text(
                (player.real_hp_max != player.hp_max) ? "HP:" : "Health:");

            if (player.real_hp_max != player.hp_max)
                $("#stats_real_hp_max").text("(" + player.real_hp_max + ")");
            else
                $("#stats_real_hp_max").text("");

            if (player.species == "Deep Dwarf" && player.dd_real_mp_max != player.mp_max)
                $("#stats_dd_real_mp_max").text("(" + player.dd_real_mp_max + ")");
            else
                $("#stats_dd_real_mp_max").text("");

            percentage_color("hp");
            percentage_color("mp");
            update_bar("hp");
            // is there a better place to do this?
            if (player.species == "Djinni")
                $("#stats_mpline").hide();
            else
                $("#stats_mpline").show();

            update_bar("mp");

            update_doom();
            update_contam();

            update_defense("ac");
            update_defense("ev");
            update_defense("sh");

            update_stat("str");
            update_stat("int");
            update_stat("dex");
            update_bar_noise();

            if (options.get("show_game_time") === true)
            {
                $("#stats_time_caption").text("Time:");
                $("#stats_time").text((player.time / 10.0).toFixed(1));
            }
            else
            {
                $("#stats_time_caption").text("Turn:");
                $("#stats_time").text(player.turn);
            }

            if (player.time_delta)
                $("#stats_time").append(" (" + (player.time_delta / 10.0).toFixed(1) + ")");

            var place_desc = player.place;
            if (player.depth) place_desc += ":" + player.depth;
            $("#stats_place").text(place_desc);
            $("#hud_minimap_floor").text(place_desc || "Floor unknown");

            var tooltip = $("#stats_status_lights_tooltip");
            // Hide the tooltip so that it goes away if expired.
            tooltip.hide();
            $("#stats_status_lights").html("");
            for (var i = 0; i < player.status.length; ++i)
            {
                let status_inf = player.status[i];
                if (!status_inf.light) continue;
                let status = $("<span>");
                status.addClass("status_light");
                status.addClass("fg" + status_inf.col);
                if (status_inf.use_html)
                    status.html(util.formatted_string_to_html(status_inf.light))
                else
                    status.text(status_inf.light);

                var clean_light = status.text().trim() || status_inf.light;
                var status_title = "Status: " + clean_light + (status_inf.text ? " (" + status_inf.text + ")" : "");
                var is_bad_col = typeof status_inf.is_bad === "boolean" ? status_inf.is_bad
                    : (status_inf.col === 4 || status_inf.col === 12 || status_inf.col === 5);
                var tone = typeof status_inf.is_bad === "boolean" || Number.isFinite(status_inf.col)
                    ? (is_bad_col ? "bad" : "active") : "unknown";
                var status_badge = tone === "unknown" ? "[Effect type unavailable]"
                    : is_bad_col ? "[Hazard / Debuff]" : "[Active Status]";
                var desc_html = status_inf.desc
                    ? util.formatted_string_to_html(status_inf.desc)
                    : "";
                set_rich_tip(
                    status,
                    status_title,
                    status_badge,
                    status_inf.desc ? "" : "Active status effect on your hero.",
                    "Press '@' or '%' for full status details",
                    desc_html,
                    false
                );
                var glyph = icons.resolve(status_inf.text || clean_light);
                status.empty().attr({ role: "img", tabindex: "0",
                    "aria-label": status_title + ". " + status_badge,
                    "data-status-icon": glyph }).toggleClass("is-bad", is_bad_col)
                    .on("keydown keypress keyup click", function (event) { event.stopPropagation(); });
                icons.frame(status[0], { glyph: glyph, tone: tone,
                    expiring: /\bexpiring\b/i.test(status_inf.text || clean_light) });
                $("#stats_status_lights").append(status, " ");
            }

            $("#stats_weapon_letter").text(
                index_to_letter(player.weapon_index) + ")");
            $("#stats_weapon").html(wielded_weapon());

            if (player.offhand_weapon) // Coglin dual wielding
                $("#stats_offhand_weapon_line").show();
            else
                $("#stats_offhand_weapon_line").hide();

            $("#stats_offhand_weapon_letter").text(
                index_to_letter(player.offhand_index) + ")");
            $("#stats_offhand_weapon").html(wielded_weapon(true));

            $("#stats_quiver").html(quiver());

            stat_tips.update(player, title_text, species_god, place_desc);
        }

        return update_stats_pane;
    }

    return { create: create };
});
