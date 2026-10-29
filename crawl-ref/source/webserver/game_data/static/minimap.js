define(["jquery", "./map_knowledge", "./dungeon_renderer", "./view_data",
        "./tileinfo-player", "./tileinfo-main", "./tileinfo-dngn", "./enums",
        "./player", "./options", "./util", "./game-context", "client"],
function ($, map_knowledge, dungeon_renderer, view_data,
          tileinfo_player, main, dngn, enums, player, options, util, game, client) {
    "use strict";

    var minimap_colours;
    var overlay;
    var ctx, overlay_ctx;
    var cell_w, cell_h;
    var cell_x = 0, cell_y = 0;
    var display_x = 0, display_y = 0;
    var enabled = true;

    function vcolour_to_css_colour(colour)
    {
        return "rgba(" + colour.r + "," + colour.g + "," + colour.b + ","
               + (colour.a ? colour.a : 255) + ")";
    }

    function update_overlay()
    {
        if (!overlay_ctx || !overlay || !options.ready())
            return;
        // Update the minimap overlay
        var view = dungeon_renderer.view;
        overlay_ctx.clearRect(0, 0, overlay.width, overlay.height);
        overlay_ctx.strokeStyle =
            vcolour_to_css_colour(options.get("tile_window_col"));
        overlay_ctx.strokeRect(display_x + (view.x - cell_x) * cell_w + 0.5,
                               display_y + (view.y - cell_y) * cell_h + 0.5,
                               dungeon_renderer.cols * cell_w - 1,
                               dungeon_renderer.rows * cell_h - 1);

        if (window.crawl_party)
        {
            var slot_colours = ["#fce94f", "#44ddff", "#8ae234", "#ff80ff"];
            var state = window.crawl_party.state;
            if (state && state.members)
            {
                for (var i = 0; i < state.members.length; ++i)
                {
                    var m = state.members[i];
                    if (m.on_same_level === false || !m.pos)
                        continue;
                    var mx = display_x + (m.pos.x - cell_x) * cell_w;
                    var my = display_y + (m.pos.y - cell_y) * cell_h;
                    overlay_ctx.fillStyle = slot_colours[m.slot % slot_colours.length];
                    overlay_ctx.fillRect(mx, my, Math.max(2, cell_w), Math.max(2, cell_h));
                }
            }
            var pings = window.crawl_party.pings;
            if (pings && pings.length > 0)
            {
                var now = Date.now();
                for (var j = 0; j < pings.length; ++j)
                {
                    var p = pings[j];
                    if (p.expires <= now)
                        continue;
                    var px = display_x + (p.x - cell_x + 0.5) * cell_w;
                    var py = display_y + (p.y - cell_y + 0.5) * cell_h;
                    var phase = ((now - p.created) % 800) / 800.0;
                    var r = Math.max(3, cell_w * (1.2 + 2.5 * phase));
                    overlay_ctx.save();
                    overlay_ctx.strokeStyle = (p.kind === "danger") ? "#ff4444" : "#33e6ff";
                    overlay_ctx.lineWidth = 1.5;
                    overlay_ctx.beginPath();
                    overlay_ctx.arc(px, py, r, 0, 2 * Math.PI);
                    overlay_ctx.stroke();
                    overlay_ctx.restore();
                }
            }
        }
    }

    function fit_to(width)
    {
        if (!options.ready()) return;
        var gxm = enums.gxm;
        var gym = enums.gym;
        var display = $("#minimap").css("display");
        $("#minimap, #minimap_overlay").show();

        var block = $("#minimap_block");
        var canvas = $("#minimap")[0];
        if (!canvas) return;

        var pixels = Math.max(1, Math.floor(width / gxm));
        if (options.get("tile_map_pixels") > 0)
            pixels = Math.min(pixels, options.get("tile_map_pixels"));
        var bottom = document.getElementById("hud_bottom_map");
        if (bottom) {
            var budget = Math.max(1, bottom.clientHeight - $("#hud_map_tools").outerHeight(true) - 8);
            pixels = Math.max(1, Math.min(pixels, Math.floor(budget / gym)));
            width = gxm * pixels;
        }
        // The same cell size drives drawing and hit testing in either host.
        else if ($("#party_hud").is(":visible"))
        {
            var reserved = $("#stats").outerHeight(true)
                + $("#party_hud").outerHeight(true)
                + Math.min($("#monster_list").outerHeight(true) || 96, 96) + 16;
            pixels = Math.max(1, Math.min(pixels,
                Math.floor((window.innerHeight - reserved) / gym)));
            var monster_space = window.innerHeight - $("#stats").outerHeight(true)
                - $("#party_hud").outerHeight(true) - gym * pixels - 16;
            $("#monster_list").css("max-height", Math.max(36, Math.min(96, monster_space)));
        }
        if (canvas.width === Math.floor(width) && canvas.height === gym * pixels
            && cell_w === pixels && cell_h === pixels)
        {
            $("#minimap, #minimap_overlay").css("display", display);
            return;
        }
        block.width(width);
        canvas.width = width;
        cell_w = cell_h = pixels;
        block.height(gym * cell_h);
        canvas.height = gym * cell_h;
        ctx = canvas.getContext("2d");

        overlay = $("#minimap_overlay")[0];
        overlay.width = canvas.width;
        overlay.height = canvas.height;
        overlay_ctx = overlay.getContext("2d");

        if (cell_x !== 0 || cell_y !== 0)
        {
            clear();
            center();
        }

        $("#minimap, #minimap_overlay").css("display", display);
        // suppress rclick menu (so we can rclick to view)
        $("#minimap")[0].oncontextmenu =  function() { return false; }
        overlay.oncontextmenu =  function() { return false; }
    }

    function clear()
    {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0,
                     $("#minimap").width(),
                     $("#minimap").height());
    }

    function center()
    {
        if (!enabled) return;

        stop_minimap_farview();

        var minimap = $("#minimap")[0];
        var bounds = map_knowledge.bounds();
        var mm_w = bounds.right - bounds.left;
        var mm_h = bounds.bottom - bounds.top;

        if (mm_w < 0 || mm_h < 0) return;

        var old_x = display_x - cell_x * cell_w;
        var old_y = display_y - cell_y * cell_h;

        cell_x = bounds.left;
        cell_y = bounds.top;
        display_x = Math.floor((minimap.width - cell_w * mm_w) / 2);
        display_y = Math.floor((minimap.height - cell_h * mm_h) / 2);

        var dx = display_x - cell_x * cell_w - old_x;
        var dy = display_y - cell_y * cell_h - old_y;

        ctx.drawImage(minimap, 0, 0, minimap.width, minimap.height,
                               dx, dy, minimap.width, minimap.height);

        ctx.fillStyle = "black";
        if (dx > 0)
            ctx.fillRect(0, 0, dx, minimap.height);
        if (dx < 0)
            ctx.fillRect(minimap.width + dx, 0, -dx, minimap.height);
        if (dy > 0)
            ctx.fillRect(0, 0, minimap.width, dy);
        if (dy < 0)
            ctx.fillRect(0, minimap.height + dy, minimap.width, -dy);

        update_overlay();
    }

    function set(cx, cy, colour)
    {
        if (!enabled || colour === undefined) return;

        var x = cx - cell_x;
        var y = cy - cell_y;
        ctx.fillStyle = colour;
        ctx.fillRect(display_x + x * cell_w,
                     display_y + y * cell_h,
                     cell_w, cell_h);
    }

    function init_options()
    {
        // This must match the order of map_feature in map-feature.h
        minimap_colours = [
            options.get("tile_unseen_col"),         // MF_UNSEEN
            options.get("tile_floor_col"),          // MF_FLOOR
            options.get("tile_wall_col"),           // MF_WALL
            options.get("tile_mapped_floor_col"),   // MF_MAP_FLOOR
            options.get("tile_mapped_wall_col"),    // MF_MAP_WALL
            options.get("tile_door_col"),           // MF_DOOR
            options.get("tile_item_col"),           // MF_ITEM
            options.get("tile_monster_col"),        // MF_MONS_FRIENDLY
            options.get("tile_monster_col"),        // MF_MONS_PEACEFUL
            options.get("tile_monster_col"),        // MF_MONS_NEUTRAL
            options.get("tile_monster_col"),        // MF_MONS_HOSTILE
            options.get("tile_plant_col"),          // MF_MONS_NO_EXP
            options.get("tile_upstairs_col"),       // MF_STAIR_UP
            options.get("tile_downstairs_col"),     // MF_STAIR_DOWN
            options.get("tile_branchstairs_col"),   // MF_STAIR_BRANCH
            options.get("tile_feature_col"),        // MF_FEATURE
            options.get("tile_water_col"),          // MF_WATER
            options.get("tile_lava_col"),           // MF_LAVA
            options.get("tile_trap_col"),           // MF_TRAP
            options.get("tile_excl_centre_col"),    // MF_EXCL_ROOT
            options.get("tile_excluded_col"),       // MF_EXCL
            options.get("tile_player_col"),         // MF_PLAYER
            options.get("tile_deep_water_col"),     // MF_DEEP_WATER
            options.get("tile_portal_col"),         // MF_PORTAL
            options.get("tile_transporter_col"),    // MF_TRANSPORTER
            options.get("tile_transporter_landing_col"), // MF_TRANSPORTER_LANDING
            options.get("tile_explore_horizon_col") // MF_EXPLORE_HORIZON
        ].map(vcolour_to_css_colour);
    }

    function update(x, y, cell)
    {
        cell = cell || map_knowledge.get(x, y);
        if (x == player.pos.x && y == player.pos.y)
            set(x, y, minimap_colours[enums.MF_PLAYER]);
        else
            set(x, y, minimap_colours[cell.mf || enums.MF_UNSEEN]);
    }

    // Minimap controls ------------------------------------------------------------
    var followed_hero;
    function controlled_view()
    {
        // Native targeting and full-map navigation own their camera. Spectators
        // and older snapshots continue using the native viewpoint as well.
        var state = window.crawl_party && window.crawl_party.state;
        if (dungeon_renderer.ui_state !== enums.ui.NORMAL
            || !game.get_input_mode || game.get_input_mode() !== enums.mouse_mode.COMMAND
            || !state || !Number.isInteger(state.controlled_slot))
            return;
        var member = (state.members || []).find(function (hero) {
            return hero.slot === state.controlled_slot;
        });
        if (!member || member.on_same_level === false || !member.pos
            || !Number.isFinite(member.pos.x) || !Number.isFinite(member.pos.y))
            return;
        return { slot: member.slot, place: member.place, x: member.pos.x, y: member.pos.y };
    }

    function follow_controlled(force)
    {
        var target = controlled_view();
        if (!target) { followed_hero = undefined; return; }
        // A manual center remains useful until the hero moves, control changes,
        // or the engine requests a new viewpoint.
        if (force || !followed_hero || target.slot !== followed_hero.slot
            || target.place !== followed_hero.place
            || target.x !== followed_hero.x || target.y !== followed_hero.y)
            do_view_center_update(target.x, target.y);
    }

    function vgrdc(x, y)
    {
        dungeon_renderer.set_view_center(x, y);

        update_overlay();
    }

    function do_view_center_update(x, y)
    {
        var target = controlled_view();
        followed_hero = target;
        if (target) { x = target.x; y = target.y; }
        // Update the viewpoint, unless the user is currently
        // right-clicking on the map
        if (farview_old_vc)
        {
            farview_old_vc.x = x;
            farview_old_vc.y = y;
        }
        else
        {
            vgrdc(x, y);
        }
    }

    var farview_old_vc;
    function minimap_cell(ev)
    {
        var canvas = $("#minimap")[0];
        if (!canvas || !(cell_w > 0) || !(cell_h > 0)) return;
        var rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) return;
        var x = (ev.clientX - rect.left) * canvas.width / rect.width;
        var y = (ev.clientY - rect.top) * canvas.height / rect.height;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        return { x: Math.floor((x - display_x) / cell_w) + cell_x,
                 y: Math.floor((y - display_y) / cell_h) + cell_y };
    }

    function minimap_mousedown(ev)
    {
        if (ev.which !== 1 || ev.ctrlKey || ev.metaKey)
        {
            minimap_farview(ev);
            return;
        }
        if (client.is_watching() || dungeon_renderer.ui_state !== enums.ui.NORMAL
            || !game.get_input_mode || game.get_input_mode() !== enums.mouse_mode.COMMAND)
            return;
        var loc = minimap_cell(ev), bounds = map_knowledge.bounds();
        if (!loc || !bounds || loc.x < bounds.left || loc.x > bounds.right
            || loc.y < bounds.top || loc.y > bounds.bottom) return;
        var cell = map_knowledge.get(loc.x, loc.y);
        if (!cell || !cell.mf || cell.mf === enums.MF_UNSEEN) return;
        stop_minimap_farview();
        // Share dungeon input so travel, pings and exclusion selection retain
        // their native route, ownership, danger and interruption rules.
        $("#dungeon").trigger($.extend({}, ev, { type: "cell_click", cell: loc }));
        ev.preventDefault();
    }

    function minimap_farview(ev)
    {
        if (ev.which == 3 || farview_old_vc)
        {
            var loc = minimap_cell(ev);
            if (!loc) return;
            if (farview_old_vc === undefined)
            {
                farview_old_vc = {
                    x: dungeon_renderer.view_center.x,
                    y: dungeon_renderer.view_center.y
                }
            }
            vgrdc(loc.x, loc.y);
            ev.preventDefault();
        }
    }

    function stop_minimap_farview()
    {
        if (farview_old_vc !== undefined)
        {
            vgrdc(farview_old_vc.x, farview_old_vc.y);
            farview_old_vc = undefined;
        }
    }

    $(document).bind("game_init", function () {
        followed_hero = farview_old_vc = undefined;
        cell_x = cell_y = display_x = display_y = 0;

        $("#minimap_overlay")
            .off(".minimap")
            .on("mousedown.minimap", minimap_mousedown)
            .on("mousemove.minimap", minimap_farview);
    });

    $(document).on("mouseup.minimap", stop_minimap_farview);

    $(document).on("party_state_rendered.cameraFollow", function () {
        follow_controlled(false);
    }).on("game_input_changed.cameraFollow", function (event, mode) {
        if (mode === enums.mouse_mode.COMMAND) follow_controlled(true);
    }).on("game_cleanup.cameraFollow", function () {
        followed_hero = farview_old_vc = undefined;
    });

    return {
        init_options: init_options,
        fit_to: fit_to,
        update_overlay: update_overlay,
        clear: clear,
        center: center,
        update: update,
        do_view_center_update: do_view_center_update,
        stop_minimap_farview: stop_minimap_farview,
    }
});
