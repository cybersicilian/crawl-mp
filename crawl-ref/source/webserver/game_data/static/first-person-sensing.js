/* Generic native-authorized sensing HUD. No entity art, names or unseen terrain. */
define(["jquery", "./first-person-perception", "./map_knowledge", "mesh-camera"], function ($, perception, map, cameraMath) {
    "use strict";
    var serial = 0, limit = 24;
    var symbols = { sensed: "?", "sensed-item": "◇", "last-known": "○" };
    var labels = { sensed: "Sensed presence", "sensed-item": "Sensed item", "last-known": "Last-known invisible presence" };
    function project(camera, x, z, width, height) {
        if (!camera || ![camera.x, camera.y, camera.angle, x, z, width, height].every(Number.isFinite) || !(width > 0 && height > 0)) return null;
        var matrix = cameraMath.matrix(camera, width, height), eye = cameraMath.basis(camera).eye;
        // Sensing supplies a grid position, not an entity's height. Keep its
        // abstract marker on the viewer's eye plane instead of inventing a body.
        var point = [x + 0.5, eye[1], z + 0.5, 1], clip = [0, 0, 0, 0];
        for (var row = 0; row < 4; row++) for (var column = 0; column < 4; column++) clip[row] += matrix[column * 4 + row] * point[column];
        if (clip[3] <= 0.035) return null;
        var nx = clip[0] / clip[3], ny = clip[1] / clip[3];
        if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return null;
        var sx = (nx + 1) * width / 2, sy = (1 - ny) * height / 2;
        if (sx < 11 || sx > width - 11 || sy < 11 || sy > height - 11) return null;
        return { x: sx, y: sy, distance: Math.hypot(x + 0.5 - camera.x, z + 0.5 - camera.y) };
    }
    function create(host) {
        var document = host.ownerDocument || window.document, id = "firstPersonSensing" + (++serial);
        var root = document.createElement("div"), dirty = true, cached = [], boundsKey = "", destroyed = false;
        root.className = "first-person-sensing"; root.hidden = true;
        root.setAttribute("role", "group"); root.setAttribute("aria-label", "Sensed locations");
        host.appendChild(root);
        function invalidate() { dirty = true; }
        $(document).on("map_knowledge_changed." + id + " map_knowledge_cleared." + id + " game_init." + id, invalidate);
        function clear() { root.hidden = true; root.replaceChildren(); root.dataset.count = "0"; }
        function render(camera, width, height) {
            if (destroyed) return;
            if (!camera || !(width > 0 && height > 0)) { clear(); return; }
            var bounds = map.bounds(), key = bounds ? [bounds.left, bounds.top, bounds.right, bounds.bottom].join(":") : "";
            if (dirty || key !== boundsKey) { cached = perception.markers(map); dirty = false; boundsKey = key; }
            var visible = [];
            cached.forEach(function (marker) {
                var kind = marker.presence && marker.presence.kind;
                if (!symbols[kind]) return;
                var point = project(camera, marker.x, marker.y, width, height);
                if (point) visible.push({ kind: kind, point: point });
            });
            visible.sort(function (a, b) { return a.point.distance - b.point.distance; });
            root.replaceChildren();
            visible.slice(0, limit).forEach(function (marker) {
                var node = document.createElement("span");
                node.className = "first-person-sense " + marker.kind;
                node.textContent = symbols[marker.kind]; node.setAttribute("role", "img");
                node.setAttribute("aria-label", labels[marker.kind]); node.title = labels[marker.kind];
                node.style.left = marker.point.x / width * 100 + "%";
                node.style.top = marker.point.y / height * 100 + "%";
                root.appendChild(node);
            });
            root.dataset.count = String(Math.min(limit, visible.length)); root.hidden = !root.children.length;
        }
        return { render: render, clear: clear, destroy: function () {
            if (destroyed) return; destroyed = true; cached = [];
            $(document).off("." + id); root.remove();
        } };
    }
    return { create: create, project: project };
});
