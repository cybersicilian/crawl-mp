/* A bounded round-trip sampler independent of rendering and game commands. */
define([], function () {
    "use strict";
    return function (changed) {
        var socket, interval, pending, sequence = 0, samples = [];
        function report(status) {
            var last = samples[samples.length - 1], jitter = 0;
            for (var i = 1; i < samples.length; i++) jitter += Math.abs(samples[i] - samples[i - 1]);
            changed({ status: status, milliseconds: last,
                jitter: samples.length > 1 ? jitter / (samples.length - 1) : 0,
                bufferedBytes: socket ? socket.bufferedAmount || 0 : 0 });
        }
        function probe() {
            if (!socket || socket.readyState !== 1 || document.hidden) return;
            if (pending && performance.now() - pending.start < 5000) return;
            if (pending) report("waiting");
            pending = { sequence: ++sequence, start: performance.now() };
            try { socket.send(JSON.stringify({ msg: "latency_probe", sequence: sequence })); }
            catch (error) { pending = null; report("disconnected"); }
        }
        function stop() {
            clearInterval(interval); interval = undefined; socket = undefined; pending = null;
        }
        return {
            start: function (current) {
                stop(); socket = current; samples = []; report("measuring");
                probe(); interval = setInterval(probe, 5000);
            },
            stop: function () { stop(); samples = []; report("disconnected"); },
            probe: probe,
            receive: function (message) {
                if (!pending || message.sequence !== pending.sequence) return true;
                var elapsed = performance.now() - pending.start;
                pending = null;
                if (document.hidden || elapsed >= 5000) { report("waiting"); return true; }
                samples.push(elapsed); if (samples.length > 20) samples.shift();
                report("connected"); return true;
            }
        };
    };
});
