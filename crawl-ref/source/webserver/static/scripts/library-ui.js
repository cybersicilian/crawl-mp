define(["jquery", "comm", "expedition-url"], function ($, comm, expeditionURL) {
    "use strict";
    var accountId = null, identity = null, saving = false, ready = false, noticeTimer;
    var libraryQuery = "", libraryMode = "", libraryParty = "";
    var deleting = null;
    var modeNames = { "dcss-web-trunk": "Classic solo", "seeded-web-trunk": "Seeded run", "descent-web-trunk": "Descent",
        "tut-web-trunk": "Tutorial", "sprint-web-trunk": "Dungeon Sprint", coop: "Co-op party" };

    function deletionControls() {
        document.querySelectorAll("[data-library-delete]").forEach(function (button) {
            button.disabled = !!deleting || button.getAttribute("data-deletable") === "false";
            button.textContent = button.getAttribute("data-library-delete") === deleting ? "Deleting…" : "Delete save";
        });
    }
    function modeLabel(mode) {
        var party = /^coop-(\d)p/.exec(mode || "");
        if (party) return party[1] + "-hero party";
        return modeNames[mode] || (mode ? String(mode).replace(/-web-trunk$/, "") : "Expedition");
    }
    function partyLabel(size) { return size + (size === 1 ? " hero" : " heroes"); }
    function filtering() { return !!(libraryQuery.trim() || libraryMode || libraryParty); }

    function filterGames() {
        var query = libraryQuery.trim().toLocaleLowerCase(), count = 0, total = 0;
        document.querySelectorAll("#game_library_panel .game-library-entry").forEach(function (entry) {
            total++;
            entry.hidden = (!!query && !entry.textContent.toLocaleLowerCase().includes(query))
                || (!!libraryMode && entry.dataset.expeditionMode !== libraryMode)
                || (!!libraryParty && entry.dataset.partySize !== libraryParty);
            if (!entry.hidden) count++;
        });
        var empty = document.getElementById("library_no_matches");
        if (empty) empty.hidden = !filtering() || count > 0;
        var status = document.getElementById("library_filter_status");
        if (status) status.textContent = filtering() ? count + " of " + total + " shown" : "";
    }
    function select(id, label, blank, options, current, onChange) {
        var wrap = $("<label class='library-filter'></label>").append($("<span></span>").text(label));
        var field = $("<select></select>").attr("id", id).append($("<option value=''></option>").text(blank));
        options.forEach(function (option) { field.append($("<option></option>").attr("value", option[0]).text(option[1])); });
        field.val(current).on("change", function () { onChange(this.value); filterGames(); });
        return wrap.append(field);
    }
    function heroChip(hero, index) {
        var chip = $("<li class='library-hero'></li>").attr({ "data-hero-job": hero.job || "", "data-hero-species": hero.species || "",
            "data-hero-slot": String(index) });
        chip.append($("<span class='library-hero-name'></span>").text(hero.name || "Hero"));
        var meta = [];
        if (hero.xl !== undefined && hero.xl !== null) meta.push("XL " + hero.xl);
        if (hero.species || hero.job) meta.push(((hero.species || "") + " " + (hero.job || "")).trim());
        if (meta.length) chip.append($("<span class='library-hero-meta'></span>").text(meta.join(" · ")));
        return chip;
    }
    function fact(label, value) {
        return [$("<dt></dt>").text(label), $("<dd></dd>").text(value)];
    }
    function savedTime(value) {
        if (!value) return "No manual save yet";
        var date = new Date(value);
        return Number.isNaN(date.getTime()) ? "Saved" : "Saved " + date.toLocaleString(undefined,
            { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }

    function link(kind, id, label) {
        return $("<a></a>").attr({ href: "/" + kind + "/" + encodeURIComponent(id),
            target: "_blank", rel: "noopener" }).text(label);
    }
    function notice(message) {
        var element = document.getElementById("library_notice");
        if (!element) {
            element = document.createElement("div");
            element.id = "library_notice";
            element.setAttribute("role", "status");
            document.body.appendChild(element);
        }
        element.textContent = message;
        element.hidden = false;
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(function () { element.hidden = true; }, 6000);
    }
    function saveStatus() {
        var owner = Boolean(identity && accountId && identity.owner_id === accountId);
        return { owner: owner, saving: saving, reason: !owner ? "Only the expedition owner can save this game."
            : saving ? "Saving expedition…" : !ready ? "Finish the current action or close its menu or prompt to save." : "" };
    }
    function save(exit) {
        if (saveStatus().reason) return false;
        var party = window.crawl_party && window.crawl_party.state;
        if (exit && party && party.members.length > 1 &&
            !window.confirm("Save this expedition and return everyone to the lobby?")) return false;
        saving = true;
        init();
        comm.send_message("library_save", { exit: exit === true });
        return true;
    }
    function init() {
        var dock = document.getElementById("dcss_quick_dock");
        if (!dock) return;
        var group = document.getElementById("library_dock");
        if (!group) {
            group = document.createElement("span");
            group.id = "library_dock";
            dock.appendChild(group);
            $(group).append($("<button type='button' class='dcss-dock-btn' id='dock_save_btn'>Save</button>")
                .attr("title", "Save the whole expedition without leaving or spending a turn"),
            $("<button type='button' class='dcss-dock-btn' id='dock_save_exit_btn'>Save & lobby</button>")
                .attr("title", "Save the expedition and return everyone to the lobby"));
        }
        var ownsGame = saveStatus().owner;
        $(dock).find("#dock_save_btn, #dock_save_exit_btn").prop("hidden", !ownsGame).prop("disabled", saving || !ready)
            .each(function () {
                this.title = saving ? "Saving expedition…" : !ready
                    ? "Preparing the expedition. Finish the current action or close a menu or prompt to save."
                    : this.id === "dock_save_exit_btn"
                        ? "Save the expedition and return everyone to the lobby"
                        : "Save the whole expedition without leaving or spending a turn";
            });
        if (identity) {
            var gameLink = dock.querySelector(".library-game-link");
            if (!gameLink) {
                $(group).append(link("games", identity.game_id, "Game record").addClass("library-game-link"),
                    link("players", identity.player_id, "Hero record").addClass("library-hero-link"));
            }
            $(dock).find(".library-game-link").attr("href", "/games/" + identity.game_id);
            $(dock).find(".library-hero-link").attr("href", "/players/" + identity.player_id);
        }
        $(document).trigger("game_library_controls");
    }
    function render(data) {
        saving = false;
        accountId = data.player_id;
        var restoreSearch = document.activeElement && document.activeElement.classList.contains("library-search");
        var focusAfterDelete = deleting && data.games.every(function (game) { return game.id !== deleting; });
        if (focusAfterDelete) deleting = null;
        var panel = document.getElementById("game_library_panel");
        if (!panel) {
            panel = document.createElement("section");
            panel.id = "game_library_panel";
            panel.className = "game-library";
            panel.setAttribute("aria-label", "Saved games");
            var anchor = document.getElementById("party_lobby_panel") || document.getElementById("lobby_body");
            if (anchor) anchor.parentNode.insertBefore(panel,
                anchor.id === "party_lobby_panel" ? anchor.nextSibling : anchor);
        }
        $(panel).empty();
        var accountMenu = document.querySelector(".lobby-account-menu");
        if (accountId && accountMenu) {
            var profile = accountMenu.querySelector(".library-own-record");
            if (!profile) {
                profile = link("players", accountId, "My adventurer record").addClass("library-own-record")[0];
                accountMenu.insertBefore(profile, accountMenu.firstChild);
            }
            profile.href = "/players/" + encodeURIComponent(accountId);
        }
        var running = data.games.filter(function (game) { return game.running; }).length;
        var heading = $("<div class='library-section-heading'></div>")
            .append($("<h2>Saved expeditions</h2>"), $("<p></p>").text(accountId
                ? data.games.length + (data.games.length === 1 ? " expedition to continue" : " expeditions to continue") +
                    (running ? ", " + running + " running now." : ".") + " Fallen expeditions are kept in your history."
                : "Your saved progress, ready when you are."));
        var tools = $("<div class='library-header-actions'></div>");
        if (accountId) tools.append(link("players", accountId, "My history"));
        tools.append($("<button type='button' class='dcss-btn' id='library_refresh_btn'>Refresh</button>"));
        var header = $("<header></header>").append(heading, tools);
        $(panel).append(header);
        if (data.games.length || filtering()) {
            var filters = $("<div class='library-filters' role='group' aria-label='Filter saved expeditions'></div>");
            var search = $("<input type='search' class='library-search' placeholder='Find an expedition…' aria-label='Find a saved expedition'>")
                .val(libraryQuery).on("input", function () { libraryQuery = this.value; filterGames(); });
            filters.append(search);
            var modes = [], sizes = [];
            data.games.forEach(function (game) {
                var size = String((game.state && game.state.players || []).length || 1);
                if (game.mode && modes.indexOf(game.mode) === -1) modes.push(game.mode);
                if (sizes.indexOf(size) === -1) sizes.push(size);
            });
            if (modes.length > 1 || libraryMode)
                filters.append(select("library_mode_filter", "Mode", "All modes", modes.map(function (mode) {
                    return [mode, modeLabel(mode)];
                }), libraryMode, function (value) { libraryMode = value; }));
            if (sizes.length > 1 || libraryParty)
                filters.append(select("library_party_filter", "Party", "Any size", sizes.sort().map(function (size) {
                    return [size, partyLabel(Number(size))];
                }), libraryParty, function (value) { libraryParty = value; }));
            filters.append($("<span id='library_filter_status' class='library-filter-status' role='status'></span>"));
            $(panel).append(filters);
        }
        var list = $("<div class='game-library-list'></div>").appendTo(panel);
        if (!accountId) list.append($("<p class='library-empty-state tr-callout'>Log in to save and resume your expeditions.</p>"));
        else if (!data.games.length) {
            list.append($("<div class='library-empty-state tr-callout'></div>").append(
                $("<strong></strong>").text("No saved expeditions yet."),
                $("<p></p>").text("Start a new adventure and your progress will be waiting here."),
                $("<button type='button' class='dcss-btn dcss-btn-primary' data-lobby-create='true'>New expedition</button>")));
        }
        data.games.forEach(function (game) {
            var state = game.state || {}, players = state.players || [];
            var status = game.running ? "running" : game.loadable ? "saved" : "unavailable";
            var entry = $("<article class='game-library-entry expedition-card tr-card'></article>").attr({
                "data-game-id": game.id, "data-expedition-mode": game.mode || "",
                "data-party-size": String(players.length || 1), "data-expedition-state": status });
            var summary = $("<div class='library-entry-summary'></div>");
            var title = $("<div class='library-entry-title'></div>").append($("<h3></h3>").text(game.name),
                $("<span class='library-state tr-badge'></span>").attr("data-state", status)
                    .text(game.running ? "Running" : game.loadable ? "Saved" : "Unavailable"));
            summary.append(title);
            var facts = $("<dl class='library-facts'></dl>");
            facts.append(fact("Floor", state.place || "Starting"), fact("Turn", String(state.turns || 0)),
                fact("Mode", modeLabel(game.mode)), fact("Party", partyLabel(players.length || 1)));
            summary.append(facts);
            if (players.length) {
                var roster = $("<ul class='library-roster'></ul>").attr("aria-label", "Party roster");
                players.forEach(function (hero, index) { roster.append(heroChip(hero, index)); });
                summary.append(roster);
            }
            summary.append($("<p class='library-saved-time'></p>").text(savedTime(game.saved_at)));
            if (!game.running && !game.loadable) summary.append($("<p class='library-unavailable'></p>")
                .text("This save cannot be resumed in the current game version. Its expedition record is still available."));
            var actions = $("<div class='library-entry-actions'></div>");
            if (game.loadable || game.running) actions.append($("<a class='dcss-btn dcss-btn-primary tr-btn'></a>")
                .text(game.running ? "Return to game" : "Resume")
                .attr({ href: expeditionURL.hash(game.id), "data-library-load": game.id }));
            actions.append(link("games", game.id, "View record").addClass("library-record-link"));
            actions.append($("<span class='library-entry-danger'></span>").append(
                $("<button type='button' class='dcss-btn library-delete'>Delete save</button>")
                .attr({ "data-library-delete": game.id, "data-library-name": game.name,
                    "data-deletable": String(game.deletable !== false),
                    "aria-label": "Delete save for " + game.name,
                    title: game.deletable === false ? "Return this expedition to the lobby before deleting its save"
                        : "Permanently delete saved progress; the public record remains" })));
            entry.append(summary, actions);
            list.append(entry);
        });
        $(panel).append($("<p id='library_no_matches' class='library-no-matches' hidden role='status'>No expeditions match that search.</p>"));
        filterGames();
        deletionControls();
        if (restoreSearch) $(panel).find(".library-search").trigger("focus");
        else if (focusAfterDelete) $("#library_refresh_btn").trigger("focus");
        $(document).trigger("game_library_rendered");
        init();
    }
    document.addEventListener("click", function (event) {
        var target = event.target.closest("[data-library-load], [data-library-delete], #library_refresh_btn, #dock_save_btn, #dock_save_exit_btn");
        if (!target) return;
        if (target.matches("a[data-library-load]") &&
            (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
        event.preventDefault();
        event.stopPropagation();
        if (target.hasAttribute("data-library-delete")) {
            if (target.disabled || deleting) return;
            if (!window.confirm('Delete saved progress for “' + target.getAttribute("data-library-name") +
                '”? You will no longer be able to resume this expedition. Its public record will remain.')) return;
            deleting = target.getAttribute("data-library-delete");
            deletionControls();
            comm.send_message("library_delete", { id: deleting });
        } else if (target.hasAttribute("data-library-load")) {
            if (target.closest("#game_recovery")) $("#exit_game .hide_dialog").trigger("click");
            var destination = expeditionURL.hash(target.getAttribute("data-library-load"));
            if (location.hash === destination)
                comm.send_message("expedition_open", { id: target.getAttribute("data-library-load") });
            else location.hash = destination;
        } else if (target.id === "library_refresh_btn") comm.send_message("library_fetch");
        else save(target.id === "dock_save_exit_btn");
    });
    comm.register_handlers({
        game_recovery: function (data) {
            var box = document.getElementById("game_recovery");
            if (!box) {
                box = document.createElement("section");
                box.id = "game_recovery";
                document.getElementById("exit_game").appendChild(box);
            }
            $(box).empty().append($("<h3>Recover your expedition</h3>"),
                $("<p></p>").text(data.loadable
                    ? "A confirmed checkpoint passed the game's compatibility check. Resuming restores that checkpoint; later actions may be lost."
                    : data.saved_at ? "A checkpoint exists, but it could not be verified for this game version. Your game has not been restarted."
                    : "No confirmed saved checkpoint was found. Your game has not been restarted."),
                $("<p></p>").text(data.saved_at ? savedTime(data.saved_at) : "Checkpoint time unavailable."));
            if (data.loadable) $("<button type='button' class='dcss-btn'>Resume saved expedition</button>")
                .attr("data-library-load", data.id).appendTo(box);
            if (data.report_url) $("<a class='dcss-btn' download>Download crash report</a>")
                .attr("href", data.report_url).appendTo(box);
            if (!data.report_url) $(box).append($("<p>Crash diagnostics are unavailable on this server.</p>"));
            $(box).prop("hidden", false);
        },
        game_library: render,
        library_delete_result: function () { notice("Save deleted. The expedition's public record is still available."); },
        record_identity: function (data) { identity = data; init(); },
        record_save_result: function (data) {
            saving = false;
            init();
            notice(data.ok ? "Expedition saved. You can keep playing." : "Close the current menu or prompt, then save again.");
        },
        library_error: function (data) {
            saving = false; deleting = null; deletionControls(); init(); notice(data.message);
        }
    });
    $(document).ready(function () {
        if (!document.getElementById("library_styles"))
            $("<link id='library_styles' rel='stylesheet' href='/static/tabletop/library.css'>").appendTo("head");
    });
    return {
        init: init,
        save: save,
        save_status: saveStatus,
        set_ready: function (value) {
            var next = value === true;
            if (next === ready) return;
            ready = next;
            init();
        },
        reset: function () { identity = null; saving = false; deleting = null; ready = false; init(); }
    };
});
