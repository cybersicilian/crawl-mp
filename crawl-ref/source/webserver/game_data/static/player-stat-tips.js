define(["jquery", "character-stat-help"], function ($, help) {
    "use strict";

    function set_rich_tip($el, title, badge, body, meta, html_body, mirror_parent)
    {
        if (!$el || !$el.length) return;
        var targets = mirror_parent ? $el.add($el.closest(".stat-row-interactive")) : $el;
        targets.attr({
            "data-tip-title": title || "",
            "data-tip-badge": badge || "",
            "data-tip-body": body || "",
            "data-tip-meta": meta || ""
        });
        if (html_body)
            targets.attr("data-tip-html", html_body);
        else
            targets.removeAttr("data-tip-html");
    }

    function update(player, title_text, species_god, place_desc) {
        var index_to_letter = player.index_to_letter;
        // Dynamically enrich stat tooltips with live player values
        set_rich_tip(
            $("#stats_titleline"),
            title_text || "Hero Overview",
            "[XL " + (player.xl || 1) + "]",
            "Level " + (player.xl || 1) + " " + (player.species_display_name || player.species || "Hero")
            + (player.god ? " worshipping " + player.god : "")
            + ". Your title is determined by your highest trained combat or magic skill.",
            "Press '%' for character overview | 'm' for skills",
            null,
            false
        );

        set_rich_tip(
            $("#stats_species_god"),
            species_god || "Species & Religion",
            "[Origin]",
            "Species: " + (player.species_display_name || player.species || "Unknown")
            + ". Governs innate mutations, level-up growth, and skill aptitudes. "
            + (player.god ? "Deity: " + player.god + "." : "Currently unaligned (no god worshipped)."),
            "Press 'A' for traits & mutations | '^' for religion",
            null,
            false
        );

        var piety_body = "You do not currently worship a deity. Pray at an altar to join a religion.";
        if (player.god === "Gozag")
        {
            piety_body = "Gozag uses Gold (" + (player.gold || 0) + " gp) instead of piety. Spend gold via 'a' to petition Gozag for potions, shops, or bribes.";
        }
        else if (player.god === "Xom")
        {
            piety_body = "Xom's amusement rank: " + ((player.piety_rank || 0) + 1) + "/6. Xom triggers chaotic effects based on how amused or bored they are.";
        }
        else if (player.god)
        {
            piety_body = "Piety with " + player.god + ": " + (player.piety_rank || 0) + "/6 stars"
                + (player.penance ? " (UNDER DIVINE PENANCE!)" : "")
                + (player.ostracism_pips ? " (" + player.ostracism_pips + " ostracism pips)" : "")
                + ". Higher piety unlocks divine abilities ('a') and gifts.";
        }
        set_rich_tip(
            $("#stats_piety"),
            "Divine Standing: " + (player.god || "Atheist"),
            player.penance ? "[Penance!]" : "[Religion]",
            piety_body,
            "Press '^' for divine powers & conduct | 'a' to use abilities",
            null,
            false
        );

        if (player.god === "Gozag")
        {
            set_rich_tip(
                $("#stats_gozag_gold, #stats_gozag_gold_label"),
                "Gozag Gold: " + (player.gold || 0) + " gp",
                "[Wealth]",
                "Gold fuels Gozag's divine powers (Potion Petition, Call Merchant, Bribe Branch) and purchases items in shops.",
                player.has_status("gold aura") ? "Gold Aura active: distracting enemies!" : "Press 'a' to petition Gozag",
                null,
                false
            );
        }

        var hp_pct = player.hp_max > 0 ? Math.round(100 * player.hp / player.hp_max) : 100;
        var hp_extra = "";
        if (player.poison_survival != null && player.poison_survival < player.hp)
            hp_extra += "\nPoison Alert: Projected HP after poison expires is " + player.poison_survival + " HP!";
        if (player.real_hp_max && player.real_hp_max != player.hp_max)
            hp_extra += "\nDrain Alert: Max HP is temporarily reduced from " + player.real_hp_max + " to " + player.hp_max + ".";
        set_rich_tip(
            $("#stats_hpline"),
            "Health (HP): " + player.hp + " / " + player.hp_max + " (" + hp_pct + "%)",
            "[Vital]",
            help.stats.hp.body + hp_extra,
            "Press '5' to rest & regenerate | 'q' to quaff healing potions",
            null,
            false
        );

        var mp_pct = player.mp_max > 0 ? Math.round(100 * player.mp / player.mp_max) : 100;
        var heat = player.species === "Automaton";
        var displayed = heat ? Math.max(0, player.mp_max - player.mp) : player.mp;
        var displayed_pct = heat ? (player.mp_max > 0 ? 100 - mp_pct : 0) : mp_pct;
        set_rich_tip(
            $("#stats_mpline"),
            (heat ? "Heat: " : "Magic Points (MP): ") + displayed + " / " + player.mp_max + " (" + displayed_pct + "%)",
            "[Vital]",
            heat ? "Engraved spells build heat; cooling restores capacity." : help.stats.mp.body,
            heat ? "Engravings activate automatically | '5' to rest and cool" : "Press 'z' to cast spells | '5' to rest and recover MP",
            null,
            false
        );

        var ac_mod_txt = player.ac_mod ? " (" + (player.ac_mod > 0 ? "+" : "") + player.ac_mod + " modifier)" : "";
        set_rich_tip(
            $("#stats_ac"),
            "Armour Class (AC): " + player.ac + ac_mod_txt,
            "[Defense]",
            help.stats.ac.body,
            player.ac_mod > 0 ? "Boosted by active effects" : player.ac_mod < 0 ? "Reduced by corrosion or debuffs!" : "Base + equipment Armour Class",
            null,
            true
        );

        var ev_mod_txt = player.ev_mod ? " (" + (player.ev_mod > 0 ? "+" : "") + player.ev_mod + " modifier)" : "";
        set_rich_tip(
            $("#stats_ev"),
            "Evasion (EV): " + player.ev + ev_mod_txt,
            "[Defense]",
            help.stats.ev.body,
            player.ev_mod > 0 ? "Boosted by agility/evasion buffs" : player.ev_mod < 0 ? "Reduced by encumbrance or status!" : "Scales with Dodging & Dexterity",
            null,
            true
        );

        var sh_mod_txt = player.sh_mod ? " (" + (player.sh_mod > 0 ? "+" : "") + player.sh_mod + " modifier)" : "";
        set_rich_tip(
            $("#stats_sh"),
            "Shields (SH): " + player.sh + sh_mod_txt,
            "[Defense]",
            help.stats.sh.body,
            player.sh > 0 ? "Shield defense active" : "No shield currently equipped",
            null,
            true
        );

        set_rich_tip(
            $("#stats_xl"),
            "Experience Level: XL " + player.xl + " (" + player.progress + "% to XL " + (player.xl + 1) + ")",
            "[Progression]",
            "Defeating monsters grants XP to advance your Experience Level (max 27) and train skills. Each XL grants HP, MP, Willpower, and +1 Str/Int/Dex every 3rd level.",
            "Next Level: " + player.progress + "% | Press 'm' to manage Skills",
            null,
            true
        );

        var noise_cat = $("#stats_noise").attr("data-level") || "quiet";
        var silenced = player.has_status("silence");
        set_rich_tip(
            $("#stats_noise"),
            "Dungeon Noise: " + (silenced ? "Silenced (0)" : noise_cat.toUpperCase()),
            "[Stealth]",
            silenced
                ? "You are enveloped in unnatural Silence. No sound can be made, preventing noise propagation and verbal spellcasting."
                : "Sound generated by your recent actions (category: " + noise_cat + "). Loud noises propagate through corridors and wake or attract monsters.",
            "Train Stealth ('m') to stay unnoticed near sleeping foes",
            null,
            false
        );

        set_rich_tip(
            $("#stats_str"),
            "Strength (Str): " + player.str + (player.str < player.str_max ? " (Base Max: " + player.str_max + ")" : ""),
            "[Attribute]",
            help.stats.str.body,
            player.str < player.str_max ? "Warning: Strength is currently drained!" : "Governs physical damage & heavy armour comfort",
            null,
            true
        );

        set_rich_tip(
            $("#stats_int"),
            "Intelligence (Int): " + player.int + (player.int < player.int_max ? " (Base Max: " + player.int_max + ")" : ""),
            "[Attribute]",
            help.stats.int.body,
            player.int < player.int_max ? "Warning: Intelligence is currently drained!" : "Governs spell success & magical potency",
            null,
            true
        );

        set_rich_tip(
            $("#stats_dex"),
            "Dexterity (Dex): " + player.dex + (player.dex < player.dex_max ? " (Base Max: " + player.dex_max + ")" : ""),
            "[Attribute]",
            help.stats.dex.body,
            player.dex < player.dex_max ? "Warning: Dexterity is currently drained!" : "Governs evasion, blocking, accuracy & stealth",
            null,
            true
        );

        set_rich_tip(
            $("#stats_place"),
            "Location: " + (place_desc || "Dungeon"),
            "[World]",
            "Current dungeon branch and floor depth (" + (place_desc || "D:1") + "). Deeper levels contain deadlier monsters and rarer artefacts.",
            "Press 'Ctrl+O' for Dungeon Overview | '<' / '>' to use stairs",
            null,
            true
        );

        var time_auts = ((player.time || 0) / 10.0).toFixed(1);
        var delta_auts = player.time_delta ? ((player.time_delta || 0) / 10.0).toFixed(1) : "0.0";
        set_rich_tip(
            $("#stats_time"),
            "Turn " + (player.turn || 0) + " | Time " + time_auts + " auts",
            "[Chronicle]",
            "Total turns: " + (player.turn || 0) + "\nTotal elapsed time: " + time_auts + " auts\nLast action duration: " + delta_auts + " auts (1.0 aut = normal speed).",
            "Fast weapons or Haste reduce action duration below 1.0 aut",
            null,
            true
        );

        var wep_name = player.weapon_index === -1
            ? (player.unarmed_attack || "Unarmed Combat")
            : (player.inv[player.weapon_index] ? player.inv[player.weapon_index].name : $("#stats_weapon").text());
        var wep_slot = index_to_letter(player.weapon_index);
        set_rich_tip(
            $("#stats_weapon_container"),
            "Primary Weapon: " + (wep_slot !== "-" ? wep_slot + ") " : "") + wep_name,
            "[Weapon]",
            "Your active primary weapon (" + wep_name + ") used when striking monsters in melee or firing ranged attacks.",
            "Press 'w' to wield another weapon | ''' to swap slot a/b",
            null,
            true
        );

        if (player.offhand_weapon)
        {
            var off_name = player.offhand_index === -1
                ? "None"
                : (player.inv[player.offhand_index] ? player.inv[player.offhand_index].name : $("#stats_offhand_weapon").text());
            var off_slot = index_to_letter(player.offhand_index);
            set_rich_tip(
                $("#stats_offhand_weapon_line"),
                "Offhand Weapon: " + (off_slot !== "-" ? off_slot + ") " : "") + off_name,
                "[Offhand]",
                "Your dual-wielded secondary weapon (" + off_name + "), attacking alongside your primary weapon.",
                "Coglin dual-wielding slot",
                null,
                false
            );
        }

        var quiv_txt = $("#stats_quiver").text().trim() || "Empty";
        set_rich_tip(
            $("#stats_quiver_line"),
            "Quiver: " + quiv_txt,
            "[Quiver]",
            "Your readied ranged projectile, throwing weapon, spell, or ability (" + quiv_txt + ").",
            "Press 'f' to fire/activate quiver | 'Q' to change quiver",
            null,
            false
        );

        if (window.dcss_tooltips && window.dcss_tooltips.refresh)
            window.dcss_tooltips.refresh();
    }

    return { set: set_rich_tip, update: update };
});
