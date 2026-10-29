/* Bounded eight-way route search; consumers supply their own known terrain. */
define([], function () {
    "use strict";
    var directions = [
        { dx: -1, dy: -1, key: "y", arrow: "↖", numpad: "7", name: "Northwest", navigation: "Home" },
        { dx: 0, dy: -1, key: "k", arrow: "↑", numpad: "8", name: "North", navigation: "ArrowUp" },
        { dx: 1, dy: -1, key: "u", arrow: "↗", numpad: "9", name: "Northeast", navigation: "PageUp" },
        { dx: -1, dy: 0, key: "h", arrow: "←", numpad: "4", name: "West", navigation: "ArrowLeft" },
        { dx: 1, dy: 0, key: "l", arrow: "→", numpad: "6", name: "East", navigation: "ArrowRight" },
        { dx: -1, dy: 1, key: "b", arrow: "↙", numpad: "1", name: "Southwest", navigation: "End" },
        { dx: 0, dy: 1, key: "j", arrow: "↓", numpad: "2", name: "South", navigation: "ArrowDown" },
        { dx: 1, dy: 1, key: "n", arrow: "↘", numpad: "3", name: "Southeast", navigation: "PageDown" }
    ];
    function key(point) { return point.x + "," + point.y; }
    function equal(a, b) { return a && b && a.x === b.x && a.y === b.y; }
    function route(start, end, passable, limit) {
        if (!start || !end || ![start.x, start.y, end.x, end.y].every(Number.isInteger)) return null;
        limit = Math.min(32, limit === undefined ? 32 : Math.max(0, limit));
        if (equal(start, end)) return [];
        if (!passable(end)) return null;
        var frontier = [{ point: start, path: [] }], seen = new Set([key(start)]);
        for (var index = 0; index < frontier.length && index < 4096; index++) {
            var current = frontier[index];
            if (current.path.length >= limit) continue;
            var ordered = directions.slice().sort(function (a, b) {
                function distance(entry) { return Math.pow(end.x - current.point.x - entry.dx, 2)
                    + Math.pow(end.y - current.point.y - entry.dy, 2); }
                return distance(a) - distance(b);
            });
            for (var direction of ordered) {
                var next = { x: current.point.x + direction.dx, y: current.point.y + direction.dy };
                if (seen.has(key(next)) || !passable(next)) continue;
                if (direction.dx && direction.dy
                    && (!passable({ x: next.x, y: current.point.y }) || !passable({ x: current.point.x, y: next.y }))) continue;
                seen.add(key(next));
                var path = current.path.concat([{ point: next, direction: direction }]);
                if (equal(next, end)) return path;
                frontier.push({ point: next, path: path });
            }
        }
        return null;
    }
    return { directions: directions, route: route, equal: equal };
});
