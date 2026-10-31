define(["jquery", "comm", "latency-monitor"], function ($, comm, createMonitor) {
    "use strict";
    var node, latest = { status: "measuring" };
    function mount() {
        if (!node) {
            node = document.createElement("span"); node.id = "connection_quality";
            node.className = "connection-quality"; node.tabIndex = 0;
            node.setAttribute("role", "img"); node.setAttribute("data-tip-live", "");
            node.innerHTML = '<span class="connection-quality-dot" aria-hidden="true"></span><span class="connection-quality-value"></span>';
            $(node).on("keydown keypress keyup click", function (event) {
                if (event.key !== "Tab") event.stopPropagation();
            });
        }
        var parent = ["party_progress", "party_turn_banner", "lobby_navigation"].map(function (id) {
            return document.getElementById(id);
        }).find(function (element) { return element && $(element).is(":visible"); }) || document.body;
        if (node.parentNode !== parent) parent.appendChild(node);
        var connected = latest.status === "connected", ms = Math.round(latest.milliseconds || 0);
        var label = connected ? ms + " ms" : latest.status === "waiting" ? ">5 s"
            : latest.status === "disconnected" ? (navigator.onLine === false ? "Offline" : "Reconnecting") : "Ping…";
        node.dataset.connection = connected ? ms < 100 ? "good" : ms < 250 ? "fair" : "slow" : latest.status;
        node.querySelector(".connection-quality-value").textContent = label;
        var description = connected ? "Network round trip: " + ms + " ms. Recent jitter: " + Math.round(latest.jitter) + " ms."
            : latest.status === "waiting" ? "The server has not answered the latest probe within five seconds."
            : latest.status === "disconnected" ? "The connection is unavailable. Recovery happens automatically." : "Measuring the network round trip.";
        if (latest.bufferedBytes) description += " Queued outgoing data: " + latest.bufferedBytes + " bytes.";
        description += " Updated every five seconds. Echoes the web server without waiting for a game turn or screen paint.";
        node.title = description;
        node.setAttribute("aria-label", "Connection: " + label);
        node.setAttribute("data-tip-title", "Connection · " + label);
        node.setAttribute("data-tip-body", description);
    }
    var monitor = createMonitor(function (value) { latest = value; mount(); });
    comm.register_immediate_handlers({ transport_pong: monitor.receive });
    function bind() {
        $(document).off(".connectionQuality").on("game_init.connectionQuality game_cleanup.connectionQuality game_layer_changed.connectionQuality", function () {
            window.requestAnimationFrame(mount);
        }).on("visibilitychange.connectionQuality", function () { if (!document.hidden) monitor.probe(); });
    }
    return { connected: monitor.start, disconnected: monitor.stop, bind: bind };
});
