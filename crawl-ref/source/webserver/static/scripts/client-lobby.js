/* Live expedition table, idle times and categorized game preferences.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "comm", "lobby-modes", "expedition-url", "mode-catalogue", "rc-settings"], function ($, comm, renderModes, expeditionURL, catalogue, rcSettings) {
    return function create(api, state) {
        var send_message = comm.send_message;

        var editing_rc, settingsRequest = 0;

        function edit_rc(id)
        {
            editing_rc = id;
            rcSettings.loading();
            api.show_dialog("#rc_edit");
            send_message("get_game_settings", { game_id: id, request_id: String(++settingsRequest) });
        }

        function game_settings(data)
        {
            if (data.game_id !== editing_rc || data.request_id !== String(settingsRequest) ||
                data.username !== state.current_user) return;
            if (!data.available) { rcSettings.showError(data.error || "Game settings are unavailable."); return; }
            rcSettings.load(data);
            api.center_element($("#rc_edit"));
            if (!data.saved) document.getElementById("rc_settings_search").focus();
            if (data.saved) document.getElementById("rc_settings_status").textContent = "Settings saved. Applies at your next game start.";
        }

        function send_rc()
        {
            var changes = rcSettings.changes();
            if (!changes) return false;
            rcSettings.setSaving(true);
            send_message("set_game_settings", { game_id: editing_rc, changes: changes, request_id: String(++settingsRequest) });
            return false;
        }

        var new_list = null;

        function lobby_entry(data)
        {
            var single = false;
            if (new_list == null)
            {
                single = true;
                new_list = $("#player_list").clone();
            }

            var id = "game-" + data.id;
            var entry = new_list.find("#" + id);
            if (entry.length == 0)
            {
                entry = $("#game_entry_template").clone();
                entry.attr("id", id);
                new_list.append(entry);
            }

            function set(key, value)
            {
                entry.find("." + key).html(value);
            }

            var username_entry = $(make_watch_link(data));
            username_entry.text(data.username);
            set("username", username_entry);
            var $coop_btn;
            if (state.current_user && data.username === state.current_user)
            {
                $coop_btn = $("<a class='coop-join-table-btn'></a>")
                    .attr("href", data.expedition_id ? expeditionURL.hash(data.expedition_id) : "#play-" + data.game_id)
                    .attr("data-tip-title", "Resume Your Expedition (" + data.username + ")")
                    .attr("data-tip-body", "Re-enter your active dungeon session (" + (data.char || "Hero") + " on " + (data.place || "D:1") + ").")
                    .attr("data-tip-meta", "Game Mode: " + (data.game_id || "DCSS") + " | Click to resume")
                    .text("Return to game");
            }
            else
            {
                $coop_btn = $("<a class='coop-join-table-btn'></a>")
                    .attr("href", data.expedition_id ? expeditionURL.hash(data.expedition_id) : "#watch-" + data.username)
                    .attr("data-tip-title", "Join Co-op Expedition (" + data.username + "'s Party)")
                    .attr("data-tip-body", "Connects to " + data.username + "'s live dungeon expedition (" + (data.char || "Party") + " on " + (data.place || "D:1") + ") and claims an open companion hero slot.")
                    .attr("data-tip-meta", "1-Click Live Co-op Drop-In | Turn Pacing: Simultaneous + Hybrid")
                    .text("Join co-op")
                    .on("click", function () {
                        window.pending_auto_join_party = true;
                    });
            }
            if (!state.current_user || data.username !== state.current_user)
            {
                var watch = $(make_watch_link(data)).addClass("coop-watch-table-btn").text("Watch");
                watch.on("click", function () { window.pending_auto_join_party = false; });
                $coop_btn = $("<span class='live-expedition-actions'></span>").append($coop_btn, watch);
            }
            set("coop_join", $coop_btn);
            entry.find(".game_id").text(catalogue.label(data.game_id));
            set("xl", data.xl);
            set("char", data.char);
            set("place", data.place);
            if (data.turn && data.dur)
            {
                set("turn", data.turn);
                set("dur", format_duration(parseInt(data.dur)));

                new_list.removeClass("no_game_times");
            }
            set("god", data.god || "");
            set("title", data.title);
            set("idle_time", format_idle_time(data.idle_time));
            entry.find(".idle_time")
                .data("time", data.idle_time)
                .attr("data-time", "" + data.idle_time);
            entry.find(".idle_time")
                .data("sort", "" + data.idle_time)
                .attr("data-sort", "" + data.idle_time);
            set("spectator_count", data.spectator_count > 0 ? data.spectator_count : "");
            if (entry.find(".milestone").text() !== data.milestone)
            {
                if (single)
                    roll_in_new_milestone(entry, data.milestone);
                else
                    set("milestone", data.milestone);
            }

            if (single)
                lobby_complete();
        }

        var lobby_idle_timer = setInterval(update_lobby_idle_times, 1000);

        function update_lobby_idle_times()
        {
            $("#player_list .idle_time").each(function () {
                var $this = $(this);
                var time = $this.data("time");
                if (time)
                {
                    time++;
                    $this.html(format_idle_time(time));
                    $this.data("time", time)
                        .attr("data-time", "" + time);
                    $this.data("sort", "" + time)
                        .attr("data-sort", "" + time);
                }
            });
        }

        function lobby_remove(data)
        {
            $("#game-" + data.id).remove();
            if ($("#player_list tbody tr").length == 0)
                $("#lobby_body").hide();
        }

        function lobby_clear()
        {
            new_list = $("#player_list").clone();
            new_list.find("tbody").html("");
        }

        function lobby_complete()
        {
            var old_list = $("#player_list");
            var sortlist;
            if (new_list.find("tbody tr").length > 0)
            {
                $("#lobby_body").show();
                if (old_list[0].config)
                    sortlist = old_list[0].config.sortList;
                else
                    sortlist = [[0, 0]];
                new_list.tablesorter({
                    sortList: sortlist,
                    textExtraction: extract_text_or_data,
                    headers: { 0: { sorter: "text" } }
                });
            }
            else
                $("#lobby_body").hide();
            old_list.replaceWith(new_list);
            new_list = null;
        }

        function make_watch_link(data)
        {
            if (data.username.startsWith("[account hold]"))
                return "<b></b>"; // don't linkify, watching disabled
            else
                return $("<a></a>").attr("href", data.expedition_id
                    ? expeditionURL.hash(data.expedition_id) : "#watch-" + data.username);
        }

        function format_duration(seconds)
        {
            var elem = $("<span></span>");
            if (seconds == 0)
            {
                elem.text("");
            }
            else if (seconds < 60)
            {
                elem.text(seconds + "s");
            }
            else if (seconds < (60 * 60))
            {
                elem.text(Math.floor(seconds / 60) + "m");
            }
            else
            {
                elem.text(Math.floor(seconds / (60 * 60)) + "h " +
                    (Math.floor(seconds / 60) % 60) + "m");
            }
            return elem;
        }

        function format_idle_time(seconds)
        {
            var elem = $("<span></span>");
            if (seconds == 0)
            {
                elem.text("");
            }
            else if (seconds < 120)
            {
                elem.text(seconds + "s");
            }
            else if (seconds < (60 * 60))
            {
                elem.text(Math.round(seconds / 60) + "m");
            }
            else
            {
                elem.text(Math.round(seconds / (60 * 60)) + "h");
            }
            return elem;
        }

        function extract_text_or_data(elem)
        {
            var $elem = $(elem);
            if ($elem.data("sort"))
                return $elem.data("sort");
            else
                return $elem.text();
        }

        function roll_in_new_milestone(row, milestone)
        {
            var td = row.find(".milestone_col");
            if (td.length == 0) return;

            var new_milestone = td.find(".new_milestone");
            new_milestone.text(milestone);

            var milestones = td.find(".new_milestone, .milestone");
            milestones.animate({ top: "-1.1em" }, function () {
                milestones.text(milestone);
                milestones.css({ top: 0 });
            });
        }

        function set_game_links(data)
        {
            $("#play_now").html(data.content);
            $("#play_now .edit_rc_link").click(function (ev) {
                // $(this).data("game_id") will return a number for values like
                // "0.24", so explicitly coerce to string.
                var id = $(this).data("game_id").toString();
                edit_rc(id);
            });
            $("#play_now a").each(function () {
                var $a = $(this);
                if ($a.attr("data-tip-title"))
                    return;
                var label = ($a.text() || "").trim();
                if ($a.hasClass("edit_rc_link"))
                {
                    var rcGameId = ($a.data("game_id") || "DCSS").toString();
                    $a.attr("data-tip-title", "Game settings (" + rcGameId + ")")
                      .attr("data-tip-body", "Change travel, combat, inventory, messages and display preferences for " + rcGameId + ".")
                      .attr("data-tip-meta", "Game settings | Saved to your account");
                }
                else
                {
                    var href = $a.attr("href") || "";
                    var isCoop = label.toLowerCase().indexOf("co-op") !== -1 || href.toLowerCase().indexOf("coop") !== -1;
                    $a.attr("data-tip-title", "Launch Game Mode: " + label)
                      .attr("data-tip-body", isCoop
                          ? "Starts or resumes a Co-op Party Dungeon expedition with Simultaneous + Hybrid turn pacing and shared dungeon exploration."
                          : "Starts or resumes a Dungeon Crawl Stone Soup session in mode: " + label + ".")
                      .attr("data-tip-meta", isCoop ? "Co-op Mode | Simultaneous + Hybrid Turns" : "Click to launch game mode");
                }
            });
            renderModes(document.getElementById("play_now"), state.current_user);
            var firstSettings = document.querySelector("#play_now .edit_rc_link");
            $("#party_game_settings").prop("hidden", !firstSettings).off("click").on("click", function () {
                if (firstSettings) firstSettings.click();
            });
        }

        return {
            edit_rc: edit_rc,
            game_settings: game_settings,
            send_rc: send_rc,
            lobby_entry: lobby_entry,
            update_lobby_idle_times: update_lobby_idle_times,
            lobby_remove: lobby_remove,
            lobby_clear: lobby_clear,
            lobby_complete: lobby_complete,
            make_watch_link: make_watch_link,
            format_duration: format_duration,
            format_idle_time: format_idle_time,
            extract_text_or_data: extract_text_or_data,
            roll_in_new_milestone: roll_in_new_milestone,
            set_game_links: set_game_links
        };
    };
});
