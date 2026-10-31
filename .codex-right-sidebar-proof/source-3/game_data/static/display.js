define(["jquery", "comm", "./map_knowledge", "./view_data", "./monster_list",
        "./minimap", "./dungeon_renderer", "game-loading"],
function ($, comm, map_knowledge, view_data, monster_list, minimap,
          dungeon_renderer, loading) {
    "use strict";

    // Message indicating any invisible monsters nearby whose location was
    // never known to the player.
    var inv_mons_msg;
    var pending_frame = null;

    function cancel_frame()
    {
        if (pending_frame !== null)
            window.cancelAnimationFrame(pending_frame);
        pending_frame = null;
    }

    function invalidate(minimap_too)
    {
        var b = map_knowledge.bounds();
        if (!b) return;

        var view = dungeon_renderer.view;

        var xs = minimap_too ? b.left : view.x;
        var ys = minimap_too ? b.top : view.y;
        var xe = minimap_too ? b.right : view.x + dungeon_renderer.cols - 1;
        var ye = minimap_too ? b.bottom : view.y + dungeon_renderer.rows - 1;
        for (var x = xs; x <= xe; x++)
            for (var y = ys; y <= ye; y++)
        {
            map_knowledge.touch(x, y);
        }
    }

    function invalidate_positions(locs)
    {
        if (!locs || !map_knowledge.bounds())
            return;
        for (var i = 0; i < locs.length; i++)
        {
            var loc = locs[i];
            if (!loc || loc.x === undefined || loc.y === undefined)
                continue;
            map_knowledge.touch(loc.x, loc.y);
            map_knowledge.touch(loc.x, loc.y - 1);
            map_knowledge.touch(loc.x - 1, loc.y);
            map_knowledge.touch(loc.x - 1, loc.y - 1);
        }
    }

    function display()
    {
        // Player, party, camera and map packets describe the same native update.
        // Paint their latest state together before the next browser paint.
        if (pending_frame === null)
            pending_frame = window.requestAnimationFrame(render);
    }

    function render()
    {
        pending_frame = null;
        // Update the display.
        if (!map_knowledge.bounds())
            return;

        var t1 = new Date();

        if (map_knowledge.reset_bounds_changed())
            minimap.center();

        var dirty_locs = map_knowledge.dirty();
        for (var i = 0; i < dirty_locs.length; i++)
        {
            var loc = dirty_locs[i];
            var cell = map_knowledge.get(loc.x, loc.y);
            cell.dirty = false;
            monster_list.update_loc(loc);
            minimap.update(loc.x, loc.y, cell);
        }
        map_knowledge.reset_dirty();

        dungeon_renderer.render_view();

        monster_list.update(inv_mons_msg);

        if (dungeon_renderer.cols > 0 && dungeon_renderer.rows > 0)
            loading.mark("map");

        var render_time = (new Date() - t1);
        if (!window.render_times)
            window.render_times = [];
        if (window.render_times.length >= 20)
            window.render_times.shift();
        window.render_times.push(render_time);
    }

    function clear_map()
    {
        cancel_frame();
        map_knowledge.clear();

        dungeon_renderer.clear();

        minimap.clear();

        monster_list.clear();

        inv_mons_msg = "";
    }

    // Message handlers
    function handle_map_message(data)
    {
        if (data.clear)
            clear_map();

        if (data.player_on_level != null)
            map_knowledge.set_player_on_level(data.player_on_level);

        if (data.cells)
            map_knowledge.merge(data.cells);

        if (data.vgrdc)
            minimap.do_view_center_update(data.vgrdc.x, data.vgrdc.y);

        if ("invis_mon_desc" in data)
            inv_mons_msg = data.invis_mon_desc;

        dungeon_renderer.animate();
        display();
    }

    $(document).on("game_camera_changed.display", function () {
        display();
    }).on("dungeon_tiles_changed.display", display)
        .on("game_preinit.display game_cleanup.display", cancel_frame);

    comm.register_handlers({
        "map": handle_map_message,
    });

    return {
        invalidate: invalidate,
        invalidate_positions: invalidate_positions,
        display: display,
    };
});
