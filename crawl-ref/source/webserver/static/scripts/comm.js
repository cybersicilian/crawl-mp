define(["jquery", "contrib/jquery.json"], function ($) {
    window.socket = null;
    var send_listeners = [];
    var send_filters = [];

    function send_message(msg, data)
    {
        var current = window.socket;
        // Commands are never replayed after a disconnect: they may spend turns.
        if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
        if (!current || current.readyState !== 1) return false;
        data = data || {};
        if (send_filters.some(function (filter) { return filter(msg, data) === false; })) return false;
        data["msg"] = msg;
        send_listeners.forEach(function (listener) { listener(msg); });
        if (current !== window.socket || current.readyState !== 1) return false;
        try { current.send(JSON.stringify(data)); }
        catch (error) {
            if (error.name !== "InvalidStateError" && error.name !== "NetworkError") throw error;
            return false;
        }
        return true;
    }

    // JSON message handlers
    var message_handlers = {};
    var immediate_handlers = {};

    function register_message_handlers(dict)
    {
        $.extend(message_handlers, dict);
    }

    function register_immediate_handlers(dict)
    {
        $.extend(immediate_handlers, dict);
    }

    function handle_message(msg)
    {
        var handler = message_handlers[msg.msg];
        if (!handler)
        {
            console.error("Unknown message type: " + msg.msg);
            return;
        }
        handler(msg);
    }

    function handle_message_immediately(msg)
    {
        var handler = immediate_handlers[msg.msg];
        if (handler)
        {
            return handler(msg);
        }
        else
            return false;
    }

    return {
        send_message: send_message,
        register_send_listener: function (listener) { send_listeners.push(listener); },
        register_send_filter: function (filter) {
            send_filters.push(filter);
            return function () { send_filters = send_filters.filter(function (entry) { return entry !== filter; }); };
        },
        register_handlers: register_message_handlers,
        register_immediate_handlers: register_immediate_handlers,
        handle_message: handle_message,
        handle_message_immediately: handle_message_immediately,
    };
});
