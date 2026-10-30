/* Staging character controls and their authoritative room commands.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "comm", "client-staging-data", "character-guide", "client-staging-weapons", "character-builder", "party-composition", "client-staging-traits", "client-staging-modifiers", "party-lobby-tools"], function ($, comm, data, guide, weapons, builder, composition, traits, modifiers, lobbyTools) {
    return function create(api, state) {
        var send_message = comm.send_message;

        function init_party_staging_ui()
        {
            var $grid = $("#party_slots_grid");
            if ($grid.length === 0)
                return;
            $grid.empty();

            var defaultNames = ["Aldric", "Lyra", "Karn", "Vex"];
            var defaultSpecies = ["Minotaur", "Deep Elf", "Gargoyle", "Spriggan"];
            var defaultJobs = ["Fighter", "Conjurer", "Earth Elementalist", "Enchanter"];

            for (var s = 0; s < 4; s++)
            {
                var $box = $("<div class='party-slot-box party-slot-card slot-p" + s + "' data-slot='" + s + "'></div>");
                $box.append(builder.identity(s));

                var $modes = $("<div class='party-slot-modes'></div>");
                if (s === 0)
                {
                    $modes.append(
                        $("<span style='color: #8ae234; font-size: 10px; cursor: help;' tabindex='0'>[Party Leader / Host]</span>")
                            .attr("data-tip-title", "Party Leader / Host Slot (P1)")
                            .attr("data-tip-body", "Primary Expedition Leader slot. Controls Party Staging Room settings, Friendly Fire rules, and launching the party into Dungeon:1.")
                            .attr("data-tip-meta", "Slot P1: Always Active Party Host")
                    );
                }
                else
                {
                    var $btnComp = $("<button type='button' class='party-mode-btn' data-mode='companion'>Companion</button>")
                        .attr("data-tip-title", "Shared companion")
                        .attr("data-tip-body", "A manually controlled companion for solo party play. Choose AI player for automatic decisions.")
                        .attr("data-tip-meta", "Slot Mode: Shared Party Hero");
                    var $btnAI = $("<button type='button' class='party-mode-btn' data-mode='ai'>AI player</button>")
                        .attr("data-tip-title", "Jev AI player")
                        .attr("data-tip-body", "Jev chooses this hero's actions and prompt responses using personal sight and party context. Requires a server API key; model usage is billed by TypeSafe. Pause or resume from the hero card.");
                    var $btnOpen = $("<button type='button' class='party-mode-btn' data-mode='open'>Friend</button>")
                        .attr("data-tip-title", "Open for Friend — Human Co-op Slot")
                        .attr("data-tip-body", "Reserves this slot for a human co-op friend to claim in the Staging Room or drop in mid-expedition from the Live Expeditions table.")
                        .attr("data-tip-meta", "Slot Mode: Human Co-op Friend Slot");
                    var $btnClosed = $("<button type='button' class='party-mode-btn' data-mode='closed'>Closed</button>")
                        .attr("data-tip-title", "Closed Slot — Inactive")
                        .attr("data-tip-body", "Disables this slot so the expedition launches with fewer heroes (e.g., 1-player, 2-player, or 3-player custom party size).")
                        .attr("data-tip-meta", "Slot Mode: Closed Slot");
                    $modes.append($btnAI, $btnComp, $btnOpen, $btnClosed);
                }
                $box.append($modes);
                $box.append("<p class='party-slot-state-note'></p>");
                var $fields = $("<div class='party-character-fields'></div>");

                var $nameRow = $("<div class='party-field-row'></div>");
                $nameRow.addClass("party-name-row");
                $nameRow.append($("<label class='party-field-label'>Hero name</label>").attr("for", "party_slot_name_" + s));
                var $nameInput = $("<input type='text' class='party-slot-input party-slot-name text' maxlength='20'>")
                    .val(defaultNames[s])
                    .attr("data-slot", s).attr("id", "party_slot_name_" + s).attr("aria-label", "Hero " + (s + 1) + " name");
                $nameRow.append($nameInput);
                $fields.append($nameRow);

                var $spRow = $("<div class='party-field-row'></div>");
                $spRow.append($("<label class='party-field-label'>Species</label>").attr("for", "party_slot_species_" + s));
                var $spSelect = $("<select class='party-slot-select party-slot-species'></select>").attr("data-slot", s)
                    .attr("id", "party_slot_species_" + s).attr("aria-label", "Hero " + (s + 1) + " species");
                for (var i = 0; i < data.DCSS_SPECIES.length; i++)
                {
                    var sp = data.DCSS_SPECIES[i];
                    var $opt = $("<option></option>").val(sp).text(sp);
                    if (sp === defaultSpecies[s])
                        $opt.prop("selected", true);
                    $spSelect.append($opt);
                }
                $spRow.append($spSelect);
                $fields.append($spRow);

                var $jobRow = $("<div class='party-field-row'></div>");
                $jobRow.append($("<label class='party-field-label'>Background</label>").attr("for", "party_slot_job_" + s));
                var $jobSelect = $("<select class='party-slot-select party-slot-job'></select>").attr("data-slot", s)
                    .attr("id", "party_slot_job_" + s).attr("aria-label", "Hero " + (s + 1) + " background");
                for (var j = 0; j < data.DCSS_BACKGROUNDS.length; j++)
                {
                    var jb = data.DCSS_BACKGROUNDS[j];
                    var $jopt = $("<option></option>").val(jb).text(jb);
                    if (jb === defaultJobs[s])
                        $jopt.prop("selected", true);
                    $jobSelect.append($jopt);
                }
                $jobRow.append($jobSelect);
                $fields.append($jobRow);
                $fields.append(traits.create(s));
                $fields.append(weapons.create(s));
                $box.append($fields);

                var $archRow = $("<div class='party-archetype-row' role='group' aria-label='Quick builds'></div>");
                $box.append($archRow);

                var $bottom = $("<div class='party-slot-bottom'></div>");
                $bottom.append($("<span class='party-slot-combo-summary' style='color: #babdb6; font-size: 11px;'></span>")
                    .text(defaultSpecies[s] + " " + defaultJobs[s]));
                var $readyBtn = $("<button type='button' class='party-ready-badge party-slot-ready'>[READY]</button>")
                    .attr("data-slot", s)
                    .attr("data-tip-title", "Slot P" + (s + 1) + " Ready Status")
                    .attr("data-tip-body", "Click to toggle ready status for Slot P" + (s + 1) + " before launching the expedition into Dungeon:1.")
                    .attr("data-tip-meta", "Click to toggle [READY] / [WAITING]");
                $bottom.append($readyBtn);
                $box.append($bottom);

                $grid.append($box);
            }

            guide.init($grid[0]);
            $grid.find(".party-slot-box").each(function () { builder.refresh(this); });
            composition.init($grid[0]);
            lobbyTools.init();
            $(".party-campaign-options").remove();
            $(".party-setup-tools").append(modifiers.create(function (settings) {
                var room = api.find_my_party_room();
                if (room) send_message("party_room_settings", $.extend({ room_id: room.room_id }, settings));
            }));

            if ($("#party_seasonings_bar").length === 0)
            {
                var $sBar = $("<div id='party_seasonings_bar' class='party-seasonings-bar' role='group' aria-label='Broth Seasonings'></div>");
                $sBar.append("<span class='party-seasonings-label'>Pot Seasonings</span>");
                var seasoningsList = [
                    { id: "fast_boil", label: "Fast Boil", bonus: "+25% Score", tip: "Hellcrawl-inspired rapid delve: upstairs crumble behind the party and floor transitions accelerate." },
                    { id: "shared_ladle", label: "Shared Ladle", bonus: "+20% Score", tip: "Lifelink cauldron: lethal blows draw emergency vitality from the healthiest cook in the pot." },
                    { id: "heavy_pebbles", label: "Heavy Pebbles", bonus: "+15% Score", tip: "High-stakes loot race: relics, runes, and floor-firsts award double Chef's Citation points." }
                ];
                for (var sIdx = 0; sIdx < seasoningsList.length; sIdx++)
                {
                    var item = seasoningsList[sIdx];
                    var $chip = $("<button type='button' class='party-seasoning-chip' aria-pressed='false'></button>")
                        .attr("data-seasoning", item.id)
                        .attr("data-tip-title", item.label + " (" + item.bonus + ")")
                        .attr("data-tip-body", item.tip)
                        .attr("data-tip-meta", "Run Seasoning · Click to toggle for this pot");
                    $chip.append($("<span></span>").text(item.label));
                    $chip.append($("<small></small>").text(item.bonus));
                    $sBar.append($chip);
                }
                $(".party-setup-tools").append($sBar);

                $sBar.on("click", ".party-seasoning-chip", function (ev) {
                    ev.preventDefault();
                    var room = api.find_my_party_room();
                    if (!room) return;
                    var key = $(this).attr("data-seasoning");
                    var current = Array.isArray(room.seasonings) ? room.seasonings.slice() : [];
                    var pos = current.indexOf(key);
                    if (pos === -1) current.push(key);
                    else current.splice(pos, 1);
                    send_message("party_room_settings", {
                        room_id: room.room_id,
                        seasonings: current
                    });
                });
            }

            window.addEventListener("pebble-apply-daily", function (ev) {
                var daily = (ev && ev.detail) || window.__PEBBLE_PENDING_DAILY;
                if (!daily) return;
                var room = api.find_my_party_room();
                if (room)
                {
                    window.__PEBBLE_PENDING_DAILY = null;
                    send_message("party_room_settings", {
                        room_id: room.room_id,
                        name: "Soup of the Day: " + daily.name,
                        seed: daily.seed,
                        friendly_fire: daily.seasonings.indexOf("friendly_fire") !== -1,
                        seasonings: daily.seasonings.filter(function (s) { return s !== "friendly_fire"; })
                    });
                }
            });

            $grid.on("input", ".party-slot-name", function () {
                builder.refresh($(this).closest(".party-slot-box")[0]);
            });

            // Bind events on slot controls
            $grid.on("change blur", ".party-slot-name", function () {
                var slotIdx = parseInt($(this).attr("data-slot"), 10);
                send_slot_update(slotIdx, { hero_name: $(this).val() });
            });

            $grid.on("change", ".party-slot-species", function () {
                var slotIdx = parseInt($(this).attr("data-slot"), 10);
                var box = $(this).closest(".party-slot-box");
                var species = $(this).val();
                var job = data.defaultJob(species, box.find(".party-slot-job").val());
                box.find(".party-slot-job").val(job);
                builder.select(box[0], "species");
                builder.refresh(box[0]);
                guide.refresh($grid[0]);
                send_slot_update(slotIdx, { species: species, job: job });
            });

            $grid.on("change", ".party-slot-job", function () {
                var slotIdx = parseInt($(this).attr("data-slot"), 10);
                var box = $(this).closest(".party-slot-box")[0];
                builder.select(box, "job");
                builder.refresh(box);
                guide.refresh($grid[0]);
                send_slot_update(slotIdx, { job: $(this).val() });
            });

            $grid.on("change", ".party-slot-weapon", function () {
                var slotIdx = parseInt($(this).attr("data-slot"), 10);
                send_slot_update(slotIdx, { weapon: $(this).val() });
            });

            $grid.on("change", ".party-slot-trait", function () {
                var slotIdx = parseInt($(this).attr("data-slot"), 10);
                builder.refresh($(this).closest(".party-slot-box")[0]);
                send_slot_update(slotIdx, { trait: $(this).val() });
            });

            $grid.on("click", ".party-archetype-btn", function (ev) {
                ev.preventDefault();
                var slotIdx = parseInt($(this).attr("data-slot"), 10);
                var sp = $(this).attr("data-species");
                var jb = $(this).attr("data-job");
                if ($(this).attr("data-random") === "true") {
                    var build = data.randomBuild();
                    if (!build) return;
                    sp = build.species;
                    jb = build.job;
                }
                var $box = $grid.find(".party-slot-box[data-slot='" + slotIdx + "']");
                $box.find(".party-slot-species").val(sp);
                $box.find(".party-slot-job").val(jb);
                builder.refresh($box[0]);
                guide.refresh($grid[0]);
                send_slot_update(slotIdx, { species: sp, job: jb });
            });

            $grid.on("click", ".party-mode-btn", function (ev) {
                ev.preventDefault();
                var $box = $(this).closest(".party-slot-box");
                var slotIdx = parseInt($box.attr("data-slot"), 10);
                var mode = $(this).attr("data-mode");
                var room = api.find_my_party_room(), occupant = room && room.slots && room.slots[slotIdx];
                if (occupant && occupant.username && mode !== occupant.state
                    && !window.confirm("Release " + occupant.username + "'s seat and change its control?")) return;
                send_slot_update(slotIdx, { state: mode });
            });

            $grid.on("click", ".party-slot-ready", function (ev) {
                ev.preventDefault();
                var slotIdx = parseInt($(this).attr("data-slot"), 10);
                var room = api.find_my_party_room();
                if (!room || !room.slots || !room.slots[slotIdx])
                    return;
                var curReady = !!room.slots[slotIdx].ready;
                send_slot_update(slotIdx, { ready: !curReady });
            });

            $("#btn_create_party_room, #btn_create_party_room_empty").on("click", function (ev) {
                ev.preventDefault();
                var pendingDaily = window.__PEBBLE_PENDING_DAILY;
                var access = document.getElementById("lobby_creation_visibility");
                var visibility = access ? access.value : "public";
                window.__PEBBLE_PENDING_DAILY = null;
                if (pendingDaily)
                {
                    send_message("party_room_create", {
                        hero_name: state.current_user || "Aldric",
                        visibility: visibility,
                        name: "Soup of the Day: " + pendingDaily.name,
                        seed: pendingDaily.seed,
                        friendly_fire: pendingDaily.seasonings.indexOf("friendly_fire") !== -1,
                        seasonings: pendingDaily.seasonings.filter(function (s) { return s !== "friendly_fire"; })
                    });
                }
                else
                {
                    send_message("party_room_create", {
                        hero_name: state.current_user || "Aldric",
                        visibility: visibility,
                        friendly_fire: true
                    });
                }
            });

            $("#btn_toggle_party_ff").on("click", function (ev) {
                ev.preventDefault();
                var room = api.find_my_party_room();
                if (room)
                {
                    send_message("party_room_settings", {
                        room_id: room.room_id,
                        friendly_fire: !room.friendly_fire
                    });
                }
                else
                {
                    send_message("party_room_create", {
                        hero_name: state.current_user || "Aldric",
                        friendly_fire: false
                    });
                }
            });

            $("#party_rooms_tbody").on("click", ".btn-join-party-room", function (ev) {
                ev.preventDefault();
                var roomId = $(this).attr("data-room-id");
                var roomHost = $(this).attr("data-room-host");
                var roomStatus = $(this).attr("data-room-status");
                if (roomStatus === "launched" && roomHost)
                {
                    window.pending_auto_join_party = true;
                    state.current_hash = "#watch-" + roomHost;
                    location.hash = "#watch-" + roomHost;
                    send_message("watch", { username: roomHost });
                }
                else
                {
                    var seat = $(this).closest("tr").find(".party-room-seat").val();
                    var payload = { room_id: roomId };
                    if (seat !== undefined && seat !== null && seat !== "") payload.slot = Number(seat);
                    send_message("party_room_join", payload);
                }
            });

            $("#btn_leave_party_room").on("click", function (ev) {
                ev.preventDefault();
                var room = api.find_my_party_room();
                if (room && room.host === state.current_user && room.slots.some(function (slot) {
                    return slot.username && slot.username !== state.current_user;
                }) && !window.confirm("Close this party and release the other players' seats?")) return;
                send_message("party_room_leave", {
                    room_id: room ? room.room_id : state.current_party_room_id
                });
            });

            $("#btn_launch_party_room").on("click", function (ev) {
                ev.preventDefault();
                var room = api.find_my_party_room();
                if (!room)
                    return;
                var isHost = state.current_user && room.host && room.host.toLowerCase() === state.current_user.toLowerCase();
                if (!isHost)
                {
                    // Non-host toggles their slot's ready status
                    for (var i = 1; i < room.slots.length; i++)
                    {
                        if (room.slots[i].username && state.current_user &&
                            room.slots[i].username.toLowerCase() === state.current_user.toLowerCase())
                        {
                            send_slot_update(i, { ready: !room.slots[i].ready });
                            break;
                        }
                    }
                    return;
                }

                var collectedSlots = [];
                $("#party_slots_grid .party-slot-box").each(function () {
                    var idx = parseInt($(this).attr("data-slot"), 10);
                    var hname = ($(this).find(".party-slot-name").val() || "").trim();
                    var sp = $(this).find(".party-slot-species").val();
                    var jb = $(this).find(".party-slot-job").val();
                    collectedSlots.push({
                        slot: idx,
                        hero_name: hname,
                        species: sp,
                        job: jb,
                        weapon: $(this).find(".party-slot-weapon").val() || "",
                        trait: $(this).find(".party-slot-trait")[0].value || "none"
                    });
                });

                send_message("party_room_launch", {
                    room_id: room.room_id,
                    fresh: true,
                    slots: collectedSlots,
                    friendly_fire: room.friendly_fire
                });
            });
        }

        function send_slot_update(slotIdx, changes)
        {
            var room = api.find_my_party_room();
            var $box = $("#party_slots_grid .party-slot-box[data-slot='" + slotIdx + "']");
            var payload = $.extend({
                room_id: room ? room.room_id : state.current_party_room_id,
                slot: slotIdx,
                hero_name: ($box.find(".party-slot-name").val() || "").trim(),
                species: $box.find(".party-slot-species").val(),
                job: $box.find(".party-slot-job").val(),
                weapon: $box.find(".party-slot-weapon").val() || "",
                trait: $box.find(".party-slot-trait")[0].value || "none"
            }, changes || {});
            send_message("party_room_update_slot", payload);
        }

        return {
            init_party_staging_ui: init_party_staging_ui,
            send_slot_update: send_slot_update
        };
    };
});
