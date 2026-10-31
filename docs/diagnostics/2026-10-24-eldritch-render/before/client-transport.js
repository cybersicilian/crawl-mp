/* Socket decoding, message queue and versioned native-client loading.
 * Session state and cross-feature callbacks are supplied by client.js. */
define(["jquery", "comm", "game-loading", "client-connection", "state-stream"], function ($, comm, loading, connectionFactory, createStateStream) {
    return function create(api, state) {
        var delay_timeout = undefined;

        var message_inhibit = 0;

        var message_queue = [];
        var queue_head = 0;
        var draining = false;
        var drain_timeout;
        var fast_forward = false;

        var game_version = null;

        var loaded_modules = null;

        var generation = 0, load_interval;
        var state_stream = createStateStream(function (channel) {
            comm.send_message("transport_resync", { channel: channel });
        });

        function handle_message(msg)
        {
            if (typeof msg === "string")
            {
                // Javascript code
                eval(msg);
            }
            else
            {
                comm.handle_message(msg);
            }
        }

        function enqueue_messages(msgtext)
        {
            if (msgtext.match(/^{/))
            {
                // JSON message
                var msgobj;
                try
                {
                    try { msgobj = JSON.parse(msgtext); }
                    catch (legacy_error) {
                        // 0.11 and older can send non-standard JSON.
                        msgobj = eval("(" + msgtext + ")");
                    }
                }
                catch (e)
                {
                    console.error("Parsing error:", e);
                    console.error("Source message:", msgtext);
                    return;
                }
                var msgs = msgobj.msgs;
                if (msgs == null)
                    msgs = [ msgobj ];
                for (var i in msgs)
                {
                    if (window.log_messages && window.log_messages !== 2)
                        console.log("Message: " + msgs[i].msg, msgs[i]);
                    if (!comm.handle_message_immediately(msgs[i]))
                        message_queue.push(msgs[i]);
                }
            }
            else
            {
                // Javascript code
                message_queue.push(msgtext);
            }
            handle_message_backlog();
        }

        function handle_message_backlog()
        {
            if (draining) return;
            clearTimeout(drain_timeout);
            drain_timeout = undefined;
            draining = true;
            var started = Date.now();
            try {
                while (queue_head < message_queue.length
                       && message_inhibit === 0 && delay_timeout === undefined)
                {
                    var msg = message_queue[queue_head++];
                    if (window.debug_mode)
                    {
                        handle_message(msg);
                    }
                    else
                    {
                        try
                        {
                            handle_message(msg);
                        }
                        catch (err)
                        {
                            console.error("Error in message:", msg);
                            console.error(err.message);
                            console.error(err.stack);
                        }
                    }
                    // Give key events a turn when a large update backlog arrives.
                    if (!fast_forward && Date.now() - started >= 8) break;
                }
            } finally {
                message_queue = message_queue.slice(queue_head);
                queue_head = 0;
                draining = false;
                if (message_queue.length && message_inhibit === 0 && delay_timeout === undefined)
                    drain_timeout = setTimeout(handle_message_backlog, 0);
            }
        }

        function inhibit_messages()
        {
            message_inhibit++;
        }

        function uninhibit_messages()
        {
            if (message_inhibit > 0)
                message_inhibit--;
            handle_message_backlog();
        }

        function delay(ms)
        {
            if (!fast_forward && (!document.hidden))
            {
                clearTimeout(delay_timeout);
                delay_timeout = setTimeout(delay_ended, ms);
            }
        }

        function delay_ended()
        {
            clearTimeout(delay_timeout);
            delay_timeout = undefined;
            handle_message_backlog();
        }

        function interrupt_delay(msg)
        {
            if (["key", "input", "text_input", "click_cell", "power_action",
                 "inv_item_use", "inv_item_action", "floor_item_action", "main_menu_action",
                 "switch_player", "cycle_player"].indexOf(msg) === -1) return;
            if (delay_timeout === undefined) return;
            clearTimeout(delay_timeout);
            delay_timeout = undefined;
            // Catch up queued animation frames without bypassing client loading.
            fast_forward = true;
            try { handle_message_backlog(); }
            finally { fast_forward = false; }
        }
        comm.register_send_listener(interrupt_delay);
        comm.register_handlers({ state_frame: function (frame) {
            var state = state_stream.accept(frame);
            if (state) comm.handle_message(state);
        }, transport_ready: function () {} });

        requirejs.onResourceLoad = function (context, map, depArray) {
            if (loaded_modules != null)
                loaded_modules.push(map.id);
        }

        function receive_game_client(data)
        {
            if (game_version == null || data["version"] != game_version)
            {
                $(document).off();
                api.bind_document_events();
                for (var i in loaded_modules)
                    requirejs.undef(loaded_modules[i]);
                loaded_modules = [];
            }
            game_version = data["version"];

            var client_generation = generation;
            inhibit_messages();
            // Older versioned clients retain their native loader contract.
            if (data.content.indexOf('data-loading-readiness="dungeon"') !== -1)
                loading.begin();
            else
                loading.cancel();
            api.show_loading_screen();
            delete window.game_loading;
            $("#game").html(data.content);
            if (data.content.indexOf("game_loading") === -1)
            {
                // old version, uninhibit can happen too early
                $("#game").waitForImages(function () {
                    if (generation === client_generation) uninhibit_messages();
                });
            }
            else
            {
                $("#game").waitForImages(function ()
                {
                    if (generation !== client_generation) return;
                    loading.mark("assets");
                    load_interval = setInterval(check_loading, 50);

                    function check_loading()
                    {
                        if (generation !== client_generation) return;
                        if (window.game_loading)
                        {
                            delete window.game_loading;
                            uninhibit_messages();
                            clearInterval(load_interval);
                        }
                    }
                });
            }
        }

        function handle_multi_message(data)
        {
            message_queue = message_queue.slice(0, queue_head).concat(
                data.msgs, message_queue.slice(queue_head));
        }

        function reset()
        {
            state_stream.reset();
            generation++;
            clearTimeout(delay_timeout);
            clearTimeout(drain_timeout);
            clearInterval(load_interval);
            delay_timeout = drain_timeout = load_interval = undefined;
            message_queue = [];
            queue_head = message_inhibit = 0;
            game_version = null;
            loading.cancel();
        }

        var connection = connectionFactory(api, state, {
            enqueue_messages: enqueue_messages,
            reset: reset
        });

        return {
            handle_message: handle_message,
            enqueue_messages: enqueue_messages,
            handle_message_backlog: handle_message_backlog,
            inhibit_messages: inhibit_messages,
            uninhibit_messages: uninhibit_messages,
            delay: delay,
            delay_ended: delay_ended,
            receive_game_client: receive_game_client,
            handle_multi_message: handle_multi_message,
            reset_transport: reset,
            connect: connection.connect,
            stop_connection: connection.stop,
            wait_for_game: connection.wait_for_game,
            finish_recovery: connection.finish_recovery
        };
    };
});
