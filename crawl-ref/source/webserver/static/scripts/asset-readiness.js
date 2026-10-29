/* Wait for the images and styles consumed by the view before its first layout.
 * Failed or stalled downloads get bounded retries before reporting failure. */
define([], function () {
    "use strict";

    return function waitForAssets(root, finished, failed) {
        var cancelled = false, cleanups = [], pending = 0;
        var assets = Array.prototype.filter.call(root.querySelectorAll("img[src], link[rel=stylesheet][href]"),
            function (asset) { return !!asset.getAttribute(asset.tagName === "LINK" ? "href" : "src"); });

        function cancel() {
            cancelled = true;
            cleanups.forEach(function (cleanup) { cleanup(); });
            cleanups = [];
        }

        function stop(error) {
            if (cancelled) return;
            cancel();
            failed(error);
        }

        pending = assets.length;
        assets.forEach(function (asset) {
            var attribute = asset.tagName === "LINK" ? "href" : "src";
            var original = asset[attribute], attempt = 0, timer, decoding = false;

            function available() {
                return attribute === "href" ? !!asset.sheet : asset.complete && asset.naturalWidth > 0;
            }

            function cleanup() {
                clearTimeout(timer);
                asset.removeEventListener("load", loaded);
                asset.removeEventListener("error", retry);
            }

            function done() {
                if (cancelled) return;
                cleanup();
                if (--pending === 0) {
                    cancel();
                    finished();
                }
            }

            function retry() {
                if (cancelled) return;
                cleanup();
                decoding = false;
                if (++attempt > 2) {
                    stop(new Error("Could not load game resource: " + original));
                    return;
                }
                timer = setTimeout(function () {
                    if (cancelled) return;
                    var url = new URL(original, document.baseURI);
                    url.searchParams.set("asset_retry", String(attempt));
                    listen();
                    asset[attribute] = url.href;
                }, 250 * attempt);
            }

            function loaded() {
                if (cancelled || decoding) return;
                if (!available()) { retry(); return; }
                decoding = true;
                var current = attempt;
                if (attribute === "src" && typeof asset.decode === "function") asset.decode().then(function () {
                    if (attempt === current) done();
                }, function () { if (attempt === current) retry(); });
                else done();
            }

            function listen() {
                asset.addEventListener("load", loaded);
                asset.addEventListener("error", retry);
                timer = setTimeout(retry, 30000);
            }

            cleanups.push(cleanup);
            listen();
            if (available() || (attribute === "src" && asset.complete)) loaded();
        });
        if (!assets.length) { cancel(); finished(); }
        return cancel;
    };
});
