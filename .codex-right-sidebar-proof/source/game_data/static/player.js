define(["jquery", "comm", "client", "./map_knowledge", "./messages",
        "./options", "./player-hud", "./player-interactions", "game-loading"],
function ($, comm, client, map_knowledge, messages, options, hud, interactions, loading) {
    "use strict";

    var player = {}, last_time;

    function index_to_letter(index)
    {
        if (index === -1)
            return "-"
        else if (index < 26)
            return String.fromCharCode("a".charCodeAt(0) + index);
        else
            return String.fromCharCode("A".charCodeAt(0) + index - 26);
    }
    player.index_to_letter = index_to_letter;

    function inventory_item_desc(index, parens=false, colour=-1)
    {
        var item = player.inv[index];
        var elem = $("<span>");
        if (parens)
            elem.text("(" + item.name + ")");
        else
            elem.text(item.name);

        if (colour != -1)
            elem.addClass("fg" + colour);
        else if (item.col != -1 && item.col != null)
            elem.addClass("fg" + item.col);
        return elem;
    }
    player.inventory_item_desc = inventory_item_desc;

    player.has_status_light = function (status_light, col)
    {
        for (var i = 0; i < player.status.length; ++i)
        {
            if (player.status[i].light &&
                player.status[i].light.match(status_light) &&
                (col == null || player.status[i].col == col))
                return true;
        }
        return false;
    }
    player.has_status = function (status_name, col)
    {
        for (var i = 0; i < player.status.length; ++i)
        {
            if (player.status[i].text &&
                player.status[i].text.match(status_name) &&
                (col == null || player.status[i].col == col))
                return true;
        }
        return false;
    }
    player.incapacitated = function incapacitated()
    {
        // FIXME: does this cover all ATTR_HELD cases?
        return player.has_status("paralysed|petrified|sleeping")
               || player.has_status("confused")
               || player.has_status("held", 4);
    }

    var update_stats_pane = hud.create(player);
    interactions.init();

    function handle_player_message(data)
    {
        for (var i in data.inv)
        {
            player.inv[i] = player.inv[i] || {};
            $.extend(player.inv[i], data.inv[i]);
            player.inv[i].slot = Number(i); // XX why is i a string?
        }

        if (data.inv)
            $("#action-panel").triggerHandler("update");

        delete data.inv;
        delete data.msg;

        $.extend(player, data);

        // chick if a forced player update has given us an explicit last
        // time to show in the hud for spectators (only). Otherwise, this value
        // is calculated on the client-side. (XX this works somewhat differently
        // than the console/tiles view; reconcile?)
        if ("time_last_input" in data)
        {
            // currently this message should *only* happen for spectators, but
            // just to be sure..
            // we don't want to do anything on this message to players,
            // because the server value can get out of sync with what the js
            // client is showing.
            if (client.is_watching())
                player.time_delta = player.time - player.time_last_input;

            last_time = player.time;
        }
        else if ("time" in data)
        {
            if (last_time)
                player.time_delta = player.time - last_time;

            last_time = player.time;
            messages.new_command(true);
        }

        update_stats_pane();
        $(document).trigger("player_state_changed");

        if ("hp" in data || "hp_max" in data ||
            "mp" in data || "mp_max" in data)
        {
            map_knowledge.touch(player.pos);
            $("#dungeon").trigger("update_cells", [[player.pos]]);
        }
        if (player.name && player.hp_max > 0)
            loading.mark("player");
    }

    options.add_listener(function ()
    {
        if (player.name !== "")
            update_stats_pane();

        if (options.get("tile_font_stat_size") === 0)
            $("#stats").css("font-size", "");
        else
        {
            $("#stats").css("font-size",
                options.get("tile_font_stat_size") + "px");
        }

        var family = options.get("tile_font_stat_family");
        if (family !== "" && family !== "monospace")
        {
            family += ", monospace";
            document.documentElement.style.setProperty("--stat-font", family);
        }
    });

    comm.register_handlers({
        "player": handle_player_message,
    });

    $(document).off("game_init.player")
        .on("game_init.player", function () {
            interactions.init();
            $.extend(player, {
                name: "", god: "", title: "", species: "",
                species_display_name: "",
                hp: 0, hp_max: 0, real_hp_max: 0, poison_survival: 0,
                mp: 0, mp_max: 0, dd_real_mp_max: 0,
                ac: 0, ev: 0, sh: 0,
                xl: 0, progress: 0,
                time: 0, time_delta: 0,
                gold: 0,
                str: 0, int: 0, dex: 0,
                str_max: 0, int_max: 0, dex_max: 0,
                piety_rank: 0, penance: false,
                status: [],
                inv: {},
                weapon_index: -1,
                offhand_index: -1,
                weapon_colour: 0,
                offhand_weapon_colour: 0,
                quiver_item: -1,
                unarmed_attack: "",
                pos: {x: 0, y: 0},
                wizard: 0, explore: 0,
                depth: 0, place: "",
                contam: 0,
                noise: 0,
                adjusted_noise: 0
            });
            delete player["old_hp"];
            delete player["old_mp"];
            last_time = null;
        });

    return player;
});
