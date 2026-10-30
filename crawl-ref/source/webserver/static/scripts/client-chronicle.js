/* Recorded party compositions, ghosts and discoveries.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "comm", "item-display"], function ($, comm, itemDisplay) {
    return function create(api, state) {
        var send_message = comm.send_message;

        var chronicle_state = { ghosts: [], party_comps: [], cool_items: [] };

        function format_chronicle_category(rawCat)
        {
            var lower = String(rawCat || "relic").toLowerCase();
            if (lower.indexOf("unrand") !== -1)
                return "Unrandart";
            if (lower.indexOf("rune") !== -1)
                return "Rune of Zot";
            if (lower.indexOf("randart") !== -1 || lower.indexOf("artefact") !== -1 || lower.indexOf("artifact") !== -1)
                return "Randart";
            if (lower.indexOf("manual") !== -1)
                return "Manual";
            var s = String(rawCat || "Relic");
            return s.charAt(0).toUpperCase() + s.slice(1);
        }

        function render_coop_chronicle()
        {
            var $panel = $("#coop_chronicle_panel");
            if (!$panel.length)
                return;
            if (!state.current_user)
            {
                $panel.hide();
                return;
            }
            $panel.show();

            var comps = chronicle_state.party_comps || [];
            var ghosts = chronicle_state.ghosts || [];
            var items = chronicle_state.cool_items || [];

            $("#chronicle_comps_count").text(String(comps.length)).attr("aria-label", comps.length + " recorded");
            $("#chronicle_ghosts_count").text(String(ghosts.length)).attr("aria-label", ghosts.length + " recorded");
            $("#chronicle_items_count").text(String(items.length)).attr("aria-label", items.length + " recorded");

            var seasoningLabels = {
                fast_boil: "Fast Boil",
                shared_ladle: "Shared Ladle",
                heavy_pebbles: "Heavy Pebbles"
            };
            var $compsList = $("#chronicle_comps_list").empty();
            if (comps.length === 0)
            {
                $compsList.append($("<div class='chronicle-entry-sub'>No party recipes recorded yet. Simmer an expedition above!</div>"));
            }
            else
            {
                for (var i = 0; i < comps.length; i++)
                {
                    var c = comps[i];
                    var membersStr = "";
                    var leadCook = "Chef";
                    if (c.members && c.members.length)
                    {
                        var parts = [];
                        for (var mIdx = 0; mIdx < c.members.length; mIdx++)
                        {
                            var m = c.members[mIdx];
                            var mName = m.name || m.hero_name || "Hero";
                            if (mIdx === 0) leadCook = mName;
                            parts.push(mName + " (" + (m.species || "?") + " " + (m.job || "?") + ")");
                        }
                        membersStr = parts.join(" + ");
                    }
                    else
                    {
                        membersStr = c.party_spec || "Custom Party";
                    }
                    var ffDesc = c.friendly_fire ? "Spicy Friendly Fire (ON)" : "Mild Safe Pot (OFF)";
                    var seedStr = c.seed ? String(c.seed) : "House Kettle Seed";
                    var compTitle = c.comp_name || "Expedition";
                    var seasonings = Array.isArray(c.seasonings) ? c.seasonings : [];
                    var depthNum = parseInt(String(c.deepest_place || "D:1").replace(/\D+/g, ""), 10) || 1;
                    var mult = 1 + (c.friendly_fire ? 0.15 : 0) + (seasonings.length * 0.2);
                    var brothScore = c.broth_score || Math.round((depthNum * 240 + (c.player_count || 1) * 110) * mult);
                    var mvpLabel = c.mvp_citation || ("Head Butcher: " + leadCook);
                    var compTipBody = "Party Roster: " + membersStr +
                        " | Broth Score: " + brothScore +
                        " | Seed: " + seedStr +
                        " | Friendly Fire: " + ffDesc +
                        " | Deepest Floor: " + (c.deepest_place || "D:1") + ".";
                    var compTipMeta = "Use build to start a fresh pot with this recipe and seasonings";

                    var $row = $("<div class='chronicle-entry' tabindex='0'></div>")
                        .attr("data-tip-title", "Recorded Recipe: " + compTitle)
                        .attr("data-tip-body", compTipBody)
                        .attr("data-tip-meta", compTipMeta);
                    var $main = $("<div class='chronicle-entry-main'></div>");
                    var $titleRow = $("<div class='chronicle-entry-title'></div>").text(compTitle);
                    var $badges = $("<div class='chronicle-entry-badges'></div>");
                    $badges.append($("<span class='chronicle-score-pill tr-badge'></span>").text("Broth score " + brothScore));
                    $badges.append($("<span class='chronicle-mvp-badge tr-badge'></span>").text("★ " + mvpLabel));
                    for (var sIdx = 0; sIdx < seasonings.length; sIdx++)
                    {
                        var sKey = seasonings[sIdx];
                        $badges.append($("<span class='chronicle-seasoning-tag tr-badge'></span>").text(seasoningLabels[sKey] || sKey));
                    }
                    $main.append($titleRow);
                    var $roster = $("<ul class='chronicle-roster' aria-label='Party roster'></ul>");
                    if (c.members && c.members.length)
                    {
                        for (var rIdx = 0; rIdx < c.members.length; rIdx++)
                        {
                            var member = c.members[rIdx];
                            $roster.append($("<li class='chronicle-hero'></li>")
                                .attr({ "data-hero-job": member.job || "", "data-hero-species": member.species || "", "data-hero-slot": String(rIdx) })
                                .append($("<span class='chronicle-hero-name'></span>").text(member.name || member.hero_name || "Hero"),
                                    $("<span class='chronicle-hero-meta'></span>").text(((member.species || "?") + " " + (member.job || "?")).trim())));
                        }
                        $main.append($roster);
                    }
                    else
                        $main.append($("<div class='chronicle-entry-sub'></div>").text(membersStr));
                    $main.append($badges);
                    $main.append($("<div class='chronicle-entry-meta'></div>").text((c.player_count || 2) + " heroes · " +
                        (c.friendly_fire ? "Friendly fire on" : "Friendly fire off") +
                        (c.seed ? (" · Seed #" + c.seed) : "") +
                        " · Reached " + (c.deepest_place || "D:1")));
                    var $loadBtn = $("<button type='button' class='dcss-btn dcss-btn-primary tr-btn btn-load-chronicle-comp'>Use build</button>")
                        .attr("data-comp-idx", i)
                        .attr("data-tip-title", "Load Party Recipe: " + (c.comp_name || "Expedition"))
                        .attr("data-tip-body", compTipBody)
                        .attr("data-tip-meta", compTipMeta);
                    $row.append($main).append($loadBtn);
                    $compsList.append($row);
                }
            }

            var $ghostsList = $("#chronicle_ghosts_list").empty();
            if (ghosts.length === 0)
            {
                $ghostsList.append($("<div class='chronicle-entry-sub'>No fallen ghosts yet. All fallen heroes are stored in DCSS bones &amp; here.</div>"));
            }
            else
            {
                for (var gIdx = 0; gIdx < ghosts.length; gIdx++)
                {
                    var g = ghosts[gIdx];
                    var gTitle = (g.hero_name || "Ghost") + " — XL" + (g.xl || 1) + " " + (g.species || "") + " " + (g.job || "");
                    var killerRaw = g.killer || "slain in the dungeon";
                    var killerFormatted = killerRaw.toLowerCase().indexOf("slain") === 0 ? killerRaw : ("Slain by " + killerRaw);
                    var gFloor = g.place || "D:1";
                    var gAc = (g.ac !== undefined && g.ac !== null) ? g.ac : 0;
                    var gEv = (g.ev !== undefined && g.ev !== null) ? g.ev : 0;
                    var gSh = (g.sh !== undefined && g.sh !== null) ? g.sh : 0;
                    var gWeapon = g.weapon || "unarmed";
                    var gTipBody = killerFormatted + " on Floor " + gFloor +
                        " | AC/EV/SH: " + gAc + " / " + gEv + " / " + gSh +
                        " | Weapon: " + gWeapon +
                        ". DCSS saves fallen heroes into persistent bones.* files, spawning this player ghost as a hostile boss encounter on " + gFloor + " in future runs.";
                    var gTipMeta = "DCSS bones." + gFloor.replace(":", "") + " | Floor: " + gFloor + " | AC/EV/SH: " + gAc + "/" + gEv + "/" + gSh;

                    var $gRow = $("<div class='chronicle-entry' tabindex='0'></div>")
                        .attr("data-tip-title", "Player Ghost (Bones): " + gTitle)
                        .attr("data-tip-body", gTipBody)
                        .attr("data-tip-meta", gTipMeta);
                    var $gMain = $("<div class='chronicle-entry-main'></div>");
                    $gMain.append($("<div class='chronicle-entry-title chronicle-ghost-title'></div>").text(gTitle));
                    $gMain.append($("<div class='chronicle-entry-sub'></div>").text(killerFormatted + " on " + gFloor));
                    $gMain.append($("<div class='chronicle-entry-meta'></div>").text("AC " + gAc + " · EV " + gEv + " · SH " + gSh + " · " + gWeapon));
                    var $gBadge = $("<span class='chronicle-kind-badge tr-badge' data-kind='ghost'>Ghost</span>")
                        .attr("title", "Stored in bones files; may return as a hostile ghost on " + gFloor);
                    $gRow.attr("data-hero-job", g.job || "").append($gMain).append($gBadge);
                    $ghostsList.append($gRow);
                }
            }

            var $itemsList = $("#chronicle_items_list").empty();
            if (items.length === 0)
            {
                $itemsList.append($("<div class='chronicle-entry-sub'>No artefacts, runes, or ego relics logged yet.</div>"));
            }
            else
            {
                for (var itIdx = 0; itIdx < items.length; itIdx++)
                {
                    var it = items[itIdx];
                    var catUpper = String(it.category || "relic").toUpperCase();
                    var catLabel = format_chronicle_category(it.category);
                    var finderHero = (it.finder_name || "Party") +
                        ((it.finder_species || it.finder_job) ? (" (" + ((it.finder_species || "") + " " + (it.finder_job || "")).trim() + ")") : "");
                    var discFloor = it.place || "D:1";
                    var itTipBody = "Category: " + catLabel +
                        " | Finder Hero: " + finderHero +
                        " | Discovery Floor: " + discFloor +
                        (it.description ? (" — " + it.description) : ". Logged permanently in the Dungeon Chronicle Vault.");
                    var itTipMeta = "Category: " + catLabel + " | Finder: " + (it.finder_name || "Party") + " | Floor: " + discFloor;

                    var $itRow = $("<div class='chronicle-entry' tabindex='0'></div>")
                        .attr("data-tip-title", (it.item_name || "Unknown Relic") + " [" + catLabel + "]")
                        .attr("data-tip-body", itTipBody)
                        .attr("data-tip-meta", itTipMeta);
                    var $itMain = $("<div class='chronicle-entry-main'></div>");
                    $itMain.append($("<div class='chronicle-entry-title chronicle-relic-title'></div>").text(it.item_name || "Unknown Relic"));
                    $itMain.append($("<div class='chronicle-entry-sub'></div>").text(
                        "Found by " + (it.finder_name || "Party") + " (" + ((it.finder_species || "") + " " + (it.finder_job || "")).trim() + ") on " + discFloor
                    ));
                    var $catBadge = $("<span class='chronicle-kind-badge tr-badge'></span>")
                        .attr("data-kind", catUpper.toLowerCase().replace(/[^a-z]+/g, "-")).text(catLabel);
                    $itRow.append($itMain).append($catBadge);
                    $itemsList.append($itRow);
                }
            }
            itemDisplay.decorate($itemsList[0], ".chronicle-entry-title");
        }

        function handle_coop_chronicle(data)
        {
            if (!data)
                return;
            chronicle_state.ghosts = data.ghosts || [];
            chronicle_state.party_comps = data.party_comps || [];
            chronicle_state.cool_items = data.cool_items || [];
            render_coop_chronicle();
        }

        function bind_chronicle_events()
        {
            var panel = document.getElementById("coop_chronicle_panel");
            if (!panel || panel.dataset.chronicleBound) return;
            panel.dataset.chronicleBound = "true";
            panel.addEventListener("click", function (ev) {
                if (!ev.target.closest("#btn_refresh_chronicle")) return;
                ev.preventDefault();
                send_message("chronicle_fetch", {});
            });

            panel.addEventListener("click", function (ev) {
                var button = ev.target.closest(".btn-load-chronicle-comp");
                if (!button) return;
                ev.preventDefault();
                var idx = parseInt(button.getAttribute("data-comp-idx"), 10);
                var comps = chronicle_state.party_comps || [];
                if (!isNaN(idx) && comps[idx])
                {
                    var c = comps[idx];
                    send_message("party_room_apply_comp", {
                        comp_name: c.comp_name || "Expedition",
                        friendly_fire: !!c.friendly_fire,
                        seasonings: c.seasonings || [],
                        seed: c.seed || "",
                        party_spec: c.party_spec || "",
                        members: c.members || []
                    });
                }
            });
        }

        return {
            format_chronicle_category: format_chronicle_category,
            render_coop_chronicle: render_coop_chronicle,
            handle_coop_chronicle: handle_coop_chronicle,
            bind_chronicle_events: bind_chronicle_events
        };
    };
});
