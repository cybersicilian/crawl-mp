/* Bounded eight-way route search; consumers supply their own known terrain. */
define([], function () {
    "use strict";
    var directions = [
        { dx: -1, dy: -1, key: "y", arrow: "↖", numpad: "7" },
        { dx: 0, dy: -1, key: "k", arrow: "↑", numpad: "8" },
        { dx: 1, dy: -1, key: "u", arrow: "↗", numpad: "9" },
        { dx: -1, dy: 0, key: "h", arrow: "←", numpad: "4" },
        { dx: 1, dy: 0, key: "l", arrow: "→", numpad: "6" },
        { dx: -1, dy: 1, key: "b", arrow: "↙", numpad: "1" },
        { dx: 0, dy: 1, key: "j", arrow: "↓", numpad: "2" },
        { dx: 1, dy: 1, key: "n", arrow: "↘", numpad: "3" }
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
            for (var direction of directions) {
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
