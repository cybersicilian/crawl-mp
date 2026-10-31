/* Registration, account email/password and password-recovery dialogs.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "comm"], function ($, comm) {
    return function create(api, state) {
        var send_message = comm.send_message;

        function start_register()
        {
            $("#register_message").html("");
            api.show_dialog("#register");
            $("#reg_username").focus();
        }

        function cancel_register()
        {
            api.hide_dialog();
        }

        function register()
        {
            var username = $("#reg_username").val();
            var password = $("#reg_password").val();
            var password_repeat = $("#reg_repeat_password").val();
            var email = $("#reg_email").val();

            if (username.indexOf(" ") >= 0)
            {
                $("#register_message").html("The username can't contain spaces.");
                return false;
            }

            if (password !== password_repeat)
            {
                $("#register_message").html("Passwords don't match.");
                return false;
            }

            send_message("register", {
                username: username,
                password: password,
                email: email
            });

            return false;
        }

        function register_failed(data)
        {
            $("#register_message").html(data.reason);
        }

        function ask_change_password()
        {
            send_message("start_change_password");
        }

        function start_change_password(data)
        {
            $("#chpw_message").html("");
            api.show_dialog("#change_password");
            $("#change_cur_password").focus();
        }

        function cancel_change_password()
        {
            api.hide_dialog();
        }

        function change_password_done(data)
        {
            $("#ok_message_content").html("Password changed!");
            api.show_dialog("#floating_ok_message");
        }

        function change_password()
        {
            var cur_password = $("#change_cur_password").val();
            var new_password = $("#change_new_password").val();
            var new_password_repeat = $("#change_repeat_password").val();

            if (new_password !== new_password_repeat)
            {
                $("#chpw_message").html("Passwords don't match.");
                return false;
            }

            send_message("change_password", {
                cur_password: cur_password,
                new_password: new_password,
            });

            return false;
        }

        function change_password_failed(data)
        {
            var msg = "Password change failed!";
            if (data.reason)
                msg = msg + " " + data.reason;
            $("#ok_message_content").html(msg);
            api.show_dialog("#floating_ok_message");
        }

        function ask_change_email()
        {
            send_message("start_change_email");
        }

        function start_change_email(data)
        {
            $("#chem_current").html(data.email);
            $("#chem_message").html("");
            api.show_dialog("#change_email");
            $("#chem_email").focus();
        }

        function cancel_change_email()
        {
            api.hide_dialog();
        }

        function change_email()
        {
            var email = $("#chem_email").val();

            send_message("change_email", {
                email: email
            });

            return false;
        }

        function change_email_failed(data)
        {
            $("#chem_message").html(data.reason);
        }

        function change_email_done(data)
        {
            if ( data.email == "" )
            {
                $("#ok_message_content").html("Your account is no longer associated with an email address.");
            }
            else
            {
                $("#ok_message_content").html("Your email address has been set to " + data.email + ".");
            }

            api.show_dialog("#floating_ok_message");
        }

        function start_forgot_password()
        {
            $("#forgot_message").html("");
            api.show_dialog("#forgot");
            $("#forgot_email").focus();
        }

        function cancel_forgot_password()
        {
            api.hide_dialog();
        }

        function forgot_password()
        {
            var email = $("#forgot_email").val();

            if (email.indexOf(" ") >= 0)
            {
                $("#forgot_message").html("The email address can't contain spaces.");
                return false;
            }

            send_message("forgot_password", {
                email: email
            });

            return false;
        }

        function forgot_password_failed(data)
        {
            $("#forgot_message").html(data.reason);
        }

        function forgot_password_done()
        {
            api.show_dialog("#forgot_2");
        }

        function reset_password()
        {
            var token = $("#reset_pw_token").val();
            var password = $("#reset_pw_password").val();
            var password_repeat = $("#reset_pw_repeat_password").val();

            if (password !== password_repeat)
            {
                $("#reset_pw_message").html("Passwords don't match.");
                return false;
            }

            send_message("reset_password", {
                token: token,
                password: password
            });

            return false;
        }

        function cancel_reset_password()
        {
            api.do_reload_url()
        }

        function reset_password_failed(data)
        {
            $("#reset_pw_message").html(data.reason);
        }

        // Non-blocking confirmation feedback while typing; submission still
        // performs the authoritative comparison above.
        var confirmations = [
            ["#reg_password", "#reg_repeat_password", "#reg_repeat_hint"],
            ["#change_new_password", "#change_repeat_password", "#chpw_repeat_hint"],
            ["#reset_pw_password", "#reset_pw_repeat_password", "#reset_pw_repeat_hint"]
        ];

        function bind_password_confirmation()
        {
            confirmations.forEach(function (pair) {
                var first = $(pair[0]), repeat = $(pair[1]), hint = $(pair[2]);
                if (!first.length || !repeat.length || !hint.length) return;
                function refresh()
                {
                    var a = first.val() || "", b = repeat.val() || "";
                    hint.removeClass("is-mismatch is-match");
                    repeat.removeAttr("aria-invalid");
                    if (!b) { hint.text(""); return; }
                    if (a === b) { hint.addClass("is-match").text("Passwords match."); return; }
                    if (a.indexOf(b) === 0) { hint.text("Keep typing…"); return; }
                    hint.addClass("is-mismatch").text("These passwords don't match yet.");
                    repeat.attr("aria-invalid", "true");
                }
                first.on("input", refresh);
                repeat.on("input", refresh);
            });
        }

        $(bind_password_confirmation);

        return {
            start_register: start_register,
            bind_password_confirmation: bind_password_confirmation,
            cancel_register: cancel_register,
            register: register,
            register_failed: register_failed,
            ask_change_password: ask_change_password,
            start_change_password: start_change_password,
            cancel_change_password: cancel_change_password,
            change_password_done: change_password_done,
            change_password: change_password,
            change_password_failed: change_password_failed,
            ask_change_email: ask_change_email,
            start_change_email: start_change_email,
            cancel_change_email: cancel_change_email,
            change_email: change_email,
            change_email_failed: change_email_failed,
            change_email_done: change_email_done,
            start_forgot_password: start_forgot_password,
            cancel_forgot_password: cancel_forgot_password,
            forgot_password: forgot_password,
            forgot_password_failed: forgot_password_failed,
            forgot_password_done: forgot_password_done,
            reset_password: reset_password,
            cancel_reset_password: cancel_reset_password,
            reset_password_failed: reset_password_failed
        };
    };
});
