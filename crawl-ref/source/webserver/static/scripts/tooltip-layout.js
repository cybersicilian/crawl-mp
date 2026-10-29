define([], function () {
    "use strict";
    var widths = new WeakMap();

    // Viewport geometry only. Consumers supply their own protected surfaces.
    function overlap(a, b) {
        return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    }

    function place(element, anchor, options) {
        options = options || {};
        var pad = 8, gap = 8;
        var vw = window.innerWidth, vh = window.innerHeight;
        if (!widths.has(element)) widths.set(element, element.style.width);
        element.style.width = widths.get(element);
        element.style.left = pad + "px";
        element.style.maxHeight = Math.max(1, vh - pad * 2) + "px";
        var w = element.offsetWidth, h = element.offsetHeight;
        // Fixed auto-width cards otherwise resize after changing their left edge.
        element.style.width = w + "px";
        if (w > Math.max(anchor.left - pad - gap, vw - anchor.right - pad - gap)) {
            // If it cannot fit beside the source, reserve vertical room for it.
            var free = Math.max(anchor.top - pad - gap, vh - anchor.bottom - pad - gap);
            element.style.maxHeight = Math.max(1, Math.min(vh - pad * 2, free)) + "px";
            h = element.offsetHeight;
        }
        var avoid = (options.avoid || []).filter(function (rect) { return rect.width && rect.height; });
        var candidates = [];
        function add(left, top) {
            left = Math.max(pad, Math.min(left, vw - w - pad));
            top = Math.max(pad, Math.min(top, vh - h - pad));
            var rect = { left: left, top: top, right: left + w, bottom: top + h };
            var collision = avoid.reduce(function (sum, obstacle) { return sum + overlap(rect, obstacle); }, 0);
            var score = overlap(rect, anchor) * 10000 + collision * 100;
            score += Math.abs(left - anchor.left) + Math.abs(top - anchor.top);
            candidates.push({ left: left, top: top, score: score });
        }
        function around(rect) {
            add(rect.right + gap, rect.top);
            add(rect.left - w - gap, rect.top);
            add(rect.left, rect.bottom + gap);
            add(rect.left, rect.top - h - gap);
            add(rect.right - w, rect.bottom + gap);
            add(rect.right - w, rect.top - h - gap);
        }
        around(options.edge || anchor);
        around(anchor);
        avoid.forEach(around);
        // Combine usable edges: e.g. beside a sidebar AND below a header.
        var xs = Array.from(new Set(candidates.map(function (candidate) { return candidate.left; })));
        var ys = Array.from(new Set(candidates.map(function (candidate) { return candidate.top; })));
        xs.forEach(function (left) { ys.forEach(function (top) { add(left, top); }); });
        candidates.sort(function (a, b) { return a.score - b.score; });
        var best = candidates[0];
        element.style.left = Math.round(best.left) + "px";
        element.style.top = Math.round(best.top) + "px";
        return element.getBoundingClientRect();
    }

    return { place: place, overlap: overlap };
});
