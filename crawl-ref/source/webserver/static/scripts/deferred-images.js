/* Request optional images once per element/URL; a failed frame never retries. */
define([], function () {
    "use strict";
    function create(options) {
        options = options || {};
        var requests = new WeakMap();
        function request(image) {
            if (!image) return null;
            var desired = image.dataset.src, current = image.getAttribute("src");
            var url = desired || current;
            if (!url) return image;
            var previous = requests.get(image);
            if (previous && previous.url === url) return image;
            if (previous) previous.cleanup();
            var activate = Boolean(desired && desired !== current);
            var entry = { url: url, cleanup: cleanup };
            function cleanup() {
                image.removeEventListener("load", loaded);
                image.removeEventListener("error", failed);
            }
            function finish(callback) {
                if (requests.get(image) !== entry || image.getAttribute("src") !== url) return;
                cleanup();
                if (callback) callback(image);
            }
            function loaded() { finish(image.naturalWidth > 0 ? options.onLoad : options.onError); }
            function failed() { finish(options.onError); }
            requests.set(image, entry);
            if (!activate && image.complete) return image;
            image.addEventListener("load", loaded);
            image.addEventListener("error", failed);
            if (activate) image.src = desired;
            return image;
        }
        return { request: request };
    }
    return { create: create };
});
