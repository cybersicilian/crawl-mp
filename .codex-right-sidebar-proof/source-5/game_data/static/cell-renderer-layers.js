define(["jquery", "./tileinfo-main", "./tileinfo-icons", "./tileinfo-dngn",
        "./enums", "./options"],
function ($, main, icons, dngn, enums, options) {
    "use strict";

    function in_water(cell)
    {
        return ((cell.bg.WATER) && !(cell.fg.FLYING));
    }

    return {
        in_water: in_water,
        methods: {
            set_submerged_clip: function(x, y, water_level)
            {
                this.ctx.beginPath();
                const scaled = this.scaled_size(null, water_level * this.y_scale);
                // this clip is across the entire row
                this.ctx.rect(0, y + scaled.height,
                              this.element.width,
                              this.element.height - y - scaled.height);
                this.ctx.clip();
            },

            set_nonsubmerged_clip: function(x, y, water_level)
            {
                this.ctx.beginPath();
                const scaled = this.scaled_size(null, water_level * this.y_scale);
                this.ctx.rect(0, 0, this.element.width, y + scaled.height);
                this.ctx.clip();
            },

            draw_blood_overlay: function(x, y, cell, is_wall)
            {
                var offset;

                if (cell.liquefied && !is_wall)
                {
                    offset = cell.flv.s % dngn.tile_count(dngn.LIQUEFACTION);
                    this.draw_dngn(dngn.LIQUEFACTION + offset, x, y);
                }
                else if (cell.bloody)
                {
                    cell.blood_rotation = cell.blood_rotation || 0;
                    var basetile;
                    if (is_wall)
                    {
                        basetile = cell.old_blood ? dngn.WALL_OLD_BLOOD : dngn.WALL_BLOOD_S;
                        basetile += dngn.tile_count(basetile) * cell.blood_rotation;
                        basetile = dngn.WALL_BLOOD_S + dngn.tile_count(dngn.WALL_BLOOD_S)
                            * cell.blood_rotation;
                    }
                    else
                        basetile = dngn.BLOOD;
                    offset = cell.flv.s % dngn.tile_count(basetile);
                    this.draw_dngn(basetile + offset, x, y);
                }
                else if (cell.moldy)
                {
                    offset = cell.flv.s % dngn.tile_count(dngn.MOLD);
                    this.draw_dngn(dngn.MOLD + offset, x, y);
                }
                else if (cell.glowing_mold)
                {
                    offset = cell.flv.s % dngn.tile_count(dngn.GLOWING_MOLD);
                    this.draw_dngn(dngn.GLOWING_MOLD + offset, x, y);
                }
            },

            draw_background: function(x, y, cell)
            {
                var bg = cell.bg;
                var bg_idx = cell.bg.value;
                var renderer = this;

                if (cell.mangrove_water && bg_idx > dngn.DNGN_UNSEEN)
                    this.draw_dngn(dngn.DNGN_SHALLOW_WATER, x, y);
                else if (bg_idx >= dngn.DNGN_FIRST_TRANSPARENT)
                {
                    this.draw_dngn(cell.flv.f, x, y); // f = floor

                    // Draw floor overlays beneath the feature
                    if (cell.ov)
                    {
                        $.each(cell.ov, function (i, overlay)
                               {
                                   if (overlay && overlay <= dngn.FLOOR_MAX)
                                       renderer.draw_dngn(overlay, x, y);
                               });
                    }
                }

                // Draw blood beneath feature tiles.
                if (bg_idx > dngn.WALL_MAX)
                    this.draw_blood_overlay(x, y, cell);

                if (cell.mangrove_water) // Draw the tree submerged
                {
                    this.ctx.save();
                    try
                    {
                        this.ctx.globalAlpha = 1.0;

                        this.set_nonsubmerged_clip(x, y, 20);

                        this.draw_dngn(bg_idx, x, y);
                    }
                    finally
                    {
                        this.ctx.restore();
                    }

                    this.ctx.save();
                    try
                    {
                        this.ctx.globalAlpha = 0.3;
                        this.set_submerged_clip(x, y, 20);

                        this.draw_dngn(bg_idx, x, y);
                    }
                    finally
                    {
                        this.ctx.restore();
                    }
                }
                else
                    this.draw_dngn(bg_idx, x, y);

                if (bg_idx > dngn.DNGN_UNSEEN)
                {
                    // Draw blood on top of wall tiles.
                    if (bg_idx <= dngn.WALL_MAX)
                        this.draw_blood_overlay(x, y, cell, bg_idx > dngn.FLOOR_MAX);

                    // Draw overlays
                    var ray_tile = 0;
                    if (cell.ov)
                    {
                        $.each(cell.ov, function (i, overlay)
                            {
                                if (overlay > dngn.DNGN_MAX)
                                    return;
                                else if (overlay == dngn.RAY
                                        || overlay == dngn.RAY_MULTI
                                        || overlay == dngn.RAY_OUT_OF_RANGE)
                                {
                                    // these need to be drawn last because of the
                                    // way alpha blending happens here, but for
                                    // hard-to-change reasons they are assembled on
                                    // the server side in the wrong order. (In local
                                    // tiles it's ok to blend them in any order.)
                                    // assumption: only one can appear on any tile.
                                    // TODO: a more general fix for this issue?
                                    ray_tile = overlay;
                                }
                                else if (overlay &&
                                    (bg_idx < dngn.DNGN_FIRST_TRANSPARENT ||
                                     overlay > dngn.FLOOR_MAX))
                                {
                                    renderer.draw_dngn(overlay, x, y);
                                }
                            });
                    }
                    if (ray_tile)
                        renderer.draw_dngn(ray_tile, x, y);

                    if (!bg.UNSEEN)
                    {
                        if (bg.KRAKEN_NW)
                            this.draw_dngn(dngn.KRAKEN_OVERLAY_NW, x, y);
                        else if (bg.ELDRITCH_NW)
                            this.draw_dngn(dngn.ELDRITCH_OVERLAY_NW, x, y);
                        if (bg.KRAKEN_NE)
                            this.draw_dngn(dngn.KRAKEN_OVERLAY_NE, x, y);
                        else if (bg.ELDRITCH_NE)
                            this.draw_dngn(dngn.ELDRITCH_OVERLAY_NE, x, y);
                        if (bg.KRAKEN_SE)
                            this.draw_dngn(dngn.KRAKEN_OVERLAY_SE, x, y);
                        else if (bg.ELDRITCH_SE)
                            this.draw_dngn(dngn.ELDRITCH_OVERLAY_SE, x, y);
                        if (bg.KRAKEN_SW)
                            this.draw_dngn(dngn.KRAKEN_OVERLAY_SW, x, y);
                        else if (bg.ELDRITCH_SW)
                            this.draw_dngn(dngn.ELDRITCH_OVERLAY_SW, x, y);
                    }

                    if (!bg.UNSEEN)
                    {
                        if (cell.sanctuary)
                            this.draw_dngn(dngn.SANCTUARY, x, y);
                        if (cell.blasphemy)
                            this.draw_dngn(dngn.BLASPHEMY, x, y);
                        if (cell.has_bfb_corpse)
                            this.draw_dngn(dngn.BLOOD_FOR_BLOOD, x, y);
                        if (cell.silenced)
                            this.draw_dngn(dngn.SILENCED, x, y);
                        if (cell.halo == enums.HALO_RANGE)
                            this.draw_dngn(dngn.HALO_RANGE, x, y);
                        if (cell.halo >= enums.HALO_UMBRA_FIRST
                            && cell.halo <= enums.HALO_UMBRA_LAST)
                        {
                            var variety = cell.halo - enums.HALO_UMBRA_FIRST;
                            this.draw_dngn(dngn.UMBRA + variety, x, y);
                        }
                        if (cell.orb_glow)
                            this.draw_dngn(dngn.ORB_GLOW + cell.orb_glow - 1, x, y);
                        if (cell.quad_glow)
                            this.draw_dngn(dngn.QUAD_GLOW, x, y);
                        if (cell.disjunct)
                            this.draw_dngn(dngn.DISJUNCT + cell.disjunct - 1, x, y);
                        if (cell.awakened_forest)
                            this.draw_icon(icons.BERSERK, x, y);

                        if (cell.fg)
                        {
                            var fg = cell.fg;
                            if (fg.PET)
                                this.draw_dngn(dngn.HALO_FRIENDLY, x, y);
                            else if (fg.GD_NEUTRAL)
                                this.draw_dngn(dngn.HALO_GD_NEUTRAL, x, y);
                            else if (fg.NEUTRAL)
                                this.draw_dngn(dngn.HALO_NEUTRAL, x, y);

                            // Monster difficulty. Ghosts get a special highlight.
                            if (fg.GHOST)
                            {
                                if (fg.TRIVIAL)
                                    this.draw_dngn(dngn.THREAT_GHOST_TRIVIAL, x, y);
                                else if (fg.EASY)
                                    this.draw_dngn(dngn.THREAT_GHOST_EASY, x, y);
                                else if (fg.TOUGH)
                                    this.draw_dngn(dngn.THREAT_GHOST_TOUGH, x, y);
                                else if (fg.NASTY)
                                    this.draw_dngn(dngn.THREAT_GHOST_NASTY, x, y);
                                else if (fg.UNUSUAL)
                                    this.draw_dngn(dngn.THREAT_UNUSUAL, x, y);
                            }
                            else
                            {
                                if (fg.TRIVIAL)
                                    this.draw_dngn(dngn.THREAT_TRIVIAL, x, y);
                                else if (fg.EASY)
                                    this.draw_dngn(dngn.THREAT_EASY, x, y);
                                else if (fg.TOUGH)
                                    this.draw_dngn(dngn.THREAT_TOUGH, x, y);
                                else if (fg.NASTY)
                                    this.draw_dngn(dngn.THREAT_NASTY, x, y);
                                else if (fg.UNUSUAL)
                                    this.draw_dngn(dngn.THREAT_UNUSUAL, x, y);
                            }

                            if (cell.highlighted_summoner)
                                this.draw_dngn(dngn.HALO_SUMMONER, x, y);
                        }


                        // Apply the travel exclusion under the foreground if the cell is
                        // visible. It will be applied later if the cell is unseen.
                        if (bg.EXCL_CTR)
                            this.draw_dngn(dngn.TRAVEL_EXCLUSION_CENTRE_BG, x, y);
                        else if (bg.TRAV_EXCL)
                            this.draw_dngn(dngn.TRAVEL_EXCLUSION_BG, x, y);
                    }

                    if (bg.REMEMBERED_INVIS)
                        this.draw_dngn(dngn.REMEMBERED_INVIS, x, y);
                }
            },

            draw_submerged_tile: function(base_idx, idx, x, y, trans, img_scale)
            {
                this.ctx.save();
                try
                {
                    this.ctx.globalAlpha = trans ? 0.5 : 1.0;

                    this.set_nonsubmerged_clip(x, y, 20);

                    if (base_idx)
                        this.draw_main(base_idx, x, y, img_scale);

                    this.draw_main(idx, x, y, img_scale);
                }
                finally
                {
                    this.ctx.restore();
                }

                this.ctx.save();
                try
                {
                    this.ctx.globalAlpha = trans ? 0.1 : 0.3;
                    this.set_submerged_clip(x, y, 20);

                    if (base_idx)
                        this.draw_main(base_idx, x, y, img_scale);

                    this.draw_main(idx, x, y, img_scale);
                }
                finally
                {
                    this.ctx.restore();
                }
            },

            draw_foreground: function(x, y, map_cell, img_scale)
            {
                var cell = map_cell.t;
                var fg = cell.fg;
                var bg = cell.bg;
                var fg_idx = cell.fg.value;
                var is_in_water = in_water(cell);

                if (fg_idx && fg_idx <= main.MAIN_MAX && options.get("tile_display_mode") == "tiles")
                {
                    var base_idx = cell.base;
                    if (is_in_water)
                    {
                        this.draw_submerged_tile(base_idx, fg_idx, x, y,
                                                 cell.trans, img_scale);
                    }
                    else
                    {
                        if (base_idx)
                            this.draw_main(base_idx, x, y, img_scale);

                        this.draw_main(fg_idx, x, y, img_scale);
                    }

                    if (fg_idx >= main.PARCHMENT_LOW && fg_idx <= main.PARCHMENT_HIGH)
                    {
                        if (cell.overlay1)
                        {
                            if (is_in_water)
                            {
                                this.draw_submerged_tile(null, cell.overlay1, x, y,
                                                         cell.trans, img_scale)
                            }
                            else
                                this.draw_main(cell.overlay1, x, y, img_scale);
                        }
                        if (cell.overlay2)
                        {
                            if (is_in_water)
                            {
                                this.draw_submerged_tile(null, cell.overlay2, x, y,
                                                         cell.trans, img_scale)
                            }
                            else
                                this.draw_main(cell.overlay2, x, y, img_scale);
                        }
                    }
                }
                else if (options.get("tile_display_mode") == "hybrid")
                {
                    this.render_glyph(x, y, map_cell, true, true);
                    img_scale = undefined; // TODO: make this work?
                }

                if (fg.NET)
                    this.draw_icon(icons.TRAP_NET, x, y, undefined, undefined, img_scale);

                if (fg.WEB)
                    this.draw_icon(icons.TRAP_WEB, x, y, undefined, undefined, img_scale);

                if (fg.S_UNDER)
                    this.draw_icon(icons.ITEM_STACK_1, x, y, undefined, undefined, img_scale);
                else if (fg.S_UNDER_GOOD)
                    this.draw_icon(icons.ITEM_STACK_2, x, y, undefined, undefined, img_scale);
                else if (fg.S_UNDER_ARTEFACT)
                    this.draw_icon(icons.ITEM_STACK_3, x, y, undefined, undefined, img_scale);

                // Pet mark
                if (fg.PET)
                    this.draw_icon(icons.FRIENDLY, x, y, undefined, undefined, img_scale);
                else if (fg.GD_NEUTRAL)
                    this.draw_icon(icons.GOOD_NEUTRAL, x, y, undefined, undefined, img_scale);
                else if (fg.NEUTRAL)
                    this.draw_icon(icons.NEUTRAL, x, y, undefined, undefined, img_scale);

                if (bg.REMEMBERED_INVIS)
                    this.draw_icon(icons.UNSEEN_INVIS_REMEMBERED, x, y, undefined, undefined, img_scale);

                var status_shift = 0;
                if (fg.PARALYSED)
                {
                    this.draw_icon(icons.PARALYSED, x, y, undefined, undefined, img_scale);
                    status_shift += 12;
                }
                else if (fg.STAB)
                {
                    this.draw_icon(icons.STAB_BRAND, x, y, undefined, undefined, img_scale);
                    status_shift += 12;
                }
                else if (fg.MAY_STAB)
                {
                    this.draw_icon(icons.UNAWARE, x, y, undefined, undefined, img_scale);
                    status_shift += 7;
                }
                else if (fg.FLEEING)
                {
                    this.draw_icon(icons.FLEEING, x, y, undefined, undefined, img_scale);
                    status_shift += 3;
                }

                if (fg.POISON)
                {
                    this.draw_icon(icons.POISON, x, y, -status_shift, 0, img_scale);
                    status_shift += 5;
                }
                else if (fg.MORE_POISON)
                {
                    this.draw_icon(icons.MORE_POISON, x, y, -status_shift, 0, img_scale);
                    status_shift += 5;
                }
                else if (fg.MAX_POISON)
                {
                    this.draw_icon(icons.MAX_POISON, x, y, -status_shift, 0, img_scale);
                    status_shift += 5;
                }

                for (var i = 0; i < cell.icons.length; ++i)
                {
                    status_shift += this.draw_icon_type(cell.icons[i], x, y, -status_shift, 0, img_scale);
                }

                if (bg.UNSEEN && (bg.value || fg.value))
                    this.draw_icon(icons.MESH, x, y, undefined, undefined, img_scale);

                if (bg.OOR && (bg.value || fg.value))
                    this.draw_icon(icons.OOR_MESH, x, y, undefined, undefined, img_scale);

                if (bg.MM_UNSEEN && (bg.value || fg.value))
                    this.draw_icon(icons.MAGIC_MAP_MESH, x, y, undefined, undefined, img_scale);

                if (bg.RAMPAGE)
                    this.draw_icon(icons.RAMPAGE, x, y, undefined, undefined, img_scale);

                // Don't let the "new stair" icon cover up any existing icons, but
                // draw it otherwise.
                if (bg.NEW_STAIR && status_shift == 0)
                    this.draw_icon(icons.NEW_STAIR, x, y, undefined, undefined, img_scale);

                if (bg.NEW_TRANSPORTER && status_shift == 0)
                    this.draw_icon(icons.NEW_TRANSPORTER, x, y, undefined, undefined, img_scale);

                if (bg.EXCL_CTR && bg.UNSEEN)
                    this.draw_icon(icons.TRAVEL_EXCLUSION_CENTRE_FG, x, y, undefined, undefined, img_scale);
                else if (bg.TRAV_EXCL && bg.UNSEEN)
                    this.draw_icon(icons.TRAVEL_EXCLUSION_FG, x, y, undefined, undefined, img_scale);

                // Tutorial cursor takes precedence over other cursors.
                if (bg.TUT_CURSOR)
                {
                    this.draw_icon(icons.TUTORIAL_CURSOR, x, y, undefined, undefined, img_scale);
                }
                else if (bg.CURSOR1)
                {
                    this.draw_icon(icons.CURSOR, x, y, undefined, undefined, img_scale);
                }
                else if (bg.CURSOR2)
                {
                    this.draw_icon(icons.CURSOR2, x, y, undefined, undefined, img_scale);
                }
                else if (bg.CURSOR3)
                {
                    this.draw_icon(icons.CURSOR3, x, y, undefined, undefined, img_scale);
                }

                if (cell.travel_trail & 0xF)
                {
                    this.draw_icon(icons.TRAVEL_PATH_FROM +
                                   (cell.travel_trail & 0xF) - 1, x, y, undefined, undefined, img_scale);
                }
                if (cell.travel_trail & 0xF0)
                {
                    this.draw_icon(icons.TRAVEL_PATH_TO +
                            ((cell.travel_trail & 0xF0) >> 4) - 1, x, y, undefined, undefined, img_scale);
                }

                if (fg.MDAM_LIGHT)
                    this.draw_icon(icons.MDAM_LIGHTLY_DAMAGED, x, y, undefined, undefined, img_scale);
                else if (fg.MDAM_MOD)
                    this.draw_icon(icons.MDAM_MODERATELY_DAMAGED, x, y, undefined, undefined, img_scale);
                else if (fg.MDAM_HEAVY)
                    this.draw_icon(icons.MDAM_HEAVILY_DAMAGED, x, y, undefined, undefined, img_scale);
                else if (fg.MDAM_SEV)
                    this.draw_icon(icons.MDAM_SEVERELY_DAMAGED, x, y, undefined, undefined, img_scale);
                else if (fg.MDAM_ADEAD)
                    this.draw_icon(icons.MDAM_ALMOST_DEAD, x, y, undefined, undefined, img_scale);

                if (options.get("tile_show_demon_tier") === true)
                {
                    if (fg.DEMON_1)
                        this.draw_icon(icons.DEMON_NUM1, x, y, undefined, undefined, img_scale);
                    else if (fg.DEMON_2)
                        this.draw_icon(icons.DEMON_NUM2, x, y, undefined, undefined, img_scale);
                    else if (fg.DEMON_3)
                        this.draw_icon(icons.DEMON_NUM3, x, y, undefined, undefined, img_scale);
                    else if (fg.DEMON_4)
                        this.draw_icon(icons.DEMON_NUM4, x, y, undefined, undefined, img_scale);
                    else if (fg.DEMON_5)
                        this.draw_icon(icons.DEMON_NUM5, x, y, undefined, undefined, img_scale);
                }
            },

        }
    };
});
