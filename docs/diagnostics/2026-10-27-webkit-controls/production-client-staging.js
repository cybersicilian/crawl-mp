/* Authoritative staging-room rendering and co-op join lifecycle.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "comm", "character-guide", "client-staging-weapons", "character-builder"], function ($, comm, guide, weapons, builder) {
    return function create(api, state) {
        var send_message = comm.send_message;

        function find_my_party_room()
        {
            if (!state.current_user)
                return null;
            var u = state.current_user.toLowerCase();
            for (var i = 0; i < state.party_rooms.length; i++)
            {
                var r = state.party_rooms[i];
                if (r.host && r.host.toLowerCase() === u)
                    return r;
                var slots = r.slots || [];
                for (var j = 0; j < slots.length; j++)
                {
                    if (slots[j].username && slots[j].username.toLowerCase() === u)
                        return r;
                }
            }
            return null;
        }

        function render_party_lobby()
        {
            if (!state.current_user)
            {
                $("#party_lobby_panel").hide();
                return;
            }
            $("#party_lobby_panel").show();

            var myRoom = find_my_party_room();
            if (myRoom)
            {
                state.current_party_room_id = myRoom.room_id;
                $("#party_rooms_list_view").hide();
                $("#party_room_view").show();
                $("#btn_create_party_room").hide();

                var isHost = myRoom.host && myRoom.host.toLowerCase() === state.current_user.toLowerCase();
                var ffOn = myRoom.friendly_fire !== false;
                var roomSeasonings = Array.isArray(myRoom.seasonings) ? myRoom.seasonings : [];
                $("#btn_toggle_party_ff")
                    .text(ffOn ? "[FF: Spicy (ON)]" : "[FF: Mild (OFF)]")
                    .prop("disabled", !isHost);

                $("#party_room_title_text").text(myRoom.name || (myRoom.host + "'s Expedition"));
                var seedNote = myRoom.seed ? (" · Seed #" + myRoom.seed) : "";
                $("#party_room_host_text").text("Head cook: " + myRoom.host + seedNote);
                $("#party_room_ff_badge")
                    .text(ffOn ? "[SPICY POT · FF ON]" : "[MILD POT · FF OFF]")
                    .css("color", ffOn ? "#ef2929" : "#8ae234");

                $("#party_seasonings_bar .party-seasoning-chip").each(function () {
                    var key = $(this).attr("data-seasoning");
                    var on = roomSeasonings.indexOf(key) !== -1;
                    $(this).attr("aria-pressed", String(on)).prop("disabled", !isHost);
                });

                var slots = myRoom.slots || [];
                var multiplayer = myRoom.multiplayer === true;
                var launchSlots = myRoom.launch_slots || [0];
                var activeCount = 0, waitingCount = 0, openCount = 0;
                for (var s = 0; s < 4; s++)
                {
                    var slotData = slots[s] || {
                        slot: s,
                        state: s === 0 ? "player" : "open",
                        username: "",
                        hero_name: "Hero" + (s + 1),
                        species: "Minotaur",
                        job: "Fighter",
                        ready: true
                    };
                    if (launchSlots.includes(s))
                    {
                        activeCount++;
                        if (slotData.ready === false) waitingCount++;
                    }
                    else if (slotData.state === "open") openCount++;

                    var $box = $("#party_slots_grid .party-slot-box[data-slot='" + s + "']");
                    builder.context($box[0], JSON.stringify([myRoom.room_id, state.current_user, slotData.username || ""]));
                    $box.attr("data-starting-seed", String(slotData.starting_seed || ""));
                    $box.attr("data-game-id", myRoom.game_id || "coop-2p-web-trunk");
                    $box.attr("data-starting-modifiers", (myRoom.seasonings || []).slice().sort().join(","));
                    $box.removeClass("slot-state-player slot-state-companion slot-state-open slot-state-closed")
                        .addClass("slot-state-" + (slotData.state || "open"));

                    var occText = "Waiting for a friend";
                    var occColor = "#888a85";
                    if (s === 0)
                    {
                        occText = "Hosted by " + (slotData.username || myRoom.host);
                        occColor = "#fce94f";
                    }
                    else if (slotData.state === "player" && slotData.username)
                    {
                        occText = "Played by " + slotData.username;
                        occColor = "#8ae234";
                    }
                    else if (slotData.state === "companion")
                    {
                        occText = multiplayer ? "Solo companion · Excluded from multiplayer"
                            : "Solo companion · A friend can claim this seat";
                        occColor = "#34e2e2";
                    }
                    else if (slotData.state === "closed")
                    {
                        occText = "Not joining this expedition";
                        occColor = "#555555";
                    }
                    $box.find(".party-slot-occupant").text(occText).css("color", occColor);

                    $box.find(".party-mode-btn").each(function () {
                        var btnMode = $(this).attr("data-mode");
                        var isActive = (slotData.state === btnMode) ||
                                       (slotData.state === "player" && btnMode === "open");
                        $(this).toggleClass("active", isActive);
                        $(this).attr("aria-pressed", String(isActive));
                    });

                    var $nameInput = $box.find(".party-slot-name");
                    if (document.activeElement !== $nameInput[0] && slotData.hero_name)
                        $nameInput.val(slotData.hero_name);

                    var $spSelect = $box.find(".party-slot-species");
                    if (document.activeElement !== $spSelect[0] && slotData.species)
                        $spSelect.val(builder.speciesName(slotData.species));

                    var $jobSelect = $box.find(".party-slot-job");
                    if (document.activeElement !== $jobSelect[0] && slotData.job)
                        $jobSelect.val(slotData.job);

                    weapons.render($box, slotData);

                    $box.find(".party-slot-combo-summary").text(
                        builder.speciesName(slotData.species || "Minotaur") + " " + (slotData.job || "Fighter")
                    );

                    var $readyBadge = $box.find(".party-slot-ready");
                    $readyBadge.removeClass("waiting closed");
                    var inactive = !launchSlots.includes(s);
                    $readyBadge.prop("disabled", inactive).attr("aria-pressed", String(!inactive && slotData.ready !== false));
                    $readyBadge.attr("aria-label", "Hero " + (s + 1) + (inactive ? " is not active" : slotData.ready !== false ? " ready; mark as waiting" : " waiting; mark as ready"));
                    if (inactive && slotData.state !== "open")
                    {
                        $readyBadge.addClass("closed").text("Inactive");
                    }
                    else if (slotData.state === "open" && s > 0)
                    {
                        $readyBadge.addClass("waiting").text("Open seat");
                    }
                    else if (slotData.ready !== false)
                    {
                        $readyBadge.text("Ready");
                    }
                    else
                    {
                        $readyBadge.addClass("waiting").text("Waiting");
                    }
                    builder.refresh($box[0]);
                }

                if (isHost)
                {
                    $("#btn_launch_party_room")
                        .text("Begin expedition · " + activeCount + (activeCount === 1 ? " hero" : " heroes"))
                        .removeClass("dcss-btn-gold")
                        .addClass("dcss-btn-primary");
                    $("#party_room_status_hint").text(waitingCount
                        ? waitingCount + (waitingCount === 1 ? " hero is" : " heroes are") + " not ready. Check with your party before beginning."
                        : activeCount + (activeCount === 1 ? " hero ready" : " heroes ready") + (openCount ? " · " + openCount + (openCount === 1 ? " seat open for a friend." : " seats open for friends.") : " · Your party is ready to descend."));
                }
                else
                {
                    $("#btn_launch_party_room")
                        .text("Toggle ready")
                        .removeClass("dcss-btn-primary")
                        .addClass("dcss-btn-gold");
                    $("#party_room_status_hint").text("Waiting for Host (" + myRoom.host + ") to launch the expedition...");
                }
            }
            else
            {
                state.current_party_room_id = null;
                $("#party_slots_grid .party-slot-box").each(function () { builder.context(this, ""); });
                $("#party_room_view").hide();
                $("#party_rooms_list_view").show();
                $("#btn_create_party_room").show();
                $("#btn_toggle_party_ff").text("[FF: Classic | Safe]").prop("disabled", false);

                var $tbody = $("#party_rooms_tbody");
                $tbody.empty();

                if (!state.party_rooms || state.party_rooms.length === 0)
                {
                    $("#party_rooms_empty").show();
                    $("#party_rooms_table").hide();
                }
                else
                {
                    $("#party_rooms_empty").hide();
                    $("#party_rooms_table").show();

                    for (var rIdx = 0; rIdx < state.party_rooms.length; rIdx++)
                    {
                        var rm = state.party_rooms[rIdx];
                        var rSlots = rm.slots || [];
                        var rActive = 0;
                        var rosterParts = [];
                        for (var k = 0; k < rSlots.length; k++)
                        {
                            var st = rSlots[k];
                            if ((rm.launch_slots || [0]).includes(k))
                            {
                                rActive++;
                                var tag = (st.state === "player" && st.username) ? st.username : "Companion";
                                rosterParts.push("P" + (k + 1) + " " + st.hero_name + " (" + st.species + " " + st.job + " - " + tag + ")");
                            }
                        }

                        var $tr = $("<tr></tr>");
                        $tr.append($("<td style='color: #fce94f; font-weight: bold;'></td>").text(rm.name || (rm.host + "'s Room")));
                        $tr.append($("<td></td>").text(rm.host));
                        $tr.append($("<td style='color: #8ae234;'></td>").text(rActive + "/4 Active"));
                        $tr.append($("<td style='font-size: 12px;'></td>").text(rosterParts.join(" | ")));
                        $tr.append($("<td></td>").html(
                            rm.friendly_fire !== false
                                ? "<span style='color:#ef2929;'>Friendly fire on</span>"
                                : "<span style='color:#8ae234;'>Friendly fire off</span>"
                        ));

                        var btnLabel = (rm.status === "launched") ? "Join live expedition" : "Join party";
                        var $joinBtn = $("<button type='button' class='dcss-btn dcss-btn-primary btn-join-party-room'></button>")
                            .attr("data-room-id", rm.room_id)
                            .attr("data-room-host", rm.host)
                            .attr("data-room-status", rm.status || "staging")
                            .attr("data-tip-title", btnLabel + " — " + (rm.name || (rm.host + "'s Room")))
                            .attr("data-tip-body", "Host: " + rm.host + " | Roster: " + (rosterParts.join(" | ") || "Open") + " | Friendly Fire: " + (rm.friendly_fire !== false ? "Classic (ON)" : "Safe Shoot-Through (OFF)"))
                            .attr("data-tip-meta", rm.status === "launched" ? "Click to drop directly into D:1 co-op session" : "Click to claim an open party slot in Staging")
                            .text(btnLabel);
                        $tr.append($("<td></td>").append($joinBtn));
                        $tbody.append($tr);
                    }
                }
            }
        }

        function handle_party_rooms_list(data)
        {
            state.party_rooms = (data && data.rooms) ? data.rooms : [];
            render_party_lobby();
            guide.refresh();
            api.render_coop_chronicle();
        }

        function handle_party_room_launched(data)
        {
            if (!data || !data.host)
                return;
            if (state.current_user && data.host.toLowerCase() === state.current_user.toLowerCase())
                return;
            var targetSlot = (data.slot !== undefined) ? data.slot : 1;
            window.pending_auto_join_party = true;
            window.pending_auto_join_slot = targetSlot;
            if (state.watching && state.watching_username && state.watching_username.toLowerCase() === data.host.toLowerCase())
            {
                if (!state.party_member_active)
                {
                    send_message("join_party", { slot: targetSlot });
                }
                return;
            }
            state.current_hash = "#watch-" + data.host;
            location.hash = "#watch-" + data.host;
            send_message("watch", { username: data.host });
        }

        return {
            find_my_party_room: find_my_party_room,
            render_party_lobby: render_party_lobby,
            handle_party_rooms_list: handle_party_rooms_list,
            handle_party_room_launched: handle_party_room_launched
        };
    };
});
