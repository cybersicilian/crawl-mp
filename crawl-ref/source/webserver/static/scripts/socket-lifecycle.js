/* One connection, bounded retries and liveness checks. No application input queue. */
define([], function () {
    "use strict";
    return function create(options) {
        var socket, retry, watchdog, deadline, stable;
        var stopped = false, attempts = 0, lastMessage = 0, lastCheck = 0;
        var terminalCodes = [1000, 1002, 1003, 1007, 1008, 1009];

        function clearTimers() {
            clearTimeout(deadline);
            clearTimeout(stable);
            clearInterval(watchdog);
        }

        function schedule(event) {
            if (stopped || retry !== undefined) return;
            // Jitter avoids synchronized reconnects after a server restart.
            var delay = Math.min(30000, 1000 * Math.pow(2, Math.min(attempts++, 5))
                * (0.8 + Math.random() * 0.4));
            options.disconnected(event, delay);
            retry = setTimeout(function () { retry = undefined; connect(); }, delay);
        }

        function lost(current, event) {
            if (current !== socket || stopped) return;
            clearTimers();
            socket = undefined;
            current.onopen = current.onmessage = current.onerror = current.onclose = null;
            try { current.close(4000, "Connection recovery"); } catch (error) { /* Already closed. */ }
            if (terminalCodes.indexOf(event.code) !== -1) {
                stopped = true;
                options.disconnected(event);
            } else schedule(event);
        }

        function probe() {
            if (!socket || socket.readyState !== 1) return;
            var now = Date.now();
            // Give a resumed browser a fresh response window after timer suspension.
            if (now - lastCheck > 45000) lastMessage = now;
            lastCheck = now;
            if (now - lastMessage >= 90000) {
                lost(socket, { reason: "Connection stopped responding" });
                return;
            }
            try { options.heartbeat(socket); }
            catch (error) { lost(socket, { reason: "Connection check failed" }); }
        }

        function connect() {
            if (stopped || socket || retry !== undefined) return;
            if (navigator.onLine === false) {
                schedule({ reason: "Waiting for a network connection" });
                return;
            }
            var current;
            try { current = options.create(); }
            catch (error) { schedule({ reason: "Connection failed" }); return; }
            socket = current;
            deadline = setTimeout(function () {
                lost(current, { reason: "Connection attempt timed out" });
            }, 15000);
            current.onopen = function () {
                if (socket !== current || stopped) return;
                clearTimeout(deadline);
                lastMessage = lastCheck = Date.now();
                stable = setTimeout(function () { attempts = 0; }, 30000);
                watchdog = setInterval(probe, 20000);
                options.connected(current);
            };
            current.onmessage = function (event) {
                if (socket !== current || stopped) return;
                lastMessage = Date.now();
                try { options.message(event, current); }
                catch (error) {
                    console.error("WebSocket message could not be decoded", error);
                    lost(current, { reason: "Connection data could not be decoded" });
                }
            };
            current.onerror = function () { lost(current, { reason: "Connection failed" }); };
            current.onclose = function (event) { lost(current, event); };
        }

        function wake() {
            if (stopped || document.hidden) return;
            if (socket && socket.readyState === 1) {
                lastMessage = lastCheck = Date.now();
                probe();
            } else if (!socket) {
                clearTimeout(retry);
                retry = undefined;
                connect();
            }
        }

        function offline() {
            if (socket) lost(socket, { reason: "Waiting for a network connection" });
        }

        window.addEventListener("online", wake);
        window.addEventListener("offline", offline);
        window.addEventListener("pageshow", wake);
        document.addEventListener("visibilitychange", wake);

        return {
            connect: connect,
            stop: function () {
                stopped = true;
                clearTimers();
                clearTimeout(retry);
                window.removeEventListener("online", wake);
                window.removeEventListener("offline", offline);
                window.removeEventListener("pageshow", wake);
                document.removeEventListener("visibilitychange", wake);
            },
            active: function (current) { return !stopped && socket === current; }
        };
    };
});
