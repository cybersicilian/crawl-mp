/* Socket codec and session recovery; native state is always refreshed on reconnect. */
define(["jquery", "socket-lifecycle", "connection-quality"], function ($, createSocket, quality) {
    "use strict";
    return function create(api, state, transport) {
        var reconnecting = false, gameRetry;
        function status(message) {
            var element = $("#connection_status");
            if (!element.length) {
                element = $('<div id="connection_status" role="status" aria-live="polite"></div>')
                    .css({ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100000,
                        padding: "12px 20px", background: "#30251c", color: "#fff1d2",
                        textAlign: "center", borderBottom: "1px solid #b99555" }).appendTo("body");
            }
            element.text(message);
        }
        function deliver(text, bytes) {
            if (window.log_messages === 2) console.log("Message: " + text);
            if (window.log_message_size)
                console.log("Message size: " + text.length
                    + (bytes === undefined ? "" : " (compressed " + bytes + ")"));
            transport.enqueue_messages(text);
        }
        var lifecycle = createSocket({
            create: function () {
                if ("MozWebSocket" in window) window.WebSocket = window.MozWebSocket;
                // Native WebSocket compression avoids main-thread JS inflation,
                // including Safari. Older servers select the text fallback.
                var current = new window.WebSocket(socket_server, $.cookie("no-compression")
                    ? "no-compression" : ["native-deflate-v1", "no-compression"]);
                window.socket = current;
                current.binaryType = "arraybuffer";
                return current;
            },
            connected: function (current) {
                state.connection_lost = false;
                state.showing_close_message = false;
                $("#connection_status").remove();
                if (reconnecting) {
                    api.cleanup();
                    transport.reset();
                    state.playing = false;
                    state.current_user = null;
                    state.admin_user = false;
                }
                current.send('{"msg":"transport_hello","version":1}');
                quality.connected(current);
                window.onhashchange = api.hash_changed;
                state.current_hash = null;
                state.logging_in = false;
                api.start_login();
                if (!state.logging_in) api.hash_changed();
                reconnecting = false;
            },
            disconnected: function (event, delay) {
                $(document).trigger("game_connection_lost");
                quality.disconnected();
                clearTimeout(gameRetry);
                gameRetry = undefined;
                if (!state.reconnecting) state.reconnect_started = Date.now();
                state.reconnecting = true;
                if (!reconnecting && state.watching && state.party_member_active) {
                    window.pending_auto_join_party = true;
                    window.pending_auto_join_slot = state.party_slot;
                }
                reconnecting = true;
                state.connection_lost = true;
                transport.reset();
                status(delay === undefined
                    ? "Connection closed. " + (event.reason || "Reload to connect again.")
                    : "Connection interrupted. Reconnecting automatically…");
            },
            heartbeat: function (current) { current.send('{"msg":"ping"}'); },
            message: function (event) { deliver(event.data); }
        });

        return {
            connect: function () {
                if (!("WebSocket" in window) && !("MozWebSocket" in window)) {
                    lifecycle.stop();
                    api.set_layer("crt");
                    $("#crt").text("Your browser does not support WebSockets.");
                    return;
                }
                lifecycle.connect();
            },
            stop: function () { clearTimeout(gameRetry); quality.disconnected(); lifecycle.stop(); },
            wait_for_game: function () {
                if (!state.reconnecting || gameRetry !== undefined) return;
                if (Date.now() - state.reconnect_started > 90000) {
                    status("The previous connection is still active. Reload to try again.");
                    return;
                }
                status("Reconnecting to your expedition…");
                gameRetry = setTimeout(function () {
                    gameRetry = undefined;
                    state.current_hash = null;
                    api.hash_changed();
                }, 1000);
            },
            finish_recovery: function () {
                clearTimeout(gameRetry);
                gameRetry = undefined;
                state.reconnecting = false;
                $("#connection_status").remove();
            }
        };
    };
});
