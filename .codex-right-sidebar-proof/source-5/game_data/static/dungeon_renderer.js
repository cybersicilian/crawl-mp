define(["jquery", "comm", "./cell_renderer", "./map_knowledge", "./options",
    "./tileinfo-dngn", "./util", "./view_data", "./enums", "./mouse_control", "./game-context", "tooltip-policy", "./party-hover", "./traversal-effects", "./shell-animation", "./planned-route", "./chunked-view", "./sprite-reach"],
function ($, comm, cr, map_knowledge, options, dngn, util, view_data, enums,
    mouse_control, game, tip_policy, presence, traversal, shells, plannedRoute, chunks, spriteReach) {
    "use strict";
    var global_anim_counter = 0;

    function is_torch(basetile)
    {
        return (basetile == dngn.WALL_BRICK_DARK_2_TORCH
                || basetile == dngn.WALL_BRICK_DARK_4_TORCH
                || basetile == dngn.WALL_BRICK_DARK_6_TORCH);
    }

    function cell_is_animated(cell)
    {
        if (cell == null || cell.bg == null) return false;
        var base_bg = dngn.basetile(cell.bg.value);
        if (base_bg >= dngn.DNGN_LAVA && base_bg < dngn.FLOOR_MAX)
            return options.get("tile_water_anim");
        else if ((base_bg >= dngn.DNGN_ENTER_ZOT_CLOSED && base_bg < dngn.DNGN_CACHE_OF_FRUIT)
                 || (base_bg >= dngn.DNGN_SILVER_STATUE && base_bg < dngn.ARCANE_CONDUIT)
                 || (base_bg >= dngn.ARCANE_CONDUIT && base_bg < dngn.STORM_CONDUIT)
                 || (base_bg >= dngn.WALL_STONE_CRACKLE_1 && base_bg <= dngn.WALL_STONE_CRACKLE_4)
                 || is_torch(base_bg) || base_bg == dngn.DNGN_TRAP_HARLEQUIN)
        {
            return options.get("tile_misc_anim");
        }
        else
            return false;
    }

    function animate_cell(cell)
    {
        var base_bg = dngn.basetile(cell.bg.value);
        if (base_bg == dngn.DNGN_PORTAL_WIZARD_LAB
            || base_bg == dngn.DNGN_EXIT_NECROPOLIS
            || base_bg == dngn.DNGN_ALTAR_JIYVA
            || base_bg == dngn.DNGN_TRAP_HARLEQUIN
            || base_bg >= dngn.ARCANE_CONDUIT && base_bg < dngn.STORM_CONDUIT
            || is_torch(base_bg))
        {
            cell.bg.value = base_bg + (cell.bg.value - base_bg + 1) % dngn.tile_count(base_bg);
        }
        else if ((base_bg > dngn.DNGN_LAVA && base_bg < dngn.BLOOD) ||
                 (base_bg >= dngn.WALL_STONE_CRACKLE_1 && base_bg <= dngn.WALL_STONE_CRACKLE_4) ||
                 (base_bg >= dngn.DNGN_SILVER_STATUE && base_bg < dngn.ARCANE_CONDUIT))
        {
            cell.bg.value = base_bg + Math.floor(Math.random() * dngn.tile_count(base_bg))
        }
        else if (base_bg == dngn.DNGN_LAVA)
        {
            var tile = (cell.bg.value - base_bg) % 4;
            cell.bg.value = base_bg + (tile + 4 * global_anim_counter) % dngn.tile_count(base_bg);
        }
    }

    function DungeonViewRenderer()
    {
        cr.DungeonCellRenderer.call(this);

        this.cols = 0;
        this.rows = 0;

        this.view = { x: 0, y: 0 };
        this.view_center = { x: 0, y: 0 };
        this.ui_state = -1;
        this.last_sent_cursor = { x: 0, y: 0 };
    }

    DungeonViewRenderer.prototype = new cr.DungeonCellRenderer();

    $.extend(DungeonViewRenderer.prototype, {
        init: function (element)
        {
            var renderer = this;
            $(element)
                .attr({ tabindex: "0", "aria-haspopup": "menu", "aria-label": "Dungeon. Right-click a tile for actions." })
                .off("update_cells mousemove mouseleave mousedown contextmenu keydown.dungeonContext")
                .on("update_cells", function (ev, cells) {
                    $.each(cells, function (i, loc) {
                        map_knowledge.touch(loc.x, loc.y);
                    });
                    $(document).trigger("dungeon_tiles_changed");
                })
                .on("mousemove mouseleave mousedown contextmenu", function (ev) {
                    renderer.handle_mouse(ev);
                })
                .on("keydown.dungeonContext", function (ev) {
                    if (ev.key === "ContextMenu" || (ev.shiftKey && ev.key === "F10")) {
                        ev.preventDefault(); ev.stopImmediatePropagation();
                        $(element).trigger($.Event("cell_contextmenu", { cell: renderer.view_center }));
                    }
                });

            cr.DungeonCellRenderer.prototype.init.call(this, element);
        },

        handle_mouse: function (ev)
        {
            if (ev.type === "mouseleave") presence.leave();
            if (!options.get("tile_web_mouse_control"))
                return;
            if (ev.type === "mouseleave")
            {
                if (this.tooltip_timeout)
                {
                    clearTimeout(this.tooltip_timeout);
                    this.tooltip_timeout = null;
                }

                view_data.remove_cursor(enums.CURSOR_MOUSE);
            }
            else
            {
                // Pointer coordinates are relative to the canvas, including
                // headers or other surrounding chrome and device pixel ratio.
                var bounds = this.element.getBoundingClientRect();
                let scaled = this.scaled_size(ev.clientX - bounds.left, ev.clientY - bounds.top);
                let cell_size = this.scaled_size();
                var loc = {
                    x: Math.floor(scaled.width / cell_size.width) + this.view.x,
                    y: Math.floor(scaled.height / cell_size.height) + this.view.y
                };

                view_data.place_cursor(enums.CURSOR_MOUSE, loc);
                presence.point(loc, ev);

                if (game.can_target() && ev.type !== "contextmenu" && !(ev.type === "mousedown" && (ev.which === 3 || ev.ctrlKey)))
                {
                    // XX refactor into mouse_control.js?
                    if (loc.x != this.last_sent_cursor.x
                        || loc.y != this.last_sent_cursor.y)
                    {
                        this.last_sent_cursor = {x: loc.x, y: loc.y};
                        comm.send_message("target_cursor",
                                                    this.last_sent_cursor);
                    }
                }

                if (ev.type === "mousemove")
                {

                    if (this.tooltip_timeout)
                        clearTimeout(this.tooltip_timeout);

                    var element = this.element;
                    this.tooltip_timeout = setTimeout(function () {
                        var new_ev = $.extend({}, ev, {
                            type: "cell_tooltip",
                            cell: loc
                        });
                        $(element).trigger(new_ev);
                    }, tip_policy.hover_ms);
                }
                else if (ev.type === "mousedown" || ev.type === "contextmenu")
                {
                    var new_ev = $.extend({}, ev, {
                        type: ev.type === "contextmenu" ? "cell_contextmenu" : "cell_click",
                        cell: loc
                    });
                    $(this.element).trigger(new_ev);
                }
            }
        },

        set_size: function (c, r)
        {
            if ((this.cols == c) && (this.rows == r) &&
                (this.element.width == c * this.cell_width) &&
                (this.element.height == r * this.cell_height))
                return;

            this.cols = c;
            this.rows = r;
            this.view.x = this.view_center.x - Math.floor(c / 2);
            this.view.y = this.view_center.y - Math.floor(r / 2);
            util.init_canvas(this.element,
                             c * this.cell_width,
                             r * this.cell_height);
            this.init(this.element);
            this.clear(); // clear the canvas and override default alpha fill
        },

        set_view_center: function(x, y)
        {
            this.view_center.x = x;
            this.view_center.y = y;
            this.view = {
                x: x - Math.floor(this.cols / 2),
                y: y - Math.floor(this.rows / 2)
            };
            $(document).trigger("game_camera_changed", [{ x: x, y: y }]);
        },

        // convert grid coordinates/dimensions to scaled canvas coordinates
        // by default, use map grid coordinates; set screen_grid to instead
        // use the visible grid (with 0,0 in the upper left of the screen)
        canvas_coords: function(cx, cy, cw, ch, screen_grid)
        {
            let scaled_cell = this.scaled_size();
            cw = cw || 1;
            ch = ch || 1;
            cx = cx || 0;
            cy = cy || 0;
            if (!screen_grid)
            {
                cx -= this.view.x;
                cy -= this.view.y;
            }
            return {
                x: cx * scaled_cell.width,
                y: cy * scaled_cell.height,
                width: cw * scaled_cell.width,
                height: ch * scaled_cell.height
            };
        },

        render_view: function(dirty)
        {
            var signature = [this.view.x, this.view.y, this.cols, this.rows,
                this.element.width, this.element.height, this.cell_width, this.cell_height].join(":");
            var full = !dirty || signature !== this.paint_signature;
            this.paint_signature = signature;
            this.sprite_reach = this.sprite_reach || 1;
            var cx, cy;
            for (cy = this.view.y; cy < this.view.y + this.rows; cy++)
                for (cx = this.view.x; cx < this.view.x + this.cols; cx++)
                    this.sprite_reach = Math.max(this.sprite_reach, spriteReach(map_knowledge.get(cx, cy).t));
            var damage = full ? null : chunks.plan({ x: this.view.x, y: this.view.y,
                cols: this.cols, rows: this.rows }, dirty, this.sprite_reach);
            if (damage && !damage.rectangles.length) {
                this.last_paint = { chunks: 0, cells: 0, full: false }; return;
            }
            this.ctx.save();
            try {
                if (damage) {
                    this.ctx.beginPath();
                    var renderer = this;
                    damage.rectangles.forEach(function (rect) {
                        var point = renderer.canvas_coords(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
                        renderer.ctx.rect(point.x, point.y, point.width, point.height);
                    });
                    // A single union clip preserves exact-once translucent
                    // compositing at chunk seams and original depth ordering.
                    this.ctx.clip();
                }
                this.clear();
                var count = 0;
                for (cy = this.view.y; cy < this.view.y + this.rows; cy++)
                    for (cx = this.view.x; cx < this.view.x + this.cols; cx++)
                        if (!damage || damage.includes(cx, cy)) { this.render_grid_cell(cx, cy); count++; }
                this.last_paint = { chunks: damage ? damage.rectangles.length : null, cells: count, full: full };
            } finally { this.ctx.restore(); }
        },

        fit_to: function(width, height, min_diameter)
        {
            var scale;
            if (this.ui_state == enums.ui.VIEW_MAP)
                scale = options.get("tile_map_scale");
            else
                scale = options.get("tile_viewport_scale");
            var tile_size = Math.floor(options.get("tile_cell_pixels")
                                * scale / 100);
            var cell_size = {
                w: Math.floor(tile_size),
                h: Math.floor(tile_size)
            };

            if (options.get("tile_display_mode") == "glyphs")
            {
                // TODO: this should rescale to ensure los, similar to tiles
                this.glyph_mode_update_font_metrics();
                this.set_cell_size(this.glyph_mode_font_width,
                                    this.glyph_mode_line_height);
            }
            else if ((min_diameter * cell_size.w > width)
                || (min_diameter * cell_size.h > height))
            {
                // TODO: this produces bad results in hybrid mode, because the
                // font size isn't appropriately updated
                // scale down if necessary, so that los is in view
                var rescale = Math.min(width / (min_diameter * cell_size.w),
                                     height / (min_diameter * cell_size.h));
                this.set_cell_size(Math.floor(cell_size.w * rescale),
                                   Math.floor(cell_size.h * rescale));
            }
            else
                this.set_cell_size(cell_size.w, cell_size.h);

            // Explicit dungeon zoom may crop the visible region; canvas geometry
            // and hit testing use the same integer cell dimensions.
            if (this.ui_state === enums.ui.NORMAL && options.get("tile_display_mode") !== "glyphs") {
                var zoom = this.viewport_zoom || 1;
                this.set_cell_size(Math.max(1, Math.floor(this.cell_width * zoom)),
                                   Math.max(1, Math.floor(this.cell_height * zoom)));
            }

            var view_width = Math.floor(width / this.cell_width);
            var view_height = Math.floor(height / this.cell_height);
            this.set_size(view_width, view_height);
        },

        in_view: function(cx, cy)
        {
            return (cx >= this.view.x) && (this.view.x + this.cols > cx) &&
                (cy >= this.view.y) && (this.view.y + this.rows > cy);
        },

        // render a single cell on the map grid
        render_grid_cell: function(cx, cy, map_cell, cell)
        {
            if (!this.in_view(cx, cy))
                return;
            map_cell = map_cell || map_knowledge.get(cx, cy);
            cell = cell || map_cell.t;
            let scaled = this.canvas_coords(cx, cy);
            this.render_cell(cx, cy, scaled.x, scaled.y, map_cell, cell);
            presence.draw(this, cx, cy, scaled.x, scaled.y);
        },

        // Cursor and peer-hover changes use the same frame as native updates.
        render_loc: function(cx, cy)
        {
            map_knowledge.touch(cx, cy);
            $(document).trigger("dungeon_tiles_changed");
        },

        animate: function ()
        {
            global_anim_counter++;
            if (global_anim_counter >= 65536) global_anim_counter = 0;
            var changed = false;

            for (var cy = this.view.y; cy < this.view.y + this.rows; ++cy)
                for (var cx = this.view.x; cx < this.view.x + this.cols; ++cx)
            {
                var map_cell = map_knowledge.get(cx, cy);
                var cell = map_cell.t;
                if (map_knowledge.visible(map_cell) && cell_is_animated(cell))
                {
                    animate_cell(cell);
                    map_knowledge.touch(cx, cy);
                    changed = true;
                }
            }
            if (changed)
                $(document).trigger("dungeon_tiles_changed");
        },

        // This is mostly here so that it can inherit cell size
        new_renderer: function(tiles)
        {
            tiles = tiles || [];
            var renderer = new cr.DungeonCellRenderer();
            var canvas = $("<canvas>");
            renderer.set_cell_size(this.cell_width,
                                   this.cell_height);
            util.init_canvas(canvas[0], this.cell_width, this.cell_height);
            renderer.init(canvas[0]);
            renderer.draw_tiles(tiles);

            return renderer;
        },

        set_ui_state: function(s)
        {
            this.ui_state = s;
        },

        update_mouse_mode: function (m)
        {
            if (!game.can_target())
                this.last_sent_cursor = { x: 0, y: 0 };
        },
    });

    var renderer = new DungeonViewRenderer();
    presence.attach(renderer);
    traversal.attach(renderer);
    shells.attach(renderer);
    plannedRoute.attach(renderer);
    var anim_interval = null;

    function update_animation_interval()
    {
        if (anim_interval)
        {
            clearTimeout(anim_interval);
            anim_interval = null;
        }
        if (options.get("tile_realtime_anim"))
        {
            anim_interval = setInterval(function () {
                renderer.animate();
            }, 1000 / 4);
        }
    }

    options.add_listener(update_animation_interval);

    $(document).off("game_init.dungeon_renderer");
    $(document).on("game_init.dungeon_renderer", function () {
        renderer.cols = 0;
        renderer.rows = 0;
        renderer.view = { x: 0, y: 0 };
        renderer.view_center = { x: 0, y: 0 };
        renderer.paint_signature = null;
        renderer.sprite_reach = 1;

        renderer.init($("#dungeon")[0]);
    });

    $(document).off("game_cleanup.dungeon_renderer")
        .on("game_cleanup.dungeon_renderer", function () {
            if (anim_interval)
            {
                clearTimeout(anim_interval);
                anim_interval = null;
            }
        });

    /* Hack to show animations (if real-time ones are not enabled)
       even in turns where nothing else happens */
    $(document).off("text_update.dungeon_renderer")
        .on("text_update.dungeon_renderer", function () {
            renderer.animate();
        });

    return renderer;
});
