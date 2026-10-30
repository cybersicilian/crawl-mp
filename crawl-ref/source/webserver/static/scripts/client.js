/* Browser session composition; cohesive feature modules keep native contracts intact. */
define(["exports", "jquery", "key_conversion", "chat", "comm",
        "contrib/jquery.cookie", "contrib/jquery.tablesorter",
        "contrib/jquery.waitforimages",
        "client-transport",
        "client-input",
        "client-dialogs",
        "client-auth",
        "client-account",
        "client-lobby",
        "client-staging-controls",
        "client-staging",
        "client-tooltips",
        "client-chronicle", "game-loading", "connection-quality", "expedition-url", "character-name", "party-url"],
function (exports, $, key_conversion, chat, comm, cookie, tablesorter, waitforimages,
          transportFactory, inputFactory, dialogsFactory, authFactory, accountFactory,
          lobbyFactory, stagingControlsFactory, stagingFactory, tooltipsFactory, chronicleFactory, loading, quality, expeditionURL, characterName, partyURL) {
    window.current_layer = "crt";

    window.debug_mode = false;

    window.log_messages = false;

    window.log_message_size = false;

    var normal_exit = ["saved", "cancel", "quit", "won", "bailed out", "dead"];

    next_loading_img = 0;

    window.log = function (text)
    {
        if (window.console && window.console.log)
            window.console.log(text);
    }

    var state = {
        watching: false, watching_username: undefined, party_member_active: false, party_slot: 0,
        playing: false, logging_in: false, showing_close_message: false, current_hash: undefined,
        exit_reason: undefined, exit_message: undefined, exit_dump: undefined,
        current_user: undefined, admin_user: false, party_rooms: [], current_party_room_id: null
    };
    var api = {};
    var send_message = comm.send_message;
    $.extend(api, transportFactory(api, state));
    $.extend(api, inputFactory(api, state));
    $.extend(api, dialogsFactory(api, state));
    $.extend(api, authFactory(api, state));
    $.extend(api, accountFactory(api, state));
    $.extend(api, lobbyFactory(api, state));
    $.extend(api, stagingControlsFactory(api, state));
    $.extend(api, stagingFactory(api, state));
    $.extend(api, tooltipsFactory(api, state));
    $.extend(api, chronicleFactory(api, state));
    $.extend(api, {
        in_game: in_game,
        do_layout: do_layout,
        pong: pong,
        connection_closed: connection_closed,
        play_now: play_now,
        select_next_loading_img: select_next_loading_img,
        show_loading_screen: show_loading_screen,
        cleanup: cleanup,
        go_lobby: go_lobby,
        go_admin: go_admin,
        set_account_hold: set_account_hold,
        clear_account_hold: clear_account_hold,
        login_required: login_required,
        chat_login: chat_login,
        watching_started: watching_started,
        party_joined: party_joined,
        crawl_started: crawl_started,
        crawl_ended: crawl_ended,
        hash_changed: hash_changed,
        set_html: set_html,
        do_set_layer: do_set_layer,
        do_reload_url: do_reload_url,
        bind_document_events: bind_document_events,
        abs: abs
    });

    exports.inhibit_messages = api.inhibit_messages;

    exports.uninhibit_messages = api.uninhibit_messages;

    exports.delay = api.delay;

    function in_game()
    {
        return !state.connection_lost && !state.logging_in && !loading.blocking()
               && current_layer != "lobby" && current_layer != "loader"
               && !state.showing_close_message;
    }

    exports.in_game = in_game;

    var wasLoading = false;
    loading.subscribe(function (blocking) {
        if (wasLoading && !blocking) chat.reset_visibility(in_game());
        wasLoading = blocking;
    });

    exports.set_layer = api.set_layer;

    exports.register_layer = api.register_layer;

    function do_layout()
    {
        $("#loader").height($(window).height());
        if (window.do_layout)
            window.do_layout();
    }

    exports.show_dialog = api.show_dialog;

    exports.hide_dialog = api.hide_dialog;

    exports.center_element = api.center_element;

    function pong(data)
    {
        send_message("pong");
        return true;
    }

    function connection_closed(data)
    {
        if (data.retry) return true;
        api.stop_connection();
        var msg = data.reason;
        loading.cancel();
        api.set_layer("crt");
        api.hide_dialog();
        chat.reset_visibility(false);
        $("#crt").html(msg + "<br><br>");
        state.showing_close_message = true;
        return true;
    }

    function play_now(id)
    {
        var name = characterName.read();
        if (name === null) return;
        state.showing_close_message = false;
        send_message("play", {
            game_id: id,
            character_name: name
        });
    }

    function select_next_loading_img()
    {
        var imgs = $("#loader img");
        next_loading_img = Math.floor(Math.random() * imgs.length);
        // remove the lazy loading attribute, causing the image to load.
        // (N.b. I didn't find standards-level documentation indicating that
        // this must do anything, but it does have the desired behavior on
        // firefox/chrome at the time of testing.)
        // This never bothers to add back the lazy loading attribute, under
        // the assumption that all images will be cached.
        if ($(imgs[next_loading_img]).attr("loading"))
            $(imgs[next_loading_img]).removeAttr("loading");
    }

    function show_loading_screen()
    {
        if (current_layer == "loader")
            return;
        var imgs = $("#loader img");
        next_loading_img = Math.min(imgs.length - 1, next_loading_img); // sanity check
        imgs.hide();
        $(imgs[next_loading_img]).show();
        api.set_layer("loader");
    }

    function cleanup()
    {
        loading.cancel();
        document.title = "WebTiles - Dungeon Crawl Stone Soup";

        api.hide_dialog();

        $(document).trigger("game_cleanup");
        $("#game").html('<div id="crt" style="display: none;"></div>');

        chat.clear();
        key_conversion.reset_keycodes();

        state.watching = false;
        state.playing = false;
        state.party_member_active = false;
        state.party_slot = 0;
    }

    function go_lobby()
    {
        api.finish_recovery();
        var was_watching = state.watching;
        var was_party_member = state.party_member_active;

        cleanup();
        state.current_hash = "#lobby";
        location.hash = "#lobby";
        api.set_layer("lobby");
        $("#username").focus();

        if (state.exit_reason)
        {
            var party_pause = was_watching && was_party_member && state.exit_reason === "saved";
            if (!party_pause && (was_watching || normal_exit.indexOf(state.exit_reason) === -1
                || state.exit_message && state.exit_message.length > 0))
            {
                api.show_exit_dialog(state.exit_reason, state.exit_message, state.exit_dump,
                                 was_watching ? state.watching_username : null);
            }
        }
        state.exit_reason = null;
        state.exit_message = null;
        state.exit_dump = null;
        if (state.current_user)
            select_next_loading_img();

        if ( $("#reset_pw").length )
        {
            api.show_dialog("#reset_pw");
        }
    }

    function go_admin()
    {
        $("#admin_panel").show();
    }

    function set_account_hold()
    {
        $("#account_restricted").show();
    }

    function clear_account_hold()
    {
        $("#account_restricted").hide();
    }

    function login_required(data)
    {
        cleanup();
        api.set_layer("lobby");
        $("#login_message").text("Sign in or create an account to continue.");
        $("#username").focus();
    }

    function chat_login(data)
    {
        if (!in_game() || !state.watching) return;

        var a = $("<a href='javascript:'>Close</a>");
        a.click(api.hide_prompt);
        api.show_prompt("Login to chat:", a);
    }

    comm.register_handlers({
        "stale_processes": api.handle_stale_processes,
        "force_terminate?": api.handle_force_terminate
    });

    function watching_started(data)
    {
        api.finish_recovery();
        if (data.expedition_id) {
            state.current_hash = expeditionURL.hash(data.expedition_id);
            history.replaceState(null, "", state.current_hash);
        }
        state.watching = true;
        state.watching_username = data.username;
        state.party_member_active = false;
        state.playing = false;
        if (window.pending_auto_join_party)
        {
            var join_slot = window.pending_auto_join_slot;
            window.pending_auto_join_party = false;
            window.pending_auto_join_slot = undefined;
            setTimeout(function () {
                var payload = {};
                if (join_slot !== undefined && join_slot !== null)
                    payload.slot = join_slot;
                send_message("join_party", payload);
            }, 250);
        }
    }

    function party_joined(data)
    {
        state.party_member_active = true;
        state.party_slot = (data && data.slot !== undefined) ? data.slot : 1;
        window.crawl_party_slot = state.party_slot;
        $(document).trigger("party_joined", [data]);
    }

    exports.is_watching = function ()
    {
        return state.watching && !state.party_member_active;
    }

    exports.is_party_member = function ()
    {
        return state.party_member_active;
    }

    function crawl_started(data)
    {
        api.finish_recovery();
        if (data.game_id) {
            state.current_hash = data.expedition_id ? expeditionURL.hash(data.expedition_id) : "#play-" + data.game_id;
            history.replaceState(null, "", state.current_hash);
        }
        state.playing = true;
        state.watching = false;
        state.party_member_active = true;
        state.party_slot = 0;
        window.crawl_party_slot = 0;
    }

    function crawl_ended(data)
    {
        state.playing = false;

        state.exit_reason = data.reason;
        state.exit_message = data.message;
        state.exit_dump = data.dump;
    }

    function hash_changed()
    {
        if (state.connection_lost || state.logging_in) return;
        if (location.hash === state.current_hash)
            return;
        var name = /^#play-/i.test(location.hash) ? characterName.read() : "";
        if (name === null) {
            history.replaceState(null, "", state.current_hash || "#lobby");
            return;
        }
        state.current_hash = location.hash;

        var watch = location.hash.match(/^#watch-(.+)/i);
        var play = location.hash.match(/^#play-(.+)/i);
        var expedition = expeditionURL.parse(location.hash);
        var lobby = partyURL.parse(location.hash);
        if (lobby) {
            if (!state.playing && !state.watching) { loading.cancel(); api.hide_dialog(); api.set_layer("lobby"); }
            send_message("party_room_open", lobby);
        }
        else if (expedition)
        {
            send_message("expedition_open", {
                id: expedition.id,
                reconnect: state.reconnecting === true
            });
        }
        else if (watch)
        {
            var watch_user = watch[1];
            send_message("watch", {
                username: watch_user
            });
        }
        else if (play)
        {
            var game_id = play[1];
            send_message("play", {
                game_id: game_id,
                character_name: name,
                reconnect: state.reconnecting === true
            });
        }
        else
        {
            send_message("go_lobby");
        }
    }

    function set_html(data)
    {
        $("#" + data.id).html(data.content);
    }

    function do_set_layer(data)
    {
        api.set_layer(data.layer);
    }

    function do_reload_url()
    {
        window.location.assign('/');
    }

    function bind_document_events()
    {
        quality.bind();
        $(document).on("keypress.client", api.handle_keypress);
        $(document).on("keydown.client", api.handle_keydown);
        api.init_lobby_tooltips();
    }

    window.log = log;

    window.set_layer = api.set_layer;

    window.assert = function () {};

    window.abs = function (x) { if (x < 0) return -x; else return x; }

    comm.register_immediate_handlers({
        "ping": pong,
        "pong": function () { return true; },
        "close": connection_closed,
    });

    comm.register_handlers({
        "multi": api.handle_multi_message,

        "set_game_links": api.set_game_links,
        "html": set_html,
        "show_dialog": api.handle_dialog,
        "hide_dialog": api.hide_dialog,

        "lobby_clear": api.lobby_clear,
        "lobby_entry": api.lobby_entry,
        "lobby_remove": api.lobby_remove,
        "lobby_complete": api.lobby_complete,

        "go_lobby": go_lobby,
        "go_admin": go_admin,
        "set_account_hold": set_account_hold,
        "clear_account_hold": clear_account_hold,
        "login_required": login_required,
        "game_started": crawl_started,
        "connection_wait": api.wait_for_game,
        "game_ended": crawl_ended,
        "server_announcement": api.server_announcement,

        "login_success": api.logged_in,
        "login_fail": api.login_failed,
        "auth_error": api.auth_error,
        "logout": api.handle_logout,
        "login_cookie": api.set_login_cookie,
        "register_fail": api.register_failed,
        "start_change_email": api.start_change_email,
        "change_email_fail": api.change_email_failed,
        "change_email_done": api.change_email_done,
        "start_change_password": api.start_change_password,
        "change_password_done": api.change_password_done,
        "change_password_fail": api.change_password_failed,
        "forgot_password_fail": api.forgot_password_failed,
        "forgot_password_done": api.forgot_password_done,
        "reset_password_fail": api.reset_password_failed,

        "admin_log": api.admin_log,
        "admin_pw_reset_done": api.admin_pw_reset_done,

        "watching_started": watching_started,
        "party_joined": party_joined,
        "party_rooms_list": api.handle_party_rooms_list,
        "party_room_launched": api.handle_party_room_launched,
        "coop_chronicle": api.handle_coop_chronicle,

        "game_settings": api.game_settings,

        "game_client": api.receive_game_client,

        "layer": do_set_layer,

        "reload_url": do_reload_url,
    });

    function abs(x)
    {
        return x > 0 ? x : -x;
    }


    $(document).ready(function () {
        // Preserve older record-page bookmarks while routing through one path.
        var initialURL = new URL(location.href);
        var legacyLoad = initialURL.searchParams.get("load");
        if (legacyLoad) {
            initialURL.searchParams.delete("load");
            initialURL.hash = expeditionURL.hash(legacyLoad);
            history.replaceState(null, "", initialURL);
        }
        bind_document_events();

        api.init_party_staging_ui();

        api.init_lobby_tooltips();

        api.bind_chronicle_events();

        $(window).resize(function (ev) {
            do_layout();
            $(".floating_dialog:visible").each(function () { api.center_element($(this)); });
        });

        $(window).bind("beforeunload", function (ev) {
            if (state.playing &&
                window.socket && window.socket.readyState == 1)
            {
                ev.preventDefault();
                ev.returnValue = '';
                // n.b. this return value is ignored by 95% of browsers
                return "Really save and quit the game?";
            }
        });

        $(".hide_dialog").click(api.hide_dialog);

        api.bind_account_events();

        do_layout();

        api.connect();
    });
    return exports;
});
