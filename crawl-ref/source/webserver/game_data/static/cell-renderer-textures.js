define(["jquery", "./tileinfo-gui", "./tileinfo-main", "./tileinfo-player",
        "./tileinfo-icons", "./tileinfo-dngn", "./tileinfos", "./options",
        "./status-icon-sizes"],
function ($, gui, main, tileinfo_player, icons, dngn, tileinfos, options, icon_sizes) {
    "use strict";

    function get_img(id)
    {
        return $("#" + id)[0];
    }

    // Texture coordinates, integer pixel scaling, clipping, and overlap bookkeeping.
    return {
        draw_icon_type: function(idx, x, y, ofsx, ofsy, img_scale)
        {
            var size = icon_sizes.status_icon_size(idx);
            if (size < 0)
                return 0;
            if (size == 0)
                this.draw_icon(idx, x, y, undefined, undefined, img_scale);
            else
                this.draw_icon(idx, x, y, ofsx, ofsy, img_scale);
            return size;
        },

        draw_tile: function(idx, x, y, mod, ofsx, ofsy, y_max, centre, img_scale)
        {
            // assumption: x and y are already appropriately scaled for the
            // canvas. Now we just need to figure out where in the scaled
            // cell size the tile belongs.
            var info = mod.get_tile_info(idx);
            var img = get_img(mod.get_img(idx));
            if (!info)
            {
                throw new Error("Tile not found: " + idx);
            }

            // this somewhat convoluted approach is to avoid fp scaling
            // artifacts at scale 1.0
            var img_xscale = this.x_scale;
            var img_yscale = this.y_scale;
            if (img_scale != undefined)
            {
                img_xscale = img_xscale * img_scale;
                img_yscale = img_yscale * img_scale;
            }
            else
                img_scale = 1.0;

            centre = centre === undefined ? true : centre;
            var size_ox = !centre ? 0 : 32 / 2 - info.w / 2;
            var size_oy = !centre ? 0 : 32 - info.h;
            var pos_sy_adjust = (ofsy || 0) + info.oy + size_oy;
            var pos_ey_adjust = pos_sy_adjust + info.ey - info.sy;
            var sy = pos_sy_adjust;
            var ey = pos_ey_adjust;
            if (y_max && y_max < ey)
                ey = y_max;

            if (sy >= ey)
                return;

            var total_x_offset = ((ofsx || 0) + info.ox + size_ox);

            // Offsets can be negative, in which case we are drawing overlapped
            // with a cell either to the right or above. If so, store the
            // overlap in cell state so that it can later be checked to trigger
            // a redraw.
            // These store logical pixels, but that currently doesn't matter
            // because they are only used for a comparison vs 0
            // See dungeon_renderer.js, render_loc.
            if (total_x_offset < this.current_left_overlap)
                this.current_left_overlap = total_x_offset;

            if (sy < this.current_sy)
                this.current_sy = sy;

            // dimensions in the source (the tilesheet)
            const w = info.ex - info.sx;
            const h = ey - sy;
            const ratio = window.devicePixelRatio;
            // dimensions in the target cell. To get this right at the pixel
            // level, we need to calculate the height/width as if it is offset
            // relative to the cell origin. Because of differences in how x/y
            // are treated above, these may look like they're doing something
            // different, but they shouldn't be.
            const scaled_w = Math.floor((total_x_offset + w) * img_xscale * ratio)
                                - Math.floor(total_x_offset * img_xscale * ratio);
            const scaled_h = Math.floor(ey * img_yscale * ratio)
                                - Math.floor(sy * img_yscale * ratio);

            this.ctx.imageSmoothingEnabled = options.get("tile_filter_scaling");
            this.ctx.drawImage(img,
                           info.sx, info.sy + sy - pos_sy_adjust, w, h,
                           x + Math.floor(total_x_offset * img_xscale * ratio),
                           y + Math.floor(sy * img_yscale * ratio),
                           scaled_w,
                           scaled_h);
        },

        draw_dngn: function(idx, x, y, img_scale)
        {
            this.draw_tile(idx, x, y, dngn,
                undefined, undefined, undefined, undefined,
                img_scale);
        },

        draw_gui: function(idx, x, y, img_scale)
        {
            this.draw_tile(idx, x, y, gui,
                undefined, undefined, undefined, undefined,
                img_scale);
        },

        draw_main: function(idx, x, y, img_scale)
        {
            this.draw_tile(idx, x, y, main,
                undefined, undefined, undefined, undefined,
                img_scale);
        },

        draw_player: function(idx, x, y, ofsx, ofsy, y_max, img_scale)
        {
            this.draw_tile(idx, x, y, tileinfo_player, ofsx, ofsy, y_max,
                undefined,
                img_scale);
        },

        draw_icon: function(idx, x, y, ofsx, ofsy, img_scale)
        {
            this.draw_tile(idx, x, y, icons, ofsx, ofsy,
                undefined, undefined,
                img_scale);
        },

        draw_quantity: function(qty, x, y, font)
        {
            qty = Math.max(0, Math.min(999, qty));

            this.ctx.fillStyle = "white";
            this.ctx.font = font;

            this.ctx.shadowColor = "black";
            this.ctx.shadowBlur = 2;
            this.ctx.shadowOffsetX = 1;
            this.ctx.shadowOffsetY = 1;
            this.ctx.textAlign = "left";
            this.ctx.textBaseline = "top";
            this.ctx.fillText(qty, (x + 2), (y + 2));
        },

        draw_from_texture: function (idx, x, y, tex, ofsx, ofsy, y_max, centre, img_scale)
        {
            var mod = tileinfos(tex);
            this.draw_tile(idx, x, y, mod, ofsx, ofsy, y_max, centre, img_scale);
        },
    };
});
