define(["jquery", "./enums", "./player", "./options"],
function ($, enums, player, options) {
    "use strict";

    var fg_term_colours, bg_term_colours;
    var healthy, hp_spend, magic, magic_spend;

    function determine_colours()
    {
        fg_term_colours = [];
        bg_term_colours = [];
        var $game = $("#game");
        for (var i = 0; i < 16; ++i)
        {
            var elem = $("<span class='glyph fg" + i + " bg" + i + "'></span>");
            $game.append(elem);
            fg_term_colours.push(elem.css("color"));
            bg_term_colours.push(elem.css("background-color"));
            elem.detach();
        }

        // FIXME: CSS lookup doesn't work on Chrome after saving and loading a
        // game, style information is missing for some reason.
        // Use hard coded values instead.
        healthy = "#8ae234";
        hp_spend = "#b30009";
        magic = "#5e78ff";
        // healthy = $("#stats_hp_bar_full").css("background-color");
        // hp_spend = $("#stats_hp_bar_decrease").css("background-color");
        // magic = $("#stats_mp_bar_full").css("background-color");
        magic_spend = "black";
    }

    function split_term_colour(col)
    {
        var fg = col & 0xF;
        var bg = 0;
        var attr = (col & 0xF0) >> 4;
        var param = (col & 0xF000) >> 12;
        return { fg: fg, bg: bg, attr: attr, param: param };
    }

    function term_colour_apply_attributes(col)
    {
        if (col.attr == enums.CHATTR.HILITE)
        {
            col.bg = col.param;
            if (col.bg == col.fg)
                col.fg = 0;
        }
        if (col.attr == enums.CHATTR.REVERSE)
        {
            var z = col.bg;
            col.bg = col.fg;
            col.fg = z;
        }
    }

    return {
        determine_colours: determine_colours,
        methods: {
            glyph_mode_font_name: function (scale, device)
            {
                var glyph_scale;
                if (scale)
                    glyph_scale = scale * 100;
                else
                {
                    if (this.ui_state == enums.ui.VIEW_MAP)
                        glyph_scale = options.get("tile_map_scale");
                    else
                        glyph_scale = options.get("tile_viewport_scale");
                    glyph_scale = ((glyph_scale - 100) / 2 + 100);
                }
                if (!scale && this.ui_state === enums.ui.NORMAL)
                    glyph_scale *= this.viewport_zoom || 1;
                if (device)
                    glyph_scale = glyph_scale * window.devicePixelRatio;

                return (Math.floor(this.glyph_mode_font_size * glyph_scale / 100)
                    + "px " + this.glyph_mode_font);
            },

            glyph_mode_update_font_metrics: function ()
            {
                this.ctx.font = this.glyph_mode_font_name();

                // Glyph used here does not matter because fontBoundingBoxAscent
                // and fontBoundingBoxDescent are specific to the font whereas all
                // glyphs in a monospaced font will have the same width
                var metrics = this.ctx.measureText('@');
                this.glyph_mode_font_width = Math.ceil(metrics.width);

                // 2022: this feature appears to still be unavailable by default
                // in firefox
                if (metrics.fontBoundingBoxAscent)
                {
                    this.glyph_mode_baseline = metrics.fontBoundingBoxAscent;
                    this.glyph_mode_line_height = (metrics.fontBoundingBoxAscent
                                                + metrics.fontBoundingBoxDescent);
                }
                else
                {   // Inspired by https://stackoverflow.com/q/1134586/
                    var body = document.body;
                    var ref_glyph = document.createElement("span");
                    var ref_block = document.createElement("div");
                    var div = document.createElement("div");

                    ref_glyph.innerHTML = '@';
                    ref_glyph.style.font = this.ctx.font;

                    ref_block.style.display = "inline-block";
                    ref_block.style.width = "1px";
                    ref_block.style.height = "0px";

                    div.style.visibility = "hidden";
                    div.appendChild(ref_glyph);
                    div.appendChild(ref_block);
                    body.appendChild(div);

                    try
                    {
                        ref_block.style["vertical-align"] = "baseline";
                        this.glyph_mode_baseline = (ref_block.offsetTop
                                                    - ref_glyph.offsetTop);
                        ref_block.style["vertical-align"] = "bottom";
                        this.glyph_mode_line_height = (ref_block.offsetTop
                                                        - ref_glyph.offsetTop);
                    }
                    finally
                    {
                        document.body.removeChild(div);
                    }
                }
            },

            draw_minibars: function(x, y)
            {
                var show_health = options.get("tile_show_minihealthbar");
                var show_magic = options.get("tile_show_minimagicbar");

                // don't draw if hp and mp is full
                if ((player.hp == player.hp_max || !show_health) &&
                    (player.mp == player.mp_max || !show_magic))
                    return;

                let cell = this.scaled_size();
                var bar_height = Math.floor(cell.height / 16);
                var hp_bar_offset = bar_height;

                // TODO: use different colors if heavily wounded, like in the tiles version
                if (player.mp_max > 0 && show_magic)
                {
                    var mp_percent = player.mp / player.mp_max;
                    if (mp_percent < 0) mp_percent = 0;

                    this.ctx.fillStyle = magic_spend;
                    this.ctx.fillRect(x, y + cell.height - bar_height,
                                      cell.width, bar_height);

                    this.ctx.fillStyle = magic;
                    this.ctx.fillRect(x, y + cell.height - bar_height,
                                      cell.width * mp_percent, bar_height);

                    hp_bar_offset += bar_height;
                }

                if (show_health)
                {
                    var hp_percent = player.hp / player.hp_max;
                    if (hp_percent < 0) hp_percent = 0;

                    this.ctx.fillStyle = hp_spend;
                    this.ctx.fillRect(x, y + cell.height - hp_bar_offset,
                                      cell.width, bar_height);

                    this.ctx.fillStyle = healthy;
                    this.ctx.fillRect(x, y + cell.height - hp_bar_offset,
                                      cell.width * hp_percent, bar_height);
                }
            },

            render_glyph: function (x, y, map_cell, omit_bg, square, scale)
            {
                // `map_cell` can be anything as long as it provides `col` and `g`
                var col = split_term_colour(map_cell.col);
                if (omit_bg && col.attr == enums.CHATTR.REVERSE)
                    col.attr = 0;
                term_colour_apply_attributes(col);
                let cell = this.scaled_size();
                var w = cell.width;
                var h = cell.height;
                if (scale)
                {
                    // assume x and y are already scaled...
                    w = w * scale;
                    h = h * scale;
                }

                var prefix = "";
                if (col.attr == enums.CHATTR.BOLD)
                    prefix = "bold ";

                if (!omit_bg)
                {
                    this.ctx.fillStyle = bg_term_colours[col.bg];
                    this.ctx.fillRect(x, y, w, h);
                }
                this.ctx.fillStyle = fg_term_colours[col.fg];
                this.ctx.font = prefix + this.glyph_mode_font_name(scale, true);

                this.ctx.save();

                try
                {
                    this.ctx.beginPath();
                    this.ctx.rect(x, y, w, h);
                    this.ctx.clip();

                    if (square)
                    {
                        this.ctx.textAlign = "center";
                        this.ctx.textBaseline = "middle";
                        this.ctx.fillText(map_cell.g,
                                            Math.floor(x + w/2),
                                            Math.floor(y + h/2));
                    }
                    else
                    {
                        this.ctx.fillText(map_cell.g, x,
                            y + this.glyph_mode_baseline * window.devicePixelRatio);
                    }
                }
                finally
                {
                    this.ctx.restore();
                }
            },

        }
    };
});
