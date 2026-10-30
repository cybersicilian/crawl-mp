define(["jquery", "comm", "expedition-url", "library-browser", "require"], function ($, comm, expeditionURL, browser, require) {
    "use strict";
    var accountId = null, identity = null, saving = false, ready = false, noticeTimer;
    var deleting = null;

    function deletionControls() {
        document.querySelectorAll("[data-library-delete]").forEach(function (button) {
            button.disabled = !!deleting || button.getAttribute("data-deletable") === "false";
            button.textContent = button.getAttribute("data-library-delete") === deleting ? "Deleting…" : "Delete save";
        });
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
        var focused = document.activeElement;
        var restoreAction = focused && focused.closest(".game-library-entry");
        var focusId = restoreAction && restoreAction.dataset.gameId;
        var action = focused && (focused.hasAttribute("data-library-load") ? "[data-library-load]"
            : focused.hasAttribute("data-library-delete") ? "[data-library-delete]" : "a:not([data-library-load])");
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
        if (!panel.querySelector("header")) {
            panel.appendChild(document.createElement("header"));
            browser.init(panel);
            $(panel).append($("<div class='game-library-list'></div>"),
                $("<p id='library_no_matches' hidden>No expeditions match. Try another search or clear filters.</p>"));
        }
        var accountMenu = document.querySelector(".lobby-account-menu");
        if (accountId && accountMenu) {
            var profile = accountMenu.querySelector(".library-own-record");
            if (!profile) {
                profile = link("players", accountId, "My adventurer record").addClass("library-own-record")[0];
                accountMenu.insertBefore(profile, accountMenu.firstChild);
            }
            profile.href = "/players/" + encodeURIComponent(accountId);
        }
        var heading = $("<div class='library-section-heading'></div>")
            .append($("<h2>Saved expeditions</h2>"), $("<p></p>").text(accountId
                ? data.games.length + (data.games.length === 1 ? " expedition to continue." : " expeditions to continue.") +
                    " Fallen expeditions are kept in your history."
                : "Your saved progress, ready when you are."));
        var tools = $("<div class='library-header-actions'></div>");
        if (accountId) tools.append(link("players", accountId, "My history"));
        tools.append($("<button type='button' class='dcss-btn' id='library_refresh_btn'>Refresh</button>"));
        var header = $("<header></header>").append(heading, tools);
        $(panel).children("header").replaceWith(header);
        var list = $(panel).find(".game-library-list").empty();
        var rows = $("<tbody id='library_rows'></tbody>");
        if (data.games.length) {
            var table = $("<table class='library-expeditions' role='table' aria-label='Saved expeditions'></table>");
            table.append($("<thead><tr><th scope='col'>Expedition</th><th scope='col'>Progress</th>" +
                "<th scope='col'>Last saved</th><th scope='col'>Actions</th></tr></thead>"), rows);
            list.append(table);
        }
        if (!accountId) list.append($("<p>Log in to save and resume your expeditions.</p>"));
        else if (!data.games.length) {
            list.append($("<p class='library-empty-state'>No saved expeditions yet. Start a new adventure and your progress will be waiting here.</p>"));
            list.append($("<button type='button' class='dcss-btn dcss-btn-primary' data-lobby-create='true'>New expedition</button>"));
        }
        data.games.forEach(function (game) {
            var state = game.state || {};
            var entry = $("<tr class='game-library-entry' role='row'></tr>").attr("data-game-id", game.id);
            var summary = $("<td role='cell' class='library-entry-summary' data-label='Expedition'></td>");
            var title = $("<div class='library-entry-title'></div>").append($("<h3></h3>").text(game.name),
                $("<span class='library-state'></span>").text(game.running ? "Running" : game.loadable ? "Saved" : "Unavailable"));
            summary.append(title);
            var progress = $("<td role='cell' class='library-progress' data-label='Progress'></td>").append($("<small></small>").text((state.place || "Starting") + " · Turn " + (state.turns || 0) +
                    " · " + ((state.players || []).length || 1) + ((state.players || []).length > 1 ? " heroes" : " hero")));
            var roster = (state.players || []).map(function (hero) {
                return (hero.name || "Hero") + " · " + (hero.species || "") + " " + (hero.job || "");
            });
            if (roster.length) summary.append($("<p class='library-roster'></p>").text(roster.join(" / ")));
            var saved = $("<td role='cell' class='library-time' data-label='Last saved'></td>");
            var time = $("<time class='library-saved-time'></time>").text(savedTime(game.saved_at));
            if (game.saved_at) time.attr("datetime", game.saved_at);
            saved.append(time);
            if (!game.running && !game.loadable) summary.append($("<p class='library-roster'></p>")
                .text("This save cannot be resumed in the current game version. Its expedition record is still available."));
            var actions = $("<td role='cell' class='library-entry-actions' data-label='Actions'></td>");
            if (game.loadable || game.running) actions.append($("<a class='dcss-btn dcss-btn-primary'></a>")
                .text(game.running ? "Return to game" : "Resume")
                .attr({ href: expeditionURL.hash(game.id), "data-library-load": game.id }));
            if (game.loadable && !game.running) actions.append($("<button type='button' class='dcss-btn'>Load into lobby</button>")
                .attr({ "data-library-lobby": game.id, "data-save-name": game.name }));
            actions.append(link("games", game.id, "View record"));
            actions.append($("<button type='button' class='dcss-btn library-delete'>Delete save</button>")
                .attr({ "data-library-delete": game.id, "data-library-name": game.name,
                    "data-deletable": String(game.deletable !== false),
                    "aria-label": "Delete save for " + game.name,
                    title: game.deletable === false ? "Return this expedition to the lobby before deleting its save"
                        : "Permanently delete saved progress; the public record remains" }));
            entry.append(summary, progress, saved, actions);
            rows.append(entry);
        });
        browser.update(rows[0], data.games);
        window.dispatchEvent(new CustomEvent("saved-expeditions-updated"));
        deletionControls();
        if (focusId && !focusAfterDelete) {
            var row = Array.from(panel.querySelectorAll(".game-library-entry")).find(function (entry) {
                return entry.dataset.gameId === focusId;
            });
            var replacement = row && row.querySelector(action);
            if (replacement && !row.hidden) replacement.focus({ preventScroll: true });
            else document.getElementById("library_refresh_btn").focus({ preventScroll: true });
        }
        if (focusAfterDelete || focused && focused.id === "library_refresh_btn")
            $("#library_refresh_btn").trigger("focus");
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
            notice(data.ok ? "Expedition saved. You can keep playing." : data.error || "Close the current menu or prompt, then save again.");
        },
        library_error: function (data) {
            saving = false; deleting = null; deletionControls(); init(); notice(data.message);
        }
    });
    $(document).ready(function () {
        if (!document.getElementById("library_styles"))
            $("<link id='library_styles' rel='stylesheet'>").attr("href", require.toUrl("../tabletop/library.css")).appendTo("head");
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
