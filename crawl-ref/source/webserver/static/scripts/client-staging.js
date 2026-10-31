/* Authoritative staging-room rendering and co-op join lifecycle.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "comm", "character-guide", "client-staging-weapons", "character-builder", "client-staging-modifiers", "party-room-list", "party-lobby-tools"], function ($, comm, guide, weapons, builder, modifiers, rooms, lobbyTools) {
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
                lobbyTools.render(myRoom, state.current_user);
                $("#party_slots_grid").attr("data-saved-expedition", String(!!myRoom.resume_id));
                var ffOn = myRoom.friendly_fire !== false;
                // A saved expedition keeps its campaign rules; only a fresh party's host edits them.
                modifiers.render(myRoom, isHost && !myRoom.resume_id);
                $("#btn_toggle_party_ff")
                    .text(ffOn ? "Friendly fire on" : "Friendly fire off")
                    .attr("aria-pressed", String(ffOn))
                    .prop("disabled", !isHost || !!myRoom.resume_id);

                $("#party_room_title_text").text(myRoom.name || (myRoom.host + "'s Expedition"));
                var seedNote = myRoom.seed ? (" · Seed #" + myRoom.seed) : "";
                $("#party_room_host_text").text("Host: " + myRoom.host + seedNote);
                $("#party_room_ff_badge")
                    .text(ffOn ? "On" : "Off")
                    .toggleClass("is-on", ffOn);
                $("#party_room_view").toggleClass("is-host", !!isHost).toggleClass("is-guest", !isHost);

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
                    $box.attr("data-multiplayer", String(multiplayer));
                    $box.attr("data-starting-modifiers", (myRoom.seasonings || []).slice().sort().join(","));
                    $box.removeClass("slot-state-player slot-state-companion slot-state-ai slot-state-open slot-state-closed")
                        .addClass("slot-state-" + (slotData.state || "open"));
                    var controlsSeat = isHost || (slotData.username || "").toLowerCase() === (state.current_user || "").toLowerCase();
                    var canEdit = controlsSeat && !myRoom.resume_id;
                    $box.attr({ "data-seat-state": slotData.state || "open", "data-seat-owner": slotData.username || "",
                        "data-seat-active": String(launchSlots.includes(s)), "data-seat-ready": String(slotData.ready !== false),
                        "data-seat-editable": String(canEdit), "data-seat-host": String(isHost),
                        "data-saved-stats": JSON.stringify(slotData.saved_stats || {}) });

                    var me = state.current_user.toLowerCase();
                    var owner = (slotData.username || (s === 0 ? myRoom.host : "") || "").toLowerCase();
                    var occText = "Waiting for a friend", seatKind = "open";
                    if (s === 0)
                    {
                        seatKind = owner === me ? "you" : "host";
                        occText = owner === me ? "You · Host" : "Hosted by " + (slotData.username || myRoom.host);
                    }
                    else if (slotData.state === "player" && slotData.username)
                    {
                        seatKind = owner === me ? "you" : "friend";
                        occText = owner === me ? "You" : "Played by " + slotData.username;
                    }
                    else if (slotData.state === "ai")
                    {
                        seatKind = "ai";
                        occText = "Jev AI · Chooses actions and prompt answers";
                    }
                    else if (slotData.state === "companion")
                    {
                        seatKind = "companion";
                        occText = multiplayer ? "Companion · Excluded from multiplayer"
                            : "Companion · A friend can claim this seat";
                    }
                    else if (slotData.state === "closed")
                    {
                        seatKind = "closed";
                        occText = "Not joining this expedition";
                    }
                    $box.attr("data-seat-kind", seatKind).attr("data-seat-owner", slotData.username || "");
                    $box.find(".party-slot-occupant").text(occText);

                    $box.find(".party-mode-btn").each(function () {
                        var btnMode = $(this).attr("data-mode");
                        var isActive = (slotData.state === btnMode) ||
                                       (slotData.state === "player" && btnMode === "open");
                        $(this).toggleClass("active", isActive);
                        $(this).attr("aria-pressed", String(isActive));
                    });

                    var $nameInput = $box.find(".party-slot-name");
                    if ((!canEdit || document.activeElement !== $nameInput[0]) && slotData.hero_name)
                        $nameInput.val(slotData.hero_name);

                    var $spSelect = $box.find(".party-slot-species");
                    if ((!canEdit || document.activeElement !== $spSelect[0]) && slotData.species)
                        $spSelect.val(builder.speciesName(slotData.species));

                    var $jobSelect = $box.find(".party-slot-job");
                    if ((!canEdit || document.activeElement !== $jobSelect[0]) && slotData.job)
                        $jobSelect.val(slotData.job);

                    var $traitSelect = $box.find(".party-slot-trait");
                    if (!canEdit || document.activeElement !== $traitSelect[0])
                        $traitSelect.val(slotData.trait || "none");

                    weapons.render($box, slotData);
                    $box.find(".party-slot-name, .party-slot-species, .party-slot-job, .party-slot-trait").prop("disabled", !canEdit);
                    if (!canEdit) $box.find(".party-slot-weapon").prop("disabled", true);
                    $box.find(".party-mode-btn").prop("disabled", !isHost || !!myRoom.resume_id);

                    $box.find(".party-slot-combo-summary").text(
                        builder.speciesName(slotData.species || "Minotaur") + " " + (slotData.job || "Fighter")
                    );

                    var $readyBadge = $box.find(".party-slot-ready");
                    $readyBadge.removeClass("waiting closed");
                    var inactive = !launchSlots.includes(s);
                    $readyBadge.prop("disabled", inactive || !controlsSeat).attr("aria-pressed", String(!inactive && slotData.ready !== false));
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
                    if (!myRoom.resume_id) builder.refresh($box[0]);
                    $box.find(".party-archetype-btn").prop("disabled", !canEdit);
                }

                $("#party_room_hero_count").text(activeCount + (activeCount === 1 ? " hero" : " heroes")
                    + (openCount ? " · " + openCount + (openCount === 1 ? " open seat" : " open seats") : ""));
                if (isHost)
                {
                    $("#btn_launch_party_room")
                        .text((myRoom.resume_id ? "Resume saved expedition" : "Begin expedition") + " · " + activeCount + (activeCount === 1 ? " hero" : " heroes"))
                        .removeClass("dcss-btn-gold")
                        .addClass("dcss-btn-primary");
                    $("#party_room_status_hint").text(waitingCount
                        ? waitingCount + (waitingCount === 1 ? " hero is" : " heroes are") + " not ready. Check with your party before beginning."
                        : activeCount + (activeCount === 1 ? " hero ready" : " heroes ready") + (openCount ? " · " + openCount + (openCount === 1 ? " seat open for a friend." : " seats open for friends.") : " · Ready to descend."));
                }
                else
                {
                    $("#btn_launch_party_room")
                        .text("Toggle ready")
                        .removeClass("dcss-btn-primary")
                        .addClass("dcss-btn-gold");
                    $("#party_room_status_hint").text("Waiting for the host (" + myRoom.host + ") to begin the expedition.");
                }
            }
            else
            {
                lobbyTools.render(null, state.current_user);
                state.current_party_room_id = null;
                $("#party_slots_grid .party-slot-box").each(function () { builder.context(this, ""); });
                $("#party_room_view").hide();
                $("#party_rooms_list_view").show();
                $("#btn_create_party_room").show();
                $("#btn_toggle_party_ff").text("Friendly fire on").attr("aria-pressed", "true").prop("disabled", false);

                rooms.render(state.party_rooms);
                // The home screen's friend cards read each room's seed from its row.
                (state.party_rooms || []).forEach(function (rm) {
                    $("#party_rooms_tbody .btn-join-party-room[data-room-id='" + rm.room_id + "']").closest("tr")
                        .attr("data-room-seed", rm.seed || rm.starting_seed || "");
                });
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
