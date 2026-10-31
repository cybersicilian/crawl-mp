define(["./enums"], function (enums) {
    "use strict";
    var wounds = ["MDAM_LIGHT", "MDAM_MOD", "MDAM_HEAVY", "MDAM_SEV", "MDAM_ADEAD"];
    function position(pos) { return pos && Number.isInteger(pos.x) && Number.isInteger(pos.y); }
    function create(knowledge) {
        var cells = new Map(), creatures = new Map(), limit = 16384;
        function reset() { cells.clear(); creatures.clear(); }
        function update(changed) {
            var events = [], updates = new Map(), seen = new Set();
            (changed || []).forEach(function (pos) {
                if (!position(pos)) return;
                var key = pos.x + ":" + pos.y;
                if (seen.has(key)) return;
                seen.add(key);
                var cell = knowledge.get(pos.x, pos.y), old = cells.get(key);
                var visible = knowledge.visible(cell);
                var flash = visible && Number.isInteger(cell.flc) && cell.flc > 0 && cell.flc < 16 ? cell.flc : 0;
                var next = { pos: { x: pos.x, y: pos.y }, visible: visible, flash: flash };
                if (visible && cell.mon && Number.isInteger(cell.mon.id) && cell.mon.id > 0 && cell.t
                    && cell.t.fg !== undefined) {
                    var flags = enums.prepare_fg_flags(cell.t.fg);
                    next.id = cell.mon.id; next.type = cell.mon.type;
                    next.wound = wounds.reduce(function (rank, name, index) {
                        return flags[name] ? index + 1 : rank;
                    }, 0);
                    var previous = creatures.get(next.id);
                    if (previous && previous.type === next.type && next.wound > previous.wound
                        && knowledge.visible(knowledge.get(previous.pos.x, previous.pos.y)))
                        events.push({ kind: "strike", key: "strike:" + next.id, pos: next.pos,
                            strength: next.wound - previous.wound, duration: 320 });
                }
                // Loading/returning to a visible cell establishes a baseline.
                if (old && old.visible && flash && flash !== old.flash)
                    events.push({ kind: "magic", key: "magic:" + key, pos: next.pos,
                        colour: flash, duration: 440 });
                updates.set(key, next);
            });
            function forget(cell) {
                if (cell && cell.id && creatures.get(cell.id) === cell) creatures.delete(cell.id);
            }
            // Remove old identities before adding the batch, independent of move-cell order.
            updates.forEach(function (next, key) { forget(cells.get(key)); cells.delete(key); cells.set(key, next); });
            updates.forEach(function (next) { if (next.id) creatures.set(next.id, next); });
            while (cells.size > limit) {
                var oldest = cells.keys().next().value;
                forget(cells.get(oldest)); cells.delete(oldest);
            }
            return events;
        }
        return { update: update, reset: reset };
    }
    return { create: create, position: position };
});
