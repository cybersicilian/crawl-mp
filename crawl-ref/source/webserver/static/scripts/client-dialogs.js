/* Shared layers, prompts, modal dialogs and process-recovery controls.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "chat", "comm", "game-loading"], function ($, chat, comm, loading) {
    return function create(api, state) {
        var send_message = comm.send_message;

        function show_prompt(title, footer)
        {
            $("#loader_text").hide();
            $("#prompt_title").html(title);
            $("#prompt_footer").html(footer);
            $("#prompt .login_placeholder").append($("#login"));
            $("#login_form").show();
            $("#login .extra_links").hide();
            $("#username").focus();
            $("#prompt").show();
        }

        function hide_prompt(game)
        {
            $("#prompt").hide();
            $("#lobby .login_placeholder").append($("#login"));
            $("#login .extra_links").show();
            $("#loader_text").show();
        }

        var layers = ["crt", "normal", "lobby", "loader"]

        function set_layer(layer)
        {
            if (state.showing_close_message) return;

            hide_prompt();
            if (layer != "lobby")
                api.hide_lobby_tooltip();

            $.each(layers, function (i, l) {
                if (l == layer)
                    $("#" + l).show();
                else
                    $("#" + l).hide();
            });
            var layer_changed = current_layer !== layer;
            current_layer = layer;
            loading.setLayer(layer);
            if (layer_changed) $(document).trigger("game_layer_changed", [layer]);

            chat.reset_visibility(api.in_game());
        }

        function register_layer(name)
        {
            if (layers.indexOf(name) == -1)
                layers.push(name);
        }

        function show_dialog(id)
        {
            $(".floating_dialog").hide();
            var elem = $(id);
            elem.stop(true, true).fadeIn(100, function () {
                elem.focus();
            });
            center_element(elem);
            $("#overlay").show();
        }

        function center_element(elem)
        {
            var left = $(window).width() / 2 - elem.outerWidth() / 2;
            if (left < 0) left = 0;
            var top = $(window).height() / 2 - elem.outerHeight() / 2;
            if (top < 0) top = 0;
            if (top > 50) top = 50;
            var offset = elem.offset();
            if (offset.left != left || offset.top != top)
                elem.offset({ left: left, top: top });
        }

        function hide_dialog()
        {
            state.showing_close_message = false;
            $(".floating_dialog").blur().hide();
            $("#overlay").hide();
        }

        function handle_dialog(data)
        {
            var dialog = $("<div class='floating_dialog'>");
            dialog.html(data.html);
            $("body").append(dialog);
            dialog.find("[data-key]").on("click", function (ev) {
                var key = $(this).data("key");
                api.send_bytes([key.charCodeAt(0)]);
            });
            show_dialog(dialog);
        }

        function possessive(name)
        {
            return name + "'" + (name.slice(-1) === "s" ? "" : "s");
        }

        function exit_reason_message(reason, watched_name)
        {
            if (watched_name)
            {
                switch (reason)
                {
                case "quit":
                case "won":
                case "bailed out":
                case "dead":
                    return null;
                case "cancel":
                    return watched_name + " quit before creating a character.";
                case "saved":
                    return watched_name + " stopped playing (saved).";
                case "crash":
                    return possessive(watched_name) + " game crashed.";
                case "error":
                    return possessive(watched_name)
                           + " game was terminated due to an error.";
                case "disconnect":
                    return watched_name + " has been disconnected.";
                default:
                    return possessive(watched_name) + " game ended unexpectedly."
                           + (reason != "unknown" ? " (" + reason + ")" : "");
                }
            }
            else
            {
                switch (reason)
                {
                case "quit":
                case "won":
                case "bailed out":
                case "dead":
                case "saved":
                case "cancel":
                    return null;
                case "crash":
                    return "Unfortunately your game crashed.";
                case "error":
                    return "Unfortunately your game terminated due to an error.";
                case "disconnect":
                    return "You have been disconnected.";
                default:
                    return "Unfortunately your game ended unexpectedly."
                           + (reason != "unknown" ? " (" + reason + ")" : "");
                }
            }
        }

        function show_exit_dialog(reason, message, dump, watched_name)
        {
            if (reason !== "crash" && reason !== "error") $("#game_recovery").prop("hidden", true);
            var reason_msg = exit_reason_message(reason, watched_name);
            if (reason_msg != null)
                $("#exit_game_reason").text(reason_msg).show();
            else
                $("#exit_game_reason").hide();

            if (message)
                $("#exit_game_message").text(message.replace(/\s+$/, "")).show();
            else
                $("#exit_game_message").hide();

            if (dump && !/^None|^null/i.test(dump))
            {
                var a = $("<a>").attr("target", "_blank")
                                .attr("href", dump + ".txt");
                if (reason === "saved")
                    a.text("Character dump");
                else if (reason === "crash" || reason === "error")
                    a.text("Crash log");
                else
                    a.text("Morgue file");
                $("#exit_game_dump").html(a).show();
            }
            else
                $("#exit_game_dump").hide();

            show_dialog("#exit_game");
        }

        function force_terminate_no()
        {
            send_message("force_terminate", { answer: false });
            hide_dialog();
        }

        function force_terminate_yes()
        {
            send_message("force_terminate", { answer: true });
            hide_dialog();
        }

        function handle_stale_processes(data)
        {
            $(".game_name").html(data.game);
            $(".recover_timeout").html("" + data.timeout);
            show_dialog("#stale_processes_message");
        }

        function handle_force_terminate(data)
        {
            show_dialog("#force_terminate");
        }

        return {
            show_prompt: show_prompt,
            hide_prompt: hide_prompt,
            set_layer: set_layer,
            register_layer: register_layer,
            show_dialog: show_dialog,
            center_element: center_element,
            hide_dialog: hide_dialog,
            handle_dialog: handle_dialog,
            possessive: possessive,
            exit_reason_message: exit_reason_message,
            show_exit_dialog: show_exit_dialog,
            force_terminate_no: force_terminate_no,
            force_terminate_yes: force_terminate_yes,
            handle_stale_processes: handle_stale_processes,
            handle_force_terminate: handle_force_terminate
        };
    };
});
