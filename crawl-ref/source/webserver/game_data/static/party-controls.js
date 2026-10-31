define(["jquery", "comm", "./dungeon_renderer", "./minimap", "./party-inspector", "./party-model", "./party-ping"],
function ($, comm, dungeon_renderer, minimap, inspector, model, pings) {
    "use strict";

    var ensure_party_styles_and_dom = inspector.ensure;
    var bind_party_rich_tooltips = inspector.tooltips;
    var bind_party_inspector_hotkeys = inspector.hotkeys;
    var open_party_inspector = inspector.open;

    function toggle_add_companion_drawer(force_show)
    {
        var $drawer = $("#party_add_drawer");
        if (force_show === true)
            $drawer.slideDown(80);
        else if (force_show === false)
            $drawer.slideUp(80);
        else
            $drawer.slideToggle(80);
    }

    function bind_party_hud_buttons(handle_party_state)
    {
        ensure_party_styles_and_dom();
        bind_party_rich_tooltips();
        bind_party_inspector_hotkeys();

        if (!$("#party_yield_btn").length) {
            $("<button id='party_yield_btn' type='button' class='dcss-dock-btn' hidden>Yield</button>")
                .attr({ "aria-pressed": "false", "data-tip-title": "Yield",
                    "data-tip-body": "Automatically wait in place until you stop yielding or become threatened. Your floor advances with these waits." })
                .on("click", function (event) {
                    event.preventDefault(); event.stopPropagation();
                    var state = window.crawl_party.state;
                    var own = state.members.find(function (member) { return member.slot === model.controlledSlot(state); });
                    comm.send_message("party_activity", { action: own.activity ? "cancel" : "yield" });
                    this.blur();
                }).prependTo("#dcss_quick_dock");
        }

        $("#party_hud, #party_turn_banner").off("keydown.partyChrome keypress.partyChrome")
            .on("keydown.partyChrome keypress.partyChrome", "button, summary, input, select", function (event) {
                event.stopPropagation();
            });

        $("#party_join_btn").off("click.party").on("click.party", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            comm.send_message("join_party", {});
        });
        $("#party_add_btn, #party_banner_add").off("click.party").on("click.party", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            $("#party_hud").show();
            toggle_add_companion_drawer();
        });
        $("#party_add_close").off("click.party").on("click.party", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            toggle_add_companion_drawer(false);
        });
        $(".party-preset-chip").off("click.party").on("click.party", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var base_spec = $(this).data("spec");
            var custom_name = ($("#party_add_name").val() || "").trim();
            var name_to_use = custom_name || $(this).data("default-name") || "";
            var spec = name_to_use ? (name_to_use + ":" + base_spec) : base_spec;
            comm.send_message("add_party_member", { spec: spec });
            $("#party_add_name").val("");
            toggle_add_companion_drawer(false);
        });
        $("#party_add_custom_submit").off("click.party").on("click.party", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var sp = $("#party_add_species").val() || "Minotaur";
            var jb = $("#party_add_job").val() || "Fighter";
            var nm = ($("#party_add_name").val() || "").trim();
            var spec = (nm ? (nm + ":") : "") + sp + "/" + jb;
            comm.send_message("add_party_member", { spec: spec });
            $("#party_add_name").val("");
            toggle_add_companion_drawer(false);
        });
        $("#party_banner_cycle").off("click.party").on("click.party", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            comm.send_message("cycle_player", {});
        });
        $("#party_banner_center").off("click.party").on("click.party", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var st = window.crawl_party && window.crawl_party.state;
            if (!st || !st.members) return;
            for (var i = 0; i < st.members.length; ++i)
            {
                if (st.members[i].slot === model.controlledSlot(st) && st.members[i].pos)
                {
                    dungeon_renderer.set_view_center(st.members[i].pos.x, st.members[i].pos.y);
                    minimap.update_overlay();
                    break;
                }
            }
        });
        $(".party-ping-btn").off("click.party").on("click.party", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var kind = $(this).data("ping-kind") || "look";
            window.crawl_party = window.crawl_party || { state: null, pings: [] };
            window.crawl_party.open_inspector = open_party_inspector;
            if (window.crawl_party.armed_ping_kind === kind)
            {
                // Second click on same button: immediately ping active hero's tile
                window.crawl_party.armed_ping_kind = null;
                $(".party-ping-btn").removeClass("armed");
                $("#dungeon").css("cursor", "");
                var st = window.crawl_party.state;
                if (st && st.members)
                {
                    for (var i = 0; i < st.members.length; ++i)
                    {
                        if (st.members[i].slot === model.controlledSlot(st) && st.members[i].pos)
                        {
                            pings.send(st.members[i].pos.x, st.members[i].pos.y, kind);
                            break;
                        }
                    }
                }
            }
            else
            {
                window.crawl_party.armed_ping_kind = kind;
                $(".party-ping-btn").removeClass("armed");
                $(this).addClass("armed");
                $("#dungeon").css("cursor", "crosshair");
            }
            $(document).trigger("party_ping_mode");
        });
    }

    return { bind: bind_party_hud_buttons, toggle_drawer: toggle_add_companion_drawer };
});
