define(["jquery", "comm", "client", "./dungeon_renderer", "./display", "./minimap", "./party-model", "./party-inspector", "./party-controls", "./status-icons", "./chat-context", "item-properties", "./party-initiative", "./party-navigation", "./party-card-status", "./player-card-details", "./party-doom", "./party-trade"],
function ($, comm, client, dungeon_renderer, display, minimap, model, inspector, controls, icons, chatContext, properties, initiative, navigation, cardStatus, details, doom, trade) {
    "use strict";

    var party_slot_colours = model.colours;
    var normalize_party_member = model.normalize;
    var format_char_abbrev = model.abbreviation;

    var open_party_inspector = inspector.open;
    var render_party_inspector_modal = inspector.render;
    var toggle_add_companion_drawer = controls.toggle_drawer;

    window.crawl_party = window.crawl_party || {
        state: null,
        pings: []
    };
    var party_ping_timer = null;
    var prev_member_positions = [];
    var last_members_signature = "";

    function invalidate_locs(locs)
    {
        if (display.invalidate_positions)
            display.invalidate_positions(locs);
        else
            display.invalidate(true);
    }

    function ensure_ping_timer()
    {
        if (party_ping_timer)
            return;
        party_ping_timer = setInterval(function () {
            var now = Date.now();
            var pings = (window.crawl_party && window.crawl_party.pings) || [];
            var remaining = [];
            for (var i = 0; i < pings.length; ++i)
            {
                if (pings[i].expires > now)
                    remaining.push(pings[i]);
            }
            window.crawl_party.pings = remaining;
            invalidate_locs(pings);
            display.display();
            minimap.update_overlay();
            if (remaining.length === 0)
            {
                clearInterval(party_ping_timer);
                party_ping_timer = null;
            }
        }, 80);
    }

    function handle_party_state(data)
    {
        window.crawl_party = window.crawl_party || { state: null, pings: [] };
        if (data && window.crawl_party.state && window.crawl_party.state.floor !== data.floor)
            window.crawl_party.pings = [];
        window.crawl_party.open_inspector = open_party_inspector;
        window.crawl_party.state = data;

        var $hud = $("#party_hud");
        var $banner = $("#party_turn_banner");
        if (!data || !data.members || data.members.length === 0)
        {
            details.preserve();
            $hud.hide();
            $banner.hide();
            details.mount();
            return;
        }
        for (var mi = 0; mi < data.members.length; ++mi)
            normalize_party_member(data.members[mi]);

        $hud.show();
        doom.update(data);
        $banner.show();
        controls.bind(handle_party_state);

        var count = data.player_count || data.members.length;
        var max_p = data.max_players || 4;

        if (data.multiplayer || count >= max_p)
        {
            $("#party_add_btn, #party_banner_add").hide();
            toggle_add_companion_drawer(false);
        }
        else
        {
            $("#party_add_btn, #party_banner_add").show();
        }

        $("#party_banner_cycle").toggle(!client.is_watching() && model.canSwitch(data));

        var active_member = data.members[0];
        var controlled_slot = model.controlledSlot(data);
        for (var k = 0; k < data.members.length; ++k)
        {
            if (data.members[k].slot === controlled_slot)
            {
                active_member = data.members[k];
                break;
            }
        }
        var shared_gold = (data.gold !== undefined)
            ? Number(data.gold)
            : (active_member && active_member.gold !== undefined ? Number(active_member.gold) : undefined);
        if (!Number.isFinite(shared_gold) || shared_gold < 0)
            shared_gold = undefined;
        data.gold = shared_gold;
        for (var gi = 0; gi < data.members.length; ++gi)
            data.members[gi].gold = shared_gold;
        $("#party_hud_gold")
            .text(shared_gold === undefined ? "Gold unavailable" : shared_gold + " gold")
            .attr("data-tip-title", "Shared Party Gold: " + model.display(shared_gold));

        var active_col = party_slot_colours[controlled_slot % party_slot_colours.length];
        $("#party_banner_dot").css({
            "background": active_col,
            "color": active_col
        });
        $("#party_banner_who")
            .css("color", active_col)
            .text("P" + (controlled_slot + 1) + " · " + (active_member ? active_member.name : "Hero"));

        var region_combat = model.inCombat(data, active_member);
        var region_tag = active_member && Number.isInteger(active_member.region_id)
            ? " · R" + (active_member.region_id + 1) : "";
        if (region_combat)
        {
            var status_word = active_member && active_member.queued_action ? "Queued"
                : active_member && active_member.can_act === false ? "Recovering" : "Ready";
            $("#party_banner_mode").removeClass("explore").addClass("combat")
                .text(data.multiplayer ? (data.floor || (active_member && active_member.place) || "") + region_tag + " · " + status_word
                    : "Combat Queue (P" + ((data.active_slot || 0) + 1) + ")");
        }
        else
        {
            $("#party_banner_mode").removeClass("combat").addClass("explore")
                .text("Free Explore" + (data.multiplayer ? region_tag + (active_member && active_member.queued_action ? " · Queued" : "") : ""));
        }
        var activity = active_member && active_member.activity;
        $("#party_yield_btn").prop("hidden", !data.multiplayer || client.is_watching())
            .prop("disabled", !active_member || active_member.alive === false)
            .attr("aria-pressed", String(activity === "yield"))
            .text(activity ? "Stop " + ({ yield: "yielding", rest: "resting", explore: "exploring", travel: "travel" }[activity] || activity) : "Yield");
        if (activity) $("#party_banner_mode").append(" · " + ({ yield: "Yielding", rest: "Resting", explore: "Exploring", travel: "Travelling" }[activity] || activity));

        if (client.is_party_member && client.is_party_member())
        {
            var my_slot = (window.crawl_party_slot !== undefined) ? window.crawl_party_slot : 0;
            $("#party_join_btn").text("Your slot: P" + (my_slot + 1));
        }
        else
        {
            $("#party_join_btn").text("Claim party slot");
        }
        $("#party_join_btn").prop("disabled", client.is_party_member());

        var $members = $("#party_hud_members");
        var next_members_sig = model.cardSignature(data, controlled_slot, Boolean(client.is_watching && client.is_watching()));
        if (next_members_sig !== last_members_signature
            || $members.children(".party-member-card").length !== data.members.length)
        {
            last_members_signature = next_members_sig;
            var focusedCardControl = $.contains($members[0], document.activeElement) ? document.activeElement.id : "";
            if (window.dcss_tooltips && $members.find("[aria-describedby~='dcss_rich_tooltip']").length)
                window.dcss_tooltips.hide();
            $(document).trigger("party_cards_rebuilding");
            details.preserve();
            $members.empty();

            var orderedMembers = data.members.slice().sort(function (a, b) {
                return Number(b.slot === controlled_slot) - Number(a.slot === controlled_slot);
            });
            $.each(orderedMembers, function (idx, m) {
                var mp_pct = m.mp_max > 0 ? Math.max(0, Math.min(100, Math.round(100 * m.mp / m.mp_max))) : 0;
                var is_downed = Boolean(m.ghost_haunting || m.alive === false);
                var slot_col = party_slot_colours[m.slot % party_slot_colours.length];

                var $card = $("<div class='party-card party-member-card'></div>")
                    .attr("data-party-slot", m.slot).css("border-left-color", slot_col)
                    .toggleClass("is-controlled-card", m.slot === controlled_slot);
                if (m.active)
                    $card.addClass("active-turn");
                if (is_downed)
                    $card.addClass("downed-haunting");
                var navigationParts = navigation.create(m.slot);
                $card.append(cardStatus.portrait(m, navigationParts[0], open_party_inspector));

                // Identity has its own row so long hero names remain readable.
                var $top = $("<div class='party-member-top'></div>");
                var $leftInfo = $("<div class='party-member-identity'></div>");
                var $meta = $("<div class='party-member-meta'></div>");
                var slot_prefix = "[P" + (m.slot + 1) + "] ";
                var $name = $("<button type='button' class='party-member-name'></button>")
                    .attr("id", "party_name_" + m.slot)
                    .css("color", m.active ? "#fce94f" : slot_col)
                    .text(slot_prefix + m.name).attr({ "aria-label": "Inspect " + m.name,
                        "data-tip-title": m.name, "data-tip-meta": "Inspect character" });
                $name.on("click", function (event) { event.stopPropagation(); open_party_inspector(m.slot, "overview"); });
                $name.text(m.name);
                if (m.slot === controlled_slot) $card.find(".party-portrait").append($name);
                else $leftInfo.append($name);

                var char_code = format_char_abbrev(m.species, m.job);
                var full_spec_title = (m.species || "") + " " + (m.job || "") + (m.god ? (" of " + m.god) : "");
                var $xlSpan = $("<span></span>")
                    .attr("data-tip-title", m.name + " — " + full_spec_title)
                    .attr("data-tip-body", "Experience Level " + model.display(m.xl) + " (" + (m.title || "Adventurer") + "). Str " + m.str + " | Int " + m.intel + " | Dex " + m.dex)
                    .attr("data-tip-meta", "Click [Inspect] for full Stat Sheet");
                $xlSpan.append($("<span class='party-stat-lbl'>XL:</span>"));
                $xlSpan.append($("<span class='party-stat-val'></span>").text(model.display(m.xl) + " " + char_code));
                $meta.append($xlSpan);

                var floor_text = model.display(m.place)
                    + (Number.isInteger(m.region_id) ? " · R" + (m.region_id + 1) : "");
                var $floor = $("<span class='party-floor-badge'></span>").text(floor_text);
                if (Number.isInteger(m.region_id))
                    $floor.attr("data-region-id", "R" + (m.region_id + 1));
                if (m.on_same_level === false)
                {
                    $floor.addClass("other-floor")
                        .attr("data-tip-title", "Independent Floor Exploration")
                        .attr("data-tip-body", m.name + " is currently exploring " + (m.place || "another branch") + " independently.");
                }
                else if (m.same_region === false)
                {
                    $floor.addClass("other-region")
                        .attr("data-tip-title", "Independent Floor Region" + (Number.isInteger(m.region_id) ? " (R" + (m.region_id + 1) + ")" : ""))
                        .attr("data-tip-body", m.name + " is exploring an independent chunk on " + (m.place || "this floor") + " with an independent action clock.");
                }
                else if (Number.isInteger(m.region_id))
                {
                    $floor.addClass("same-region")
                        .attr("data-tip-title", "Synced Region (R" + (m.region_id + 1) + ")")
                        .attr("data-tip-body", m.name + " shares your active region clock on " + (m.place || "this floor") + ".");
                }
                $meta.append($floor);
                $top.append($leftInfo);

                var sh_val = model.display(m.sh);
                var $def = $("<span class='party-def-badges'></span>")
                    .attr("data-tip-title", "Defensive Ratings")
                    .attr("data-tip-body", "Armour Class (AC): " + model.display(m.ac) + " | Evasion (EV): " + model.display(m.ev) + " | Shielding (SH): " + sh_val)
                    .attr("data-tip-meta", "Str " + m.str + " / Int " + m.intel + " / Dex " + m.dex);
                $def.append($("<span class='party-stat-lbl'>AC:</span>")).append($("<span class='party-stat-val'></span>").text(model.display(m.ac) + " "));
                $def.append($("<span class='party-stat-lbl'>EV:</span>")).append($("<span class='party-stat-val'></span>").text(model.display(m.ev) + " "));
                $def.append($("<span class='party-stat-lbl'>SH:</span>")).append($("<span class='party-stat-val'></span>").text(sh_val));
                $meta.append($def);
                $card.append($top);
                $card.append($meta);

                // Row 2: Classic DCSS flat rectangular HP and MP bars
                var $bars = $("<div class='party-bars'></div>");
                var $hpWrap = cardStatus.health(m);

                var $mpWrap = $("<div class='party-bar-wrap mp-track'></div>")
                    .attr("data-tip-title", m.name + " Magic Points")
                    .attr("data-tip-body", "Current MP: " + m.mp + " / " + m.mp_max + " (" + mp_pct + "%)");
                $mpWrap.append($("<div class='party-mp-fill'></div>").css("width", mp_pct + "%"));
                $mpWrap.append($("<div class='party-bar-label'></div>").text("MP " + m.mp + "/" + m.mp_max));

                $bars.append($hpWrap).append($mpWrap);
                $card.append($bars);

                var mv_aut = m.move_aut, ak_aut = m.atk_aut;
                var $timing = $("<span class='party-member-timing'></span>");
                $timing.append(initiative.create());
                var $passives = cardStatus.passives(m, open_party_inspector);
                var $effects = cardStatus.create(m);
                if (m.slot === controlled_slot) {
                    $leftInfo.append($effects, $passives);
                    $meta.append($timing);
                }
                else $leftInfo.append($timing);

                // The controlled hero uses the full width below its portrait and readings.
                var $footer = $("<div class='party-member-footer'></div>");
                var raw_weap = m.weapon === "" ? "Unarmed" : model.display(m.weapon);
                var weap_str = raw_weap;
                if (raw_weap === "Unarmed" || raw_weap === "unarmed")
                    weap_str = "-) Unarmed";
                else if (!/^[a-zA-Z-]\)\s/.test(raw_weap))
                    weap_str = "a) " + raw_weap;
                var spd_suffix = " · Spd:" + (mv_aut / 10).toFixed(1) + "t/mv";
                $footer.append(
                    $("<span class='party-weapon-text'></span>")
                        .append(properties.render(weap_str), document.createTextNode(spd_suffix))
                        .addClass("party-member-equipment").attr("data-tip-title", "Wielded Weapon & Action Speed")
                        .attr("data-tip-body", weap_str + " | Move: " + (mv_aut / 10).toFixed(1) + "t (" + mv_aut + " aut) | Atk: " + (ak_aut / 10).toFixed(1) + "t (" + ak_aut + " aut)")
                );

                var $actions = $("<div class='party-card-actions'></div>");
                $actions.append(navigationParts[1]);
                var $inspCardBtn = $("<button type='button' class='party-mini-btn party-inspect-btn'>[Inspect]</button>")
                    .attr("data-inspect-slot", m.slot)
                    .attr("data-tip-title", "Inspect " + m.name + " (P" + (m.slot + 1) + ")")
                    .attr("data-tip-body", "View Stat Sheet, Resistances, Buffs, Spells, Mutations, Skills & Inventory.")
                    .attr("data-tip-meta", "Shortcut: F" + (m.slot + 1));
                $inspCardBtn.on("click", function (ev) {
                    ev.stopPropagation();
                    open_party_inspector(m.slot, "overview");
                });
                $actions.append($inspCardBtn);
                if (m.ai)
                {
                    var aiPaused = m.ai.state === "paused" || m.ai.state === "error";
                    var $ai = $(data.ai_manage ? "<button type='button' class='party-mini-btn party-ai-control'></button>"
                        : "<span class='party-ai-status'></span>")
                        .text(m.ai.state === "error" && data.ai_manage ? "AI error · Retry"
                            : "AI · " + (data.ai_manage ? aiPaused ? "Resume" : "Pause" : m.ai.state))
                        .attr("title", m.ai.message || "Jev AI player")
                        .attr("aria-label", "P" + (m.slot + 1) + " AI: " + (m.ai.message || m.ai.state)
                            + (data.ai_manage ? aiPaused ? ". Resume AI" : ". Pause AI" : ""));
                    if (data.ai_manage)
                        $ai.on("click", function (ev) {
                            ev.stopPropagation();
                            comm.send_message("ai_control", { slot: m.slot, action: aiPaused ? "resume" : "pause" });
                        });
                    $actions.append($ai);
                    if (data.ai_manage && m.ai.prompt)
                        $actions.append($("<button type='button' class='party-mini-btn'>Cancel AI prompt</button>")
                            .on("click", function (ev) {
                                ev.stopPropagation();
                                comm.send_message("ai_control", { slot: m.slot, action: "cancel_prompt" });
                            }));
                }
                if (m.slot !== controlled_slot)
                    $actions.append(trade.button(m.slot));

                var $focusBtn = $("<button type='button' class='party-mini-btn party-camera-btn'>Center camera</button>")
                    .attr("data-tip-title", "Center Camera on " + m.name)
                    .attr("data-tip-body", "Pan the tactical dungeon viewport to " + m.name + "'s position.");
                $focusBtn.on("click", function (ev) {
                    ev.stopPropagation();
                    var latest = m;
                    var cur_state = window.crawl_party && window.crawl_party.state;
                    if (cur_state && cur_state.members)
                    {
                        for (var ci = 0; ci < cur_state.members.length; ++ci)
                        {
                            if (cur_state.members[ci].slot === m.slot)
                            {
                                latest = cur_state.members[ci];
                                break;
                            }
                        }
                    }
                    if (latest.on_same_level !== false && latest.pos)
                    {
                        dungeon_renderer.set_view_center(latest.pos.x, latest.pos.y);
                        minimap.update_overlay();
                    }
                });
                $actions.append($focusBtn);

                if (m.slot !== controlled_slot && m.alive && model.canControl(data, m.slot))
                {
                    var $ctrlBtn = $("<button type='button' class='party-mini-btn party-control-btn'>[Control]</button>")
                        .prop("disabled", client.is_watching() || !model.canControl(data, m.slot))
                        .attr("data-tip-title", "Switch Active Control to " + m.name)
                        .attr("data-tip-body", "Take direct keyboard and mouse control of P" + (m.slot + 1) + " (" + m.name + ").");
                    $ctrlBtn.on("click", function (ev) {
                        ev.stopPropagation();
                        comm.send_message("switch_player", { slot: m.slot });
                    });
                    $actions.append($ctrlBtn);
                }
                if (m.slot !== controlled_slot && ($effects.children().length || $passives))
                    $footer.append($("<div class='party-member-effects' role='group' aria-label='Effects and traits'></div>")
                        .append($effects, $passives));
                $footer.append($("<div class='party-card-toolbar'></div>").append($actions, cardStatus.activity(m, data)));
                $card.append($footer);

                $card.on("click", function (event) {
                    if ($(event.target).closest(".party-self-details").length) return;
                    open_party_inspector(m.slot, "overview");
                });

                $members.append($card);
            });

            icons.decorate($members[0]);
            var restoredCardControl = document.getElementById(focusedCardControl);
            if (restoredCardControl) restoredCardControl.focus({ preventScroll: true });
            minimap.fit_to($("#hud_minimap").width());
        }
        details.mount();
        initiative.update($members, data);
        navigation.update();

        chatContext.update(data);

        var dialog_el = document.getElementById("party_inspector_modal");
        if (dialog_el && dialog_el.open)
            render_party_inspector_modal();

        var dirty_locs = prev_member_positions.slice();
        var next_positions = [];
        for (var pi = 0; pi < data.members.length; ++pi)
        {
            var mp = data.members[pi].pos;
            if (mp && mp.x !== undefined && mp.y !== undefined)
            {
                var pos_copy = { x: mp.x, y: mp.y };
                dirty_locs.push(pos_copy);
                next_positions.push(pos_copy);
            }
        }
        prev_member_positions = next_positions;
        invalidate_locs(dirty_locs);
        display.display();
        minimap.update_overlay();
        $(document).trigger("party_state_rendered", [data]);
    }

    function handle_party_ping(data)
    {
        if (!data || data.x === undefined || data.y === undefined)
            return;
        window.crawl_party = window.crawl_party || { state: null, pings: [] };
        var state = window.crawl_party.state;
        if (state && state.multiplayer && (!state.floor || data.floor !== state.floor))
            return;
        window.crawl_party.open_inspector = open_party_inspector;
        var now = Date.now();
        window.crawl_party.pings.push({
            x: data.x,
            y: data.y,
            user: data.user || "Party",
            kind: data.kind || "look",
            created: now,
            expires: now + 4000
        });
        ensure_ping_timer();
        invalidate_locs([{ x: data.x, y: data.y }]);
        display.display();
        minimap.update_overlay();
    }

    return { state: handle_party_state, ping: handle_party_ping };
});
