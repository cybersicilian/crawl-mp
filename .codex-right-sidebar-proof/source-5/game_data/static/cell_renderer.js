define(["jquery", "./view_data", "./tileinfo-main", "./tileinfo-player",
        "./tileinfo-icons", "./tileinfo-dngn", "./enums", "./map_knowledge",
        "./player", "./options", "./cell-renderer-glyphs", "./cell-renderer-overlays",
        "./cell-renderer-layers", "./cell-renderer-textures", "./shell-animation", "contrib/jquery.json"],
function ($, view_data, main, tileinfo_player, icons, dngn, enums, map_knowledge,
          player, options, glyphs, overlays, layers, textures, shells) {
    "use strict";

    function DungeonCellRenderer()
    {
        this.set_cell_size(32, 32);
    }

    var in_water = layers.in_water;

    function obj_to_str(o)
    {
        return $.toJSON(o);
    }

    $.extend(DungeonCellRenderer.prototype, glyphs.methods, overlays,
        layers.methods, textures, {
        init: function(element)
        {
            this.element = element;
            this.ctx = this.element.getContext("2d");
        },

        set_cell_size: function(w, h)
        {
            this.cell_width = Math.floor(w);
            this.cell_height = Math.floor(h);
            this.x_scale = this.cell_width / 32;
            this.y_scale = this.cell_height / 32;
        },

        render_cursors: function(cx, cy, x, y)
        {
            var renderer = this;
            $.each(view_data.cursor_locs, function (type, loc) {
                if (loc && (loc.x == cx) && (loc.y == cy))
                {
                    var idx;

                    switch (type)
                    {
                    case enums.CURSOR_TUTORIAL:
                        idx = icons.TUTORIAL_CURSOR;
                        break;
                    case enums.CURSOR_MOUSE:
                        idx = icons.CURSOR;
                        // TODO: tilei.CURSOR2 if not visible
                        break;
                    case enums.CURSOR_MAP:
                        idx = icons.CURSOR;
                        break;
                    }

                    renderer.draw_icon(idx, x, y);
                }
            });
        },

        scaled_size: function(w, h)
        {
            w = w === undefined ? this.cell_width : w;
            h = h === undefined ? this.cell_height : h;
            const ratio = window.devicePixelRatio;
            const width = Math.floor(w * ratio);
            const height = Math.floor(h * ratio);
            return {width: width, height: height};
        },

        clear: function()
        {
            this.ctx.fillStyle = "black";
            // element dimensions are already scaled
            this.ctx.fillRect(0, 0, this.element.width, this.element.height);
        },

        do_render_cell: function(cx, cy, x, y, map_cell, cell)
        {
            let scaled = this.scaled_size();

            this.ctx.fillStyle = "black";
            this.ctx.fillRect(x, y, scaled.width, scaled.height);

            map_cell = map_cell || map_knowledge.get(cx, cy);
            cell = cell || map_cell.t;

            if (!cell)
            {
                this.render_cursors(cx, cy, x, y);
                this.render_party_overlays(cx, cy, x, y);
                return;
            }

            // track whether this cell overlaps to the top or left
            this.current_sy = 0;
            this.current_left_overlap = 0;

            cell.fg = enums.prepare_fg_flags(cell.fg || 0);
            cell.bg = enums.prepare_bg_flags(cell.bg || 0);
            cell.cloud = enums.prepare_fg_flags(cell.cloud || 0);
            cell.icons = cell.icons || [];
            cell.flv = cell.flv || {};
            cell.flv.f = cell.flv.f || 0;
            cell.flv.s = cell.flv.s || 0;
            map_cell.g = map_cell.g || ' ';
            if (map_cell.col == undefined) map_cell.col = 7;

            if (options.get("tile_display_mode") == "glyphs")
            {
                this.render_glyph(x, y, map_cell, false);

                this.render_cursors(cx, cy, x, y);
                this.render_party_overlays(cx, cy, x, y);
                return;
            }

            // cell is basically a packed_cell + doll + mcache entries
            if (options.get("tile_display_mode") == "tiles")
                this.draw_background(x, y, cell);

            if (cell.ritual_blood)
            {
                // Floor resource markers stay under actors and targeting UI.
                var units = cell.ritual_blood & 3;
                var fading = Boolean(cell.ritual_blood & 4);
                var sx = scaled.width / 32, sy = scaled.height / 32;
                this.ctx.save();
                this.ctx.fillStyle = fading ? "#8d4b56" : "#ef9e9d";
                for (var drop = 0; drop < units; drop++)
                    this.ctx.fillRect(x + (5 + drop * 4) * sx, y + 27 * sy, sx, (fading ? 1 : 2) * sy);
                if (!fading)
                    this.ctx.fillRect(x + 4 * sx, y + 25 * sy, 2 * sx, sy);
                this.ctx.restore();
            }

            var fg_idx = cell.fg.value;
            var is_in_water = in_water(cell);

            // draw clouds
            if (cell.cloud.value)
            {
                this.ctx.save();
                // If there will be a front/back cloud pair, draw
                // the underlying one with correct alpha
                if (fg_idx)
                {
                    try
                    {
                        this.ctx.globalAlpha = 0.6;
                        this.set_nonsubmerged_clip(x, y, 20);
                        this.draw_main(cell.cloud.value, x, y);
                    }
                    finally
                    {
                        this.ctx.restore();
                    }

                    this.ctx.save();
                    try
                    {
                        this.ctx.globalAlpha = 0.2;
                        this.set_submerged_clip(x, y, 20);
                        this.draw_main(cell.cloud.value, x, y);
                    }
                    finally
                    {
                        this.ctx.restore();
                    }
                }
                else
                {
                    try
                    {
                        this.ctx.globalAlpha = 1.0;
                        this.draw_main(cell.cloud.value, x, y);
                    }
                    finally
                    {
                        this.ctx.restore();
                    }
                }
            }

            // Canvas doesn't support applying an alpha gradient
            // to an image while drawing; so to achieve the same
            // effect as in local tiles, it would probably be best
            // to pregenerate water tiles with the (inverse) alpha
            // gradient built in. This simply draws the lower
            // half with increased transparency; for now, it looks
            // good enough.

            var renderer = this;
            function draw_dolls()
            {
                if (!shells.draw(renderer, cx, cy, x, y, draw_default_dolls,
                    fg_idx >= main.MAIN_MAX && Boolean(cell.doll || cell.mcache)))
                    draw_default_dolls();
            }
            function draw_default_dolls()
            {
                if ((fg_idx >= main.MAIN_MAX) && cell.doll)
                {
                    var mcache_map = {};
                    if (cell.mcache)
                    {
                        for (var i = 0; i < cell.mcache.length; ++i)
                            mcache_map[cell.mcache[i][0]] = i;
                    }
                    $.each(cell.doll, function (i, doll_part) {
                        var xofs = 0;
                        var yofs = 0;
                        if (mcache_map[doll_part[0]] !== undefined)
                        {
                            var mind = mcache_map[doll_part[0]];
                            xofs = cell.mcache[mind][1];
                            yofs = cell.mcache[mind][2];
                        }
                        renderer.draw_player(doll_part[0],
                                             x, y, xofs, yofs, doll_part[1]);
                    });
                }

                if ((fg_idx >= tileinfo_player.MCACHE_START) && cell.mcache)
                {
                    $.each(cell.mcache, function (i, mcache_part) {
                        if (mcache_part) {
                            renderer.draw_player(mcache_part[0],
                                                 x, y, mcache_part[1], mcache_part[2]);
                        }
                    });
                }
            }

            if (is_in_water && options.get("tile_display_mode") == "tiles")
            {
                this.ctx.save();
                try
                {
                    this.ctx.globalAlpha = cell.trans ? 0.5 : 1.0;

                    this.set_nonsubmerged_clip(x, y, 20);

                    draw_dolls();
                }
                finally
                {
                    this.ctx.restore();
                }

                this.ctx.save();
                try
                {
                    this.ctx.globalAlpha = cell.trans ? 0.1 : 0.3;
                    this.set_submerged_clip(x, y, 20);

                    draw_dolls();
                }
                finally
                {
                    this.ctx.restore();
                }
            }
            else if (options.get("tile_display_mode") == "tiles")
            {
                this.ctx.save();
                try
                {
                    this.ctx.globalAlpha = cell.trans ? 0.55 : 1.0;

                    draw_dolls();
                }
                finally
                {
                    this.ctx.restore();
                }
            }

            this.draw_foreground(x, y, map_cell);

            // draw clouds over stuff
            if (fg_idx && cell.cloud.value)
            {
                this.ctx.save();
                try
                {
                    this.ctx.globalAlpha = 0.4;
                    this.set_nonsubmerged_clip(x, y, 20);
                    this.draw_main(cell.cloud.value, x, y);
                }
                finally
                {
                    this.ctx.restore();
                }

                this.ctx.save();
                try
                {
                    this.ctx.globalAlpha = 0.8;
                    this.set_submerged_clip(x, y, 20);
                    this.draw_main(cell.cloud.value, x, y);
                }
                finally
                {
                    this.ctx.restore();
                }
            }

            // Draw main-tile overlays (i.e. zaps), on top of clouds.
            if (cell.ov)
            {
                $.each(cell.ov, function (i, overlay)
                        {
                            if (dngn.FEAT_MAX <= overlay && overlay < main.MAIN_MAX)
                            {
                                renderer.draw_main(overlay, x, y);
                            }
                        });
            }

            this.render_flash(x, y, map_cell);

            this.render_cursors(cx, cy, x, y);

            if (cx == player.pos.x && cy == player.pos.y
                && map_knowledge.player_on_level())
            {
                this.draw_minibars(x, y);
            }

            this.render_party_overlays(cx, cy, x, y);

            // Debug helper
            if (cell.mark)
            {
                this.ctx.fillStyle = "red";
                this.ctx.font = "12px monospace";
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "middle";
                let scaled = this.scaled_size();
                this.ctx.fillText(cell.mark,
                                  x + 0.5 * scaled.width,
                                  y + 0.5 * scaled.height);
            }

            cell.sy = this.current_sy;
            cell.left_overlap = this.current_left_overlap;
        },

        render_cell: function()
        {
            if (window.debug_mode)
                this.do_render_cell.apply(this, arguments);
            else
            {
                try
                {
                    this.do_render_cell.apply(this, arguments);
                }
                catch (err)
                {
                    var cx = arguments[0];
                    var cy = arguments[1];
                    var cell = arguments[5];
                    console.error("Error while drawing cell " + obj_to_str(cell)
                                  + " at " + cx + "/" + cy + ": " + err);
                }
            }
        },

        render_flash: function(x, y, map_cell)
        {
            if (map_cell.flc)
            {
                var col = view_data.get_flash_colour(map_cell.flc, map_cell.fla);
                this.ctx.save();
                try
                {
                    this.ctx.fillStyle = "rgb(" + col.r + "," +
                        col.g + "," + col.b + ")";
                    this.ctx.globalAlpha = col.a / 255;
                    const cell = this.scaled_size();
                    this.ctx.fillRect(x, y, cell.width, cell.height);
                }
                finally
                {
                    this.ctx.restore();
                }
            }
        },

    });

    $(document).off("game_init.cell_renderer")
        .on("game_init.cell_renderer", function () {
            glyphs.determine_colours();
        });

    return {
        DungeonCellRenderer: DungeonCellRenderer,
    };
});
