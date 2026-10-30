/* Sign-in, session cookies, account bindings and administrator controls.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "chat", "comm", "graphics-preferences"], function ($, chat, comm, graphics) {
    return function create(api, state) {
        var send_message = comm.send_message;

        function start_login()
        {
            $(".welcome-entry").removeClass("signed-in");
            if (get_login_cookie())
            {
                $("#login_form").hide();
                $("#reg_link").hide();
                $("#forgot_link").hide();
                $("#login_message").html("Logging in...");
                state.logging_in = send_message("token_login", {
                    cookie: get_login_cookie()
                });
            }
            else
                $("#username").focus();
        }

        function login()
        {
            var username = ($("#username").val() || "").trim();
            var password = $("#password").val();
            if (!username || !password) {
                $("#login_message").text("Enter your username and password.");
                $(username ? "#password" : "#username").focus();
                return false;
            }
            if (!send_message("login", {
                username: username,
                password: password
            })) {
                $("#login_message").text("Waiting for a connection…");
                return false;
            }
            state.logging_in = true;
            $("#login_form").hide();
            $("#reg_link").hide();
            $("#forgot_link").hide();
            $("#login_message").html("Logging in...");
            return false;
        }

        function auth_error(data)
        {
            var reason = data.reason;
            if (reason)
                $("#login_message").html(reason);
            else
                $("#login_message").html("Login failed.");
        }

        function login_failed(data)
        {
            state.logging_in = false;
            set_login_cookie(null);
            auth_error(data);
            $("#login_form").show();
            $(".welcome-entry").removeClass("signed-in");
            $("#party_lobby_panel").hide();
            $("#reg_link").show();
            $("#forgot_link").show();
            state.current_user = null;
            graphics.bindUser(null);
            state.admin_user = false;
            api.set_layer("lobby");
        }

        function logged_in(data)
        {
            state.logging_in = false;
            var username = data.username;
            api.hide_prompt();
            $("#login_message").html("Logged in as " + username);
            state.current_user = username;
            graphics.bindUser(null);
            state.admin_user = data.admin;
            api.hide_dialog();
            $("#login_form").hide();
            $(".welcome-entry").addClass("signed-in");
            $("#password").val("");
            $("#party_lobby_panel").show();
            $("#reg_link").hide();
            $("#forgot_link").hide();
            $('#chem_link').show();
            $('#chpw_link').show();
            $("#logout_form").show();

            chat.reset_visibility(true);
            $("#chat_input").show();
            $("#chat_login_text").hide();
            if (state.admin_user)
                $("#admin_panel_button").show();
            else
                $("#admin_panel_button").hide();

            send_message("set_login_cookie");
            send_message("party_lobby_list");
            api.render_party_lobby();

            if (!state.watching)
            {
                state.current_hash = null;
                api.hash_changed();
            }
        }

        function set_login_cookie(data)
        {
            if (data) {
                $.cookie("login", data.cookie, { expires: data.expires });
                graphics.bindUser(state.current_user); graphics.refresh();
                if (new URLSearchParams(location.search).get("graphics") === "1") location.replace("/settings/graphics");
            }
            else
                $.cookie("login", null);
        }

        function get_login_cookie()
        {
            return $.cookie("login");
        }

        function handle_logout(data)
        {
            logout(false);
            auth_error(data);
        }

        function logout(force_reload=true)
        {
            if (get_login_cookie())
            {
                send_message("forget_login_cookie", {
                    cookie: get_login_cookie()
                });
                set_login_cookie(null);
            }
            state.current_user = null;
            graphics.bindUser(null);
            state.admin_user = false;
            $("#login_form").show();
            $(".welcome-entry").removeClass("signed-in");
            $("#party_lobby_panel").hide();
            $("#reg_link").show();
            $("#forgot_link").show();
            $('#chem_link').hide();
            $('#chpw_link').hide();
            $("#logout_form").hide();
            $("#account_restricted").hide();
            $("#play_now").html("");

            $("#admin_panel_button").hide();
            $("#admin_panel").hide();
            // unless this results from a player click directly, it'll prompt the
            // player. So we skip it for a logout message from the server. This
            // *should* be ok, maybe with some glitches.
            if (force_reload)
                location.reload();
        }

        function toggle_admin_panel()
        {
            if (state.admin_user)
                $("#admin_panel").toggle();
        }

        function admin_announce()
        {
            var text = $("#announcement_text").val();
            if (text.length > 0)
            {
                send_message("admin_announce", {text: text});
                $("#announcement_text").val('');
            }
        }

        function admin_pw_reset()
        {
            var username = $("#admin_username").val();
            if (username.length == 0)
                admin_log_msg("No username provided!");
            else
                send_message("admin_pw_reset", {username: username});
        }

        function admin_pw_reset_done(data)
        {
            if (data.error)
                admin_log_msg("Password reset failed: " + data.error);
            else
            {
                admin_log_msg("Password reset token set for " + data.username);
                $("#ok_message_content").html("<div><span><b>Password reset info:</b></span></div>");
                $("#ok_message_content").append("<div><span>Username: " + data.username + "</span></div>");
                $("#ok_message_content").append("<div><span>User email: <tt>" + data.email + "</tt></span></div>");
                $("#ok_message_content").append("<div>Message to send:<pre>" + data.email_body + "</pre></div>");
                api.show_dialog("#floating_ok_message");
            }
        }

        function admin_pw_reset_clear()
        {
            var username = $("#admin_username").val();
            if (username.length == 0)
                admin_log_msg("No username provided!");
            else
            {
                admin_log_msg("Password reset token cleared for " + username);
                send_message("admin_pw_reset_clear", {username: username});
            }
        }

        function admin_log_msg(text)
        {
            $("#admin_panel_log").append(
                '<div><span>' + text + "</span></div>");
        }

        function admin_log(data)
        {
            admin_log_msg(data.text);
        }

        function server_announcement(data)
        {
            var text = '<span class="fg5">Serverwide announcement: </span><span>'
                + data.text + '</span>';
            chat.show_in_chat(text);
        }

        function bind_account_events()
        {
            $("#login_form").bind("submit", login);

            $("#chat_login_link").bind("click", api.chat_login);

            $("#reg_link").bind("click", api.start_register);

            $("#register_form").bind("submit", api.register);

            $("#reg_cancel").bind("click", api.cancel_register);

            $("#chem_link").bind("click", api.ask_change_email);

            $("#chem_form").bind("submit", api.change_email);

            $("#chem_cancel").bind("click", api.cancel_change_email);

            $("#chpw_link").bind("click", api.ask_change_password);

            $("#chpw_form").bind("submit", api.change_password);

            $("#chpw_cancel").bind("click", api.cancel_change_password);

            $("#floating_ok_message input").bind("click", api.hide_dialog);

            $("#forgot_link").bind("click", api.start_forgot_password);

            $("#forgot_form").bind("submit", api.forgot_password);

            $("#forgot_cancel").bind("click", api.cancel_forgot_password);

            $("#forgot_2 input").bind("click", api.hide_dialog);

            if ( $("#reset_pw").length )
            {
                $("#reset_pw_cancel").bind("click", api.cancel_reset_password);
                $("#reset_pw_form").bind("submit", api.reset_password);
            }

            $("#rc_edit_form").bind("submit", api.send_rc);

            $("#force_terminate_no").click(api.force_terminate_no);

            $("#force_terminate_yes").click(api.force_terminate_yes);

            $("#admin_panel_button").click(toggle_admin_panel);

            $("#announcement_submit").click(admin_announce);

            $("#admin_pw_reset").click(admin_pw_reset);

            $("#admin_pw_reset_clear").click(admin_pw_reset_clear);
        }

        return {
            start_login: start_login,
            login: login,
            auth_error: auth_error,
            login_failed: login_failed,
            logged_in: logged_in,
            set_login_cookie: set_login_cookie,
            get_login_cookie: get_login_cookie,
            handle_logout: handle_logout,
            logout: logout,
            toggle_admin_panel: toggle_admin_panel,
            admin_announce: admin_announce,
            admin_pw_reset: admin_pw_reset,
            admin_pw_reset_done: admin_pw_reset_done,
            admin_pw_reset_clear: admin_pw_reset_clear,
            admin_log_msg: admin_log_msg,
            admin_log: admin_log,
            server_announcement: server_announcement,
            bind_account_events: bind_account_events
        };
    };
});
