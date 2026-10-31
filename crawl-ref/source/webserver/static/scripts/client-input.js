/* Native keyboard translation and spectator / party input ownership.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "chat", "comm", "key_conversion"], function ($, chat, comm, key_conversion) {
    return function create(api, state) {
        var send_message = comm.send_message;

        function handle_keypress(e)
        {
            if (!api.in_game()) return;
            if ($(document.activeElement).hasClass("text")) return;

            // Fix for FF < 25:
            // https://developer.mozilla.org/en-US/docs/Web/Reference/Events/keydown#preventDefault%28%29_of_keydown_event
            if (e.isDefaultPrevented()) return;

            if (e.ctrlKey || e.altKey)
            {
                // allow AltGr keys on various non-english keyboard layouts, not
                // needed for Mozilla where neither ctrlKey or altKey is set
                if ($.browser.mozilla || !e.ctrlKey || !e.altKey)
                {
                    //log("CTRL key: " + e.ctrlKey + " " + e.which
                    //    + " " + String.fromCharCode(e.which));
                    return;
                }
            }

            if ((e.which == 0) ||
                (e.which == 8) || /* Backspace gets a keypress in FF, but not Chrome
                                     so we handle it in keydown */
                (e.which == 9))   /* Tab gives a keypress in Opera even when it is
                                     suppressed in keydown */
            {
                return;
            }

            // Give the game a chance to handle the key
            if (!retrigger_event(e, "game_keypress"))
                return;

            if (state.watching && !state.party_member_active)
                return;

            e.preventDefault();

            var s = String.fromCharCode(e.which);
            if (s == "{")
            {
                send_bytes(["{".charCodeAt(0)]);
            }
            else
                send_message("input", { text: s });
        }

        function send_keycode(code)
        {
            send_message("key", { keycode: code });
        }

        function send_bytes(bytes)
        {
            send_message("input", { data: bytes });
        }

        function retrigger_event(ev, new_type)
        {
            var new_ev = $.extend({}, ev);
            new_ev.type = new_type;
            $(new_ev.target).trigger(new_ev);
            if (new_ev.isDefaultPrevented())
                ev.preventDefault();
            if (new_ev.isPropagationStopped())
            {
                ev.stopImmediatePropagation();
                return false;
            }
            else
                return true;
        }

        function handle_keydown(e)
        {
            if ($("#stale_processes_message").is(":visible"))
            {
                e.preventDefault();
                send_message("stop_stale_process_purge");
                api.hide_dialog();
                return;
            }
            if ($("#force_terminate").is(":visible"))
            {
                e.preventDefault();
                if (e.which == "y".charCodeAt(0))
                    api.force_terminate_yes();
                else
                    api.force_terminate_no();
                return;
            }

            if (!api.in_game())
            {
                if (e.which == 27)
                {
                    api.hide_lobby_tooltip();
                    e.preventDefault();
                    api.hide_dialog();
                }
                return;
            }
            if ($(document.activeElement).hasClass("text")) return;

            // supposedly `e.code` is defined on some jquery versions? not ours,
            // though.
            var code = e.originalEvent.code ? e.originalEvent.code : e.code;

            // normalize numpad keycodes for the sake of shift and ctrl mappings.
            // This is because sometimes, for some events, browsers will send the
            // non-numpad keycode for digits, and we want to consistently convert
            // modified numpad codes. This is independent of key_conversion.codes.
            // useful tool: https://keyjs.dev/#keyboard-events-inspector
            if (code && (e.which >= 48 && e.which <= 57))
            {
                switch (code)
                {
                    case "Numpad0": e.which = 96; break;
                    case "Numpad1": e.which = 97; break;
                    case "Numpad2": e.which = 98; break;
                    case "Numpad3": e.which = 99; break;
                    case "Numpad4": e.which = 100; break;
                    case "Numpad5": e.which = 101; break;
                    case "Numpad6": e.which = 102; break;
                    case "Numpad7": e.which = 103; break;
                    case "Numpad8": e.which = 104; break;
                    case "Numpad9": e.which = 105; break;
                    default: break;
                }
            }

            // Give the game a chance to handle the key
            if (!retrigger_event(e, "game_keydown"))
                return;

            if (state.watching && !state.party_member_active)
            {
                if (!e.ctrlKey && !e.shiftKey && !e.altKey)
                {
                   if (e.which == 27)
                    {
                        e.preventDefault();
                        location.hash = "#lobby";
                    }
                    else if (e.which == 123) // F12
                    {
                        e.preventDefault();
                        chat.focus();
                    }
                }
                return;
            }

            if (e.ctrlKey && !e.shiftKey && !e.altKey)
            {
                if (e.which in key_conversion.ctrl)
                {
                    e.preventDefault();
                    send_keycode(key_conversion.ctrl[e.which]);
                }
                else if ($.inArray(String.fromCharCode(e.which),
                                   key_conversion.captured_control_keys) != -1)
                {
                    e.preventDefault();
                    var code = e.which - "A".charCodeAt(0) + 1; // Compare the CONTROL macro in defines.h
                    send_keycode(code);
                }
            }
            else if (!e.ctrlKey && e.shiftKey && !e.altKey)
            {
                if (e.which in key_conversion.shift)
                {
                    e.preventDefault();
                    send_keycode(key_conversion.shift[e.which]);
                }
            }
            else if (e.ctrlKey && e.shiftKey && !e.altKey)
            {
                if (e.which in key_conversion.ctrlshift)
                {
                    e.preventDefault();
                    send_keycode(key_conversion.ctrlshift[e.which]);
                }
            }
            else if (!e.ctrlKey && !e.shiftKey && e.altKey)
            {
                if (e.which < 32) return;

                e.preventDefault();
                send_bytes([27, e.which]); // XX ???
            }
            else if (!e.ctrlKey && !e.shiftKey && !e.altKey)
            {
                if (e.which == 123
                    || code && code == "F12") // probably unncessesary for now
                {
                    e.preventDefault();
                    chat.focus();
                }
                else if (key_conversion.codes // <- cache safety, remove someday
                    && key_conversion.code_conversion_enabled()
                    && code && code in key_conversion.codes)
                {
                    e.preventDefault();
                    send_keycode(key_conversion.codes[code]);
                }
                else if (e.which in key_conversion.simple)
                {
                    e.preventDefault();
                    send_keycode(key_conversion.simple[e.which]);
                }
                else if (e.which in key_conversion.legacy)
                {
                    // for current versions, these should be entirely shadowed.
                    // pre-0.27: values here are used, see comments in
                    // key_conversion.js
                    // 0.27-0.28: game.js set these values in key_conversion.simple
                    // 0.29 onwards: key_conversion.codes preempts all of these
                    e.preventDefault();
                    send_keycode(key_conversion.legacy[e.which]);
                }
                // else
                //    log("Unhandled key: " + e.which + ", " + code);
            }
        }

        return {
            handle_keypress: handle_keypress,
            send_keycode: send_keycode,
            send_bytes: send_bytes,
            retrigger_event: retrigger_event,
            handle_keydown: handle_keydown
        };
    };
});
